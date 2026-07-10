"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";

function revalidarFinanciero() {
  revalidatePath("/financiero");
  revalidatePath("/");
}

export async function guardarCuenta(datos: {
  id?: number;
  nombre: string;
  banco?: string;
  numero_cuenta?: string;
  saldo_inicial: number;
  activa: boolean;
}) {
  await requierePermiso("financiero");
  if (!datos.nombre?.trim()) throw new Error("El nombre de la cuenta es obligatorio.");
  const fila = {
    nombre: datos.nombre.trim(),
    banco: datos.banco?.trim() || null,
    numero_cuenta: datos.numero_cuenta?.trim() || null,
    saldo_inicial: Number(datos.saldo_inicial) || 0,
    activa: datos.activa,
  };
  if (datos.id) {
    const { error } = await db().from("cuentas_bancarias").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from("cuentas_bancarias").insert(fila);
    if (error) throw new Error(error.message);
  }
  revalidarFinanciero();
}

export async function registrarMovimientoManual(datos: {
  cuenta_id: number;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha?: string;
  concepto?: string;
}) {
  const sesion = await requierePermiso("financiero");
  if (!datos.cuenta_id) throw new Error("Selecciona una cuenta.");
  if (!(Number(datos.monto) > 0)) throw new Error("El monto debe ser mayor a cero.");
  const { error } = await db().from("movimientos_bancarios").insert({
    cuenta_id: datos.cuenta_id,
    tipo: datos.tipo,
    origen: "manual",
    monto: Number(datos.monto),
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    concepto: datos.concepto?.trim() || null,
    usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  revalidarFinanciero();
}

export async function transferir(datos: {
  origen: number;
  destino: number;
  monto: number;
  fecha?: string;
  concepto?: string;
}) {
  const sesion = await requierePermiso("financiero");
  const { error } = await db().rpc("transferir_cuentas", {
    p_origen: datos.origen,
    p_destino: datos.destino,
    p_monto: Number(datos.monto),
    p_fecha: datos.fecha || null,
    p_concepto: datos.concepto?.trim() || "Transferencia",
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  revalidarFinanciero();
}

export async function crearGasto(datos: {
  fecha?: string;
  tipo: "Gasto" | "Costo";
  categoria?: string;
  proveedor?: string;
  descripcion?: string;
  monto: number;
  pagarAhora?: boolean;
  cuenta_id?: number;
}) {
  const sesion = await requierePermiso("financiero");
  const monto = Number(datos.monto) || 0;
  if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (datos.pagarAhora && !datos.cuenta_id) throw new Error("Selecciona la cuenta desde donde se paga.");

  const { data: gasto, error } = await db().from("gastos").insert({
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    tipo: datos.tipo,
    categoria: datos.categoria?.trim() || null,
    proveedor: datos.proveedor?.trim() || null,
    descripcion: datos.descripcion?.trim() || null,
    monto,
    abonado: 0,
    saldo: monto,
    estado: "Pendiente",
    usuario: sesion.usuario,
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (datos.pagarAhora && datos.cuenta_id) {
    const { error: e2 } = await db().rpc("pagar_gasto", {
      p_gasto_id: gasto.id,
      p_cuenta_id: datos.cuenta_id,
      p_monto: monto,
      p_fecha: datos.fecha || null,
      p_comentario: "Pago inmediato al causar",
      p_usuario: sesion.usuario,
    });
    if (e2) throw new Error(e2.message);
  }
  revalidarFinanciero();
}

export async function pagarGasto(datos: {
  gasto_id: number;
  cuenta_id: number;
  monto: number;
  fecha?: string;
  comentario?: string;
}) {
  const sesion = await requierePermiso("financiero");
  const { error } = await db().rpc("pagar_gasto", {
    p_gasto_id: datos.gasto_id,
    p_cuenta_id: datos.cuenta_id,
    p_monto: Number(datos.monto),
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  revalidarFinanciero();
}
