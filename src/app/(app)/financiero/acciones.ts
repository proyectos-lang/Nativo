"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarPinContadora } from "@/lib/pin";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { formatoPesos } from "@/lib/tipos";
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
  const sesion = await requierePermiso("financiero");
  if (!datos.nombre?.trim()) throw new Error("El nombre de la cuenta es obligatorio.");
  const fila = {
    nombre: datos.nombre.trim(),
    banco: datos.banco?.trim() || null,
    numero_cuenta: datos.numero_cuenta?.trim() || null,
    saldo_inicial: Number(datos.saldo_inicial) || 0,
    activa: datos.activa,
  };
  if (datos.id) {
    const { data: anterior } = await db().from("cuentas_bancarias").select("*").eq("id", datos.id).single();
    const { error } = await db().from("cuentas_bancarias").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "financiero", accion: "editar",
      entidad_tipo: "cuentas_bancarias", entidad_id: datos.id,
      descripcion: `Cuenta bancaria: ${fila.nombre}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
  } else {
    const { data: nueva, error } = await db().from("cuentas_bancarias").insert(fila).select("id").single();
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "financiero", accion: "crear",
      entidad_tipo: "cuentas_bancarias", entidad_id: nueva.id,
      descripcion: `Cuenta bancaria: ${fila.nombre}`,
      datos_nuevos: fila,
    });
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
  const fila = {
    cuenta_id: datos.cuenta_id,
    tipo: datos.tipo,
    origen: "manual",
    monto: Number(datos.monto),
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    concepto: datos.concepto?.trim() || null,
    usuario: sesion.usuario,
  };
  const { data, error } = await db().from("movimientos_bancarios").insert(fila).select("id").single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "crear",
    entidad_tipo: "movimientos_bancarios", entidad_id: data.id,
    descripcion: `Movimiento manual (${datos.tipo}) en cuenta #${datos.cuenta_id} — ${formatoPesos(datos.monto)}`,
    datos_nuevos: fila,
  });
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
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "transferir",
    entidad_tipo: "cuentas_bancarias", entidad_id: datos.origen,
    descripcion: `Transferencia de cuenta #${datos.origen} a cuenta #${datos.destino} — ${formatoPesos(datos.monto)}`,
    datos_nuevos: datos,
  });
  revalidarFinanciero();
}

export type LineaGasto = { cantidad: number; unidad_medida?: string; articulo: string; precio_unitario: number };

function filaDetalleGasto(gastoId: number, l: LineaGasto) {
  return {
    gasto_id: gastoId,
    cantidad: Number(l.cantidad) || 1,
    unidad_medida: l.unidad_medida?.trim() || null,
    articulo: l.articulo.trim(),
    precio_unitario: Number(l.precio_unitario) || 0,
    valor_total: (Number(l.cantidad) || 1) * (Number(l.precio_unitario) || 0),
  };
}

export async function crearGasto(datos: {
  fecha?: string;
  tipo: "Gasto" | "Costo";
  categoria?: string;
  proveedor_id?: number | null;
  proveedor?: string;
  numero_factura?: string;
  lineas: LineaGasto[];
  pagarAhora?: boolean;
  cuenta_id?: number;
}) {
  const sesion = await requierePermiso("financiero");
  const lineas = (datos.lineas || []).filter(l => l.articulo?.trim());
  if (!lineas.length) throw new Error("Agrega al menos un artículo.");
  const monto = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);
  if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (datos.pagarAhora && !datos.cuenta_id) throw new Error("Selecciona la cuenta desde donde se paga.");

  const { data: maxData, error: errMax } = await db().from("gastos").select("ticket").order("ticket", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const ticket = ((maxData?.[0]?.ticket as number) || 0) + 1;

  const { data: gasto, error } = await db().from("gastos").insert({
    ticket,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    tipo: datos.tipo,
    categoria: datos.categoria?.trim() || null,
    proveedor_id: datos.proveedor_id || null,
    proveedor: datos.proveedor?.trim() || null,
    numero_factura: datos.numero_factura?.trim() || null,
    monto,
    abonado: 0,
    saldo: monto,
    estado: "Pendiente",
    usuario: sesion.usuario,
  }).select("id, ticket").single();
  if (error) throw new Error(error.message);

  const { error: errDet } = await db().from("gastos_detalle").insert(lineas.map(l => filaDetalleGasto(gasto.id, l)));
  if (errDet) {
    await db().from("gastos").delete().eq("id", gasto.id);
    throw new Error(errDet.message);
  }

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

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "crear",
    entidad_tipo: "gastos", entidad_id: gasto.id,
    descripcion: descripcionTicket(datos.tipo, gasto.ticket, monto),
    datos_nuevos: { ...datos, ticket: gasto.ticket, monto, lineas },
  });

  revalidarFinanciero();
  revalidatePath("/proveedores");
  return { ticket: gasto.ticket as number };
}

