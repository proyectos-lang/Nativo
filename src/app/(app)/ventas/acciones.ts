"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";

export type LineaVenta = {
  producto: string;
  cantidad: number;
  valor_unitario: number;
  talla?: string;
  color?: string;
  sexo?: string;
  estampado?: string;
  bordado?: string;
  guia_estampado?: string;
  guia_bordado?: string;
};

export type NuevaVenta = {
  cliente_id: number;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
  lineas: LineaVenta[];
  abono: number;
  estado_pago?: string;
  medio_pago?: string;
  tipo_pago?: string;
  fecha_pago?: string;
  estado_entrega?: string;
  fecha_entrega?: string;
  observaciones_pago?: string;
};

export async function registrarVenta(venta: NuevaVenta) {
  const sesion = await requierePermiso("ventas");
  if (!venta.cliente_id) throw new Error("Selecciona un cliente.");
  const lineas = (venta.lineas || []).filter(l => l.producto?.trim());
  if (!lineas.length) throw new Error("Agrega al menos un producto.");

  // Ticket siguiente de la secuencia normal (los tickets de 6 dígitos son históricos migrados)
  const { data: maxData, error: errMax } = await db()
    .from("ventas").select("ticket").lt("ticket", 100000)
    .order("ticket", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const ticket = ((maxData?.[0]?.ticket as number) || 0) + 1;

  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0);
  const abono = Number(venta.abono) || 0;

  const { data: cab, error: errCab } = await db().from("ventas").insert({
    ticket,
    fecha: new Date().toISOString().slice(0, 10),
    cliente_id: venta.cliente_id,
    canal_venta: venta.canal_venta || null,
    campana: venta.campana || null,
    vendedora: venta.vendedora || null,
    profesional: venta.profesional || null,
    motivo_compra: venta.motivo_compra || null,
    total_compra: total,
    retencion: 0,
    total_a_pagar: total,
    abono,
    saldo: total - abono,
    estado_pago: venta.estado_pago || (abono >= total && total > 0 ? "Pagado Total" : abono > 0 ? "Abonado" : "Pendiente"),
    fecha_pago: venta.fecha_pago || null,
    tipo_pago: venta.tipo_pago || null,
    medio_pago: venta.medio_pago || null,
    observaciones_pago: venta.observaciones_pago || null,
    estado_entrega: venta.estado_entrega || "En Proceso",
    fecha_entrega: venta.fecha_entrega || null,
  }).select("id, ticket").single();
  if (errCab) throw new Error(errCab.message);

  const { error: errDet } = await db().from("ventas_detalle").insert(
    lineas.map(l => ({
      venta_id: cab.id,
      producto: l.producto.trim(),
      cantidad: Number(l.cantidad) || 1,
      valor_unitario: Number(l.valor_unitario) || 0,
      valor_total: (Number(l.cantidad) || 1) * (Number(l.valor_unitario) || 0),
      talla: l.talla || null, color: l.color || null, sexo: l.sexo || null,
      estampado: l.estampado || null, bordado: l.bordado || null,
      guia_estampado: l.guia_estampado || null, guia_bordado: l.guia_bordado || null,
    }))
  );
  if (errDet) {
    await db().from("ventas").delete().eq("id", cab.id); // rollback manual de la cabecera
    throw new Error(errDet.message);
  }

  if (abono > 0) {
    await db().from("pagos").insert({
      venta_id: cab.id,
      fecha: venta.fecha_pago || new Date().toISOString().slice(0, 10),
      abono, retencion: 0,
      comentario: "Abono inicial al registrar la venta",
      usuario: sesion.usuario,
    });
  }

  // Registrar productos nuevos en el catálogo
  for (const l of lineas) {
    await db().from("productos").upsert({ nombre: l.producto.trim() }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  revalidatePath("/ventas");
  revalidatePath("/");
  return { ticket: cab.ticket as number };
}

export async function actualizarVenta(datos: {
  venta_id: number;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
  fecha_entrega?: string;
  lineas: LineaVenta[];
}) {
  await requierePermiso("ventas");
  const lineas = (datos.lineas || []).filter(l => l.producto?.trim());
  if (!lineas.length) throw new Error("La venta debe tener al menos un producto.");

  const { data: venta, error: errGet } = await db()
    .from("ventas").select("id, ticket, retencion, abono").eq("id", datos.venta_id).single();
  if (errGet) throw new Error(errGet.message);

  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0);
  const totalAPagar = total - Number(venta.retencion || 0);
  const saldo = totalAPagar - Number(venta.abono || 0);

  // Reemplaza el detalle completo
  const { error: errDel } = await db().from("ventas_detalle").delete().eq("venta_id", datos.venta_id);
  if (errDel) throw new Error(errDel.message);
  const { error: errIns } = await db().from("ventas_detalle").insert(
    lineas.map(l => ({
      venta_id: datos.venta_id,
      producto: l.producto.trim(),
      cantidad: Number(l.cantidad) || 1,
      valor_unitario: Number(l.valor_unitario) || 0,
      valor_total: (Number(l.cantidad) || 1) * (Number(l.valor_unitario) || 0),
      talla: l.talla || null, color: l.color || null, sexo: l.sexo || null,
      estampado: l.estampado || null, bordado: l.bordado || null,
      guia_estampado: l.guia_estampado || null, guia_bordado: l.guia_bordado || null,
    }))
  );
  if (errIns) throw new Error(errIns.message);

  const { error: errUpd } = await db().from("ventas").update({
    canal_venta: datos.canal_venta || null,
    campana: datos.campana || null,
    vendedora: datos.vendedora || null,
    profesional: datos.profesional || null,
    motivo_compra: datos.motivo_compra || null,
    fecha_entrega: datos.fecha_entrega || null,
    total_compra: total,
    total_a_pagar: totalAPagar,
    saldo,
    estado_pago: saldo <= 0 && total > 0 ? "Pagado Total" : Number(venta.abono) > 0 ? "Abonado" : "Pendiente",
  }).eq("id", datos.venta_id);
  if (errUpd) throw new Error(errUpd.message);

  for (const l of lineas) {
    await db().from("productos").upsert({ nombre: l.producto.trim() }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  revalidatePath("/ventas");
  revalidatePath("/pagos");
  revalidatePath("/");
  return { ticket: venta.ticket as number };
}

export async function crearCliente(datos: {
  nombre: string; cedula_nit?: string; empresa?: string; contacto?: string;
  ciudad?: string; departamento?: string; direccion?: string; correo?: string; rut?: string;
}) {
  await requierePermiso("ventas");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  if (datos.cedula_nit?.trim()) {
    const { data: dup } = await db().from("clientes").select("id").eq("cedula_nit", datos.cedula_nit.trim()).maybeSingle();
    if (dup) throw new Error("Ya existe un cliente con esa cédula/NIT.");
  }
  const { data, error } = await db().from("clientes").insert({
    nombre: datos.nombre.trim(),
    cedula_nit: datos.cedula_nit?.trim() || null,
    empresa: datos.empresa?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    correo: datos.correo?.trim() || null,
    rut: datos.rut?.trim() || null,
  }).select().single();
  if (error) throw new Error(error.message);
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  return data;
}