export async function editarGasto(datos: {
  gasto_id: number;
  clave_contadora: string;
  fecha?: string;
  tipo: "Gasto" | "Costo";
  categoria?: string;
  proveedor_id?: number | null;
  proveedor?: string;
  numero_factura?: string;
  lineas: LineaGasto[];
  motivo?: string;
}) {
  const sesion = await requierePermiso("financiero");
  await verificarPinContadora(datos.clave_contadora);
  const lineas = (datos.lineas || []).filter(l => l.articulo?.trim());
  if (!lineas.length) throw new Error("El gasto debe tener al menos un artículo.");
  const nuevoMonto = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0);

  const { data: anterior, error: errGet } = await db().from("gastos").select("*").eq("id", datos.gasto_id).single();
  if (errGet) throw new Error(errGet.message);
  const { data: lineasAnteriores } = await db().from("gastos_detalle").select("*").eq("gasto_id", datos.gasto_id);
  if (nuevoMonto < Number(anterior.abonado)) {
    throw new Error(`El nuevo monto no puede ser menor a lo ya abonado (${anterior.abonado}).`);
  }

  const { error: errDel } = await db().from("gastos_detalle").delete().eq("gasto_id", datos.gasto_id);
  if (errDel) throw new Error(errDel.message);
  const nuevasLineas = lineas.map(l => filaDetalleGasto(datos.gasto_id, l));
  const { error: errIns } = await db().from("gastos_detalle").insert(nuevasLineas);
  if (errIns) throw new Error(errIns.message);

  const nuevaFila = {
    fecha: datos.fecha || anterior.fecha,
    tipo: datos.tipo,
    categoria: datos.categoria?.trim() || null,
    proveedor_id: datos.proveedor_id || null,
    proveedor: datos.proveedor?.trim() || null,
    numero_factura: datos.numero_factura?.trim() || null,
    monto: nuevoMonto,
    saldo: nuevoMonto - Number(anterior.abonado),
    estado: nuevoMonto - Number(anterior.abonado) <= 0 ? "Pagado" : Number(anterior.abonado) > 0 ? "Abonado" : "Pendiente",
  };
  const { error: errUpd } = await db().from("gastos").update(nuevaFila).eq("id", datos.gasto_id);
  if (errUpd) throw new Error(errUpd.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "editar",
    entidad_tipo: "gastos", entidad_id: datos.gasto_id,
    descripcion: descripcionTicket("Gasto", anterior.ticket, nuevoMonto),
    datos_anteriores: { ...anterior, lineas: lineasAnteriores || [] },
    datos_nuevos: { ...anterior, ...nuevaFila, lineas: nuevasLineas },
    motivo: datos.motivo?.trim() || null,
  });
  revalidarFinanciero();
}

export async function crearProveedor(datos: {
  nombre: string; nit?: string; contacto?: string; correo?: string; ciudad?: string; departamento?: string; direccion?: string;
}) {
  const sesion = await requierePermiso("financiero");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  const fila = {
    nombre: datos.nombre.trim(),
    nit: datos.nit?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    correo: datos.correo?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
  };
  const { data, error } = await db().from("proveedores").insert(fila).select().single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "proveedores", accion: "crear",
    entidad_tipo: "proveedores", entidad_id: data.id,
    descripcion: `Proveedor creado: ${fila.nombre}`,
    datos_nuevos: fila,
  });
  revalidatePath("/financiero");
  revalidatePath("/proveedores");
  return data;
}

export async function crearClienteDesdeFinanciero(datos: {
  nombre: string; cedula_nit?: string; empresa?: string; contacto?: string; correo?: string; ciudad?: string;
}) {
  const sesion = await requierePermiso("financiero");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  if (datos.cedula_nit?.trim()) {
    const { data: dup } = await db().from("clientes").select("id").eq("cedula_nit", datos.cedula_nit.trim()).maybeSingle();
    if (dup) throw new Error("Ya existe un cliente con esa cédula/NIT.");
  }
  const fila = {
    nombre: datos.nombre.trim(),
    cedula_nit: datos.cedula_nit?.trim() || null,
    empresa: datos.empresa?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    correo: datos.correo?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
  };
  const { data, error } = await db().from("clientes").insert(fila).select().single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "clientes", accion: "crear",
    entidad_tipo: "clientes", entidad_id: data.id,
    descripcion: `Cliente creado: ${fila.nombre}`,
    datos_nuevos: fila,
  });
  revalidatePath("/financiero");
  revalidatePath("/clientes");
  revalidatePath("/ventas");
  return data;
}

export async function crearCategoriaGasto(valor: string) {
  const sesion = await requierePermiso("financiero");
  const limpio = valor?.trim();
  if (!limpio) throw new Error("El nombre de la categoría es obligatorio.");
  const { data, error } = await db().from("listas_maestras").insert({ tipo: "categoria_gasto", valor: limpio }).select("id").single();
  if (error) {
    if (error.message.includes("duplicate")) throw new Error("Esa categoría ya existe.");
    throw new Error(error.message);
  }
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "crear",
    entidad_tipo: "listas_maestras", entidad_id: data.id,
    descripcion: `Categoría de gasto creada: ${limpio}`,
    datos_nuevos: { tipo: "categoria_gasto", valor: limpio },
  });
  revalidarFinanciero();
  revalidatePath("/configuracion");
}

export async function pagarGasto(datos: {
  gasto_id: number;
  cuenta_id: number;
  monto: number;
  fecha?: string;
  comentario?: string;
}) {
  const sesion = await requierePermiso("financiero");
  const { data, error } = await db().rpc("pagar_gasto", {
    p_gasto_id: datos.gasto_id,
    p_cuenta_id: datos.cuenta_id,
    p_monto: Number(datos.monto),
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "pagar",
    entidad_tipo: "gastos", entidad_id: datos.gasto_id,
    descripcion: descripcionTicket("Pago Gasto", data.ticket, datos.monto),
    datos_nuevos: { ...datos, gasto_resultante: data },
  });
  revalidarFinanciero();
}

// ------------------------------------------------------------
// INGRESOS (espejo de gastos, sin líneas múltiples)
// ------------------------------------------------------------

const TIPOS_INGRESO = ["Abono a Factura", "Cancela Factura", "Otro"] as const;
const ESTADOS_FACTURACION = ["Pendiente de Facturar", "Facturado", "No Aplica"] as const;

export async function crearIngreso(datos: {
  fecha?: string;
  categoria?: string;
  concepto?: string;
  cliente_id?: number | null;
  cliente?: string;
  tipo_ingreso?: string;
  estado_facturacion?: string;
  numero_factura?: string;
  monto: number;
  cobrarAhora?: boolean;
  cuenta_id?: number;
}) {
  const sesion = await requierePermiso("financiero");
  const monto = Number(datos.monto) || 0;
  if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (datos.cobrarAhora && !datos.cuenta_id) throw new Error("Selecciona la cuenta donde se recibe el ingreso.");
  if (datos.tipo_ingreso && !TIPOS_INGRESO.includes(datos.tipo_ingreso as typeof TIPOS_INGRESO[number])) {
    throw new Error("Tipo de ingreso inválido.");
  }
  const estadoFacturacion = datos.estado_facturacion?.trim() || "No Aplica";
  if (!ESTADOS_FACTURACION.includes(estadoFacturacion as typeof ESTADOS_FACTURACION[number])) {
    throw new Error("Estado de facturación inválido.");
  }

  const { data: maxData, error: errMax } = await db().from("ingresos").select("ticket").order("ticket", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const ticket = ((maxData?.[0]?.ticket as number) || 0) + 1;

  const { data: ingreso, error } = await db().from("ingresos").insert({
    ticket,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    categoria: datos.categoria?.trim() || null,
    concepto: datos.concepto?.trim() || null,
    cliente_id: datos.cliente_id || null,
    cliente: datos.cliente?.trim() || null,
    tipo_ingreso: datos.tipo_ingreso?.trim() || null,
    estado_facturacion: estadoFacturacion,
    numero_factura: datos.numero_factura?.trim() || null,
    monto,
    cobrado: 0,
    saldo: monto,
    estado: "Pendiente",
    usuario: sesion.usuario,
  }).select("id, ticket").single();
  if (error) throw new Error(error.message);

  if (datos.cobrarAhora && datos.cuenta_id) {
    const { error: e2 } = await db().rpc("cobrar_ingreso", {
      p_ingreso_id: ingreso.id,
      p_cuenta_id: datos.cuenta_id,
      p_monto: monto,
      p_fecha: datos.fecha || null,
      p_comentario: "Cobro inmediato al causar",
      p_usuario: sesion.usuario,
    });
    if (e2) throw new Error(e2.message);
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "crear",
    entidad_tipo: "ingresos", entidad_id: ingreso.id,
    descripcion: descripcionTicket("Ingreso", ingreso.ticket, monto),
    datos_nuevos: { ...datos, ticket: ingreso.ticket, monto },
  });

  revalidarFinanciero();
  return { ticket: ingreso.ticket as number };
}

export async function editarIngreso(datos: {
  ingreso_id: number;
  clave_contadora: string;
  fecha?: string;
  categoria?: string;
  concepto?: string;
  cliente_id?: number | null;
  cliente?: string;
  tipo_ingreso?: string;
  monto: number;
  motivo?: string;
}) {
  const sesion = await requierePermiso("financiero");
  await verificarPinContadora(datos.clave_contadora);
  const nuevoMonto = Number(datos.monto) || 0;
  if (nuevoMonto <= 0) throw new Error("El monto debe ser mayor a cero.");
  if (datos.tipo_ingreso && !TIPOS_INGRESO.includes(datos.tipo_ingreso as typeof TIPOS_INGRESO[number])) {
    throw new Error("Tipo de ingreso inválido.");
  }

  const { data: anterior, error: errGet } = await db().from("ingresos").select("*").eq("id", datos.ingreso_id).single();
  if (errGet) throw new Error(errGet.message);
  if (nuevoMonto < Number(anterior.cobrado)) {
    throw new Error(`El nuevo monto no puede ser menor a lo ya cobrado (${anterior.cobrado}).`);
  }

  const nuevaFila = {
    fecha: datos.fecha || anterior.fecha,
    categoria: datos.categoria?.trim() || null,
    concepto: datos.concepto?.trim() || null,
    cliente_id: datos.cliente_id || null,
    cliente: datos.cliente?.trim() || null,
    tipo_ingreso: datos.tipo_ingreso?.trim() || null,
    monto: nuevoMonto,
    saldo: nuevoMonto - Number(anterior.cobrado),
    estado: nuevoMonto - Number(anterior.cobrado) <= 0 ? "Cobrado" : Number(anterior.cobrado) > 0 ? "Abonado" : "Pendiente",
  };
  const { error: errUpd } = await db().from("ingresos").update(nuevaFila).eq("id", datos.ingreso_id);
  if (errUpd) throw new Error(errUpd.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "editar",
    entidad_tipo: "ingresos", entidad_id: datos.ingreso_id,
    descripcion: descripcionTicket("Ingreso", anterior.ticket, nuevoMonto),
    datos_anteriores: anterior,
    datos_nuevos: { ...anterior, ...nuevaFila },
    motivo: datos.motivo?.trim() || null,
  });
  revalidarFinanciero();
}

export async function cobrarIngreso(datos: {
  ingreso_id: number;
  cuenta_id: number;
  monto: number;
  fecha?: string;
  comentario?: string;
}) {
  const sesion = await requierePermiso("financiero");
  const { data, error } = await db().rpc("cobrar_ingreso", {
    p_ingreso_id: datos.ingreso_id,
    p_cuenta_id: datos.cuenta_id,
    p_monto: Number(datos.monto),
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "cobrar",
    entidad_tipo: "ingresos", entidad_id: datos.ingreso_id,
    descripcion: descripcionTicket("Cobro Ingreso", data.ticket, datos.monto),
    datos_nuevos: { ...datos, ingreso_resultante: data },
  });
  revalidarFinanciero();
}

export async function crearCategoriaIngreso(valor: string) {
  const sesion = await requierePermiso("financiero");
  const limpio = valor?.trim();
  if (!limpio) throw new Error("El nombre de la categoría es obligatorio.");
  const { data, error } = await db().from("listas_maestras").insert({ tipo: "categoria_ingreso", valor: limpio }).select("id").single();
  if (error) {
    if (error.message.includes("duplicate")) throw new Error("Esa categoría ya existe.");
    throw new Error(error.message);
  }
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "crear",
    entidad_tipo: "listas_maestras", entidad_id: data.id,
    descripcion: `Categoría de ingreso creada: ${limpio}`,
    datos_nuevos: { tipo: "categoria_ingreso", valor: limpio },
  });
  revalidarFinanciero();
  revalidatePath("/configuracion");
}

export async function actualizarFacturacionIngreso(datos: {
  ingreso_id: number;
  estado_facturacion: string;
  numero_factura?: string;
}) {
  const sesion = await requierePermiso("financiero");
  if (!ESTADOS_FACTURACION.includes(datos.estado_facturacion as typeof ESTADOS_FACTURACION[number])) {
    throw new Error("Estado de facturación inválido.");
  }

  const { data: anterior, error: errGet } = await db().from("ingresos").select("*").eq("id", datos.ingreso_id).single();
  if (errGet) throw new Error(errGet.message);

  const nuevaFila = {
    estado_facturacion: datos.estado_facturacion,
    numero_factura: datos.numero_factura?.trim() || null,
  };
  const { error: errUpd } = await db().from("ingresos").update(nuevaFila).eq("id", datos.ingreso_id);
  if (errUpd) throw new Error(errUpd.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "financiero", accion: "actualizar_facturacion",
    entidad_tipo: "ingresos", entidad_id: datos.ingreso_id,
    descripcion: descripcionTicket("Facturación Ingreso", anterior.ticket),
    datos_anteriores: { estado_facturacion: anterior.estado_facturacion, numero_factura: anterior.numero_factura },
    datos_nuevos: { ...anterior, ...nuevaFila },
  });
  revalidarFinanciero();
}
