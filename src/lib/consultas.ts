import "server-only";
import { db } from "./db";

/** Todas las listas maestras agrupadas por tipo. */
export async function listasMaestras(): Promise<Record<string, string[]>> {
  const { data, error } = await db().from("listas_maestras").select("tipo, valor").order("valor");
  if (error) throw new Error(error.message);
  const out: Record<string, string[]> = {};
  for (const f of data || []) {
    if (!out[f.tipo]) out[f.tipo] = [];
    out[f.tipo].push(f.valor);
  }
  return out;
}

export async function clientesTodos() {
  const { data, error } = await db().from("clientes").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

/** Solo clientes activos — usada en Ventas para que uno desactivado no aparezca en el selector. */
export async function clientesActivos() {
  const { data, error } = await db().from("clientes").select("*").eq("activo", true).order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function proveedoresTodos() {
  const { data, error } = await db().from("proveedores").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function productosTodos(): Promise<string[]> {
  const { data, error } = await db().from("productos").select("nombre").order("nombre");
  if (error) throw new Error(error.message);
  return (data || []).map(p => p.nombre);
}

/** Ventas con el cliente embebido, más recientes primero. */
export async function ventasConCliente() {
  const { data, error } = await db()
    .from("ventas")
    .select("*, clientes(id, nombre, empresa, contacto, ciudad)")
    .order("ticket", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function detallesPorVenta(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("ventas_detalle").select("*").order("id");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.venta_id]) out[d.venta_id] = [];
    out[d.venta_id].push(d);
  }
  return out;
}

/** Igual que ventasConCliente, pero sin columnas monetarias — para roles que no deben ver montos (ej. Entregas para no-admin). */
export async function ventasConClienteSinMontos() {
  const { data, error } = await db()
    .from("ventas")
    .select(`
      id, ticket, fecha, cliente_id, canal_venta, campana, vendedora, profesional, motivo_compra,
      estado_pago, fecha_pago, tipo_pago, medio_pago, observaciones_pago, estado_entrega, fecha_entrega,
      fecha_entrega_real, transportadora, numero_guia, comentario_entrega, ubicacion_actual, creado_en,
      clientes(id, nombre, empresa, contacto, ciudad)
    `)
    .order("ticket", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

/** Igual que detallesPorVenta, pero sin columnas monetarias. */
export async function detallesPorVentaSinMontos(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db()
    .from("ventas_detalle")
    .select(`
      id, venta_id, producto, codigo_producto, cantidad, talla, color, sexo, estampado, bordado,
      guia_estampado, guia_bordado, imagen_estampado_url, imagen_bordado_url, listo
    `)
    .order("id");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.venta_id]) out[d.venta_id] = [];
    out[d.venta_id].push(d);
  }
  return out;
}

export async function pagosPorVenta(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("pagos").select("*").order("creado_en");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const p of data || []) {
    if (!out[p.venta_id]) out[p.venta_id] = [];
    out[p.venta_id].push(p);
  }
  return out;
}

/** Cuentas bancarias con su saldo actual calculado desde los movimientos. */
export async function cuentasConSaldo() {
  const [{ data: cuentas, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
    db().from("cuentas_bancarias").select("*").order("nombre"),
    db().from("movimientos_bancarios").select("cuenta_id, tipo, monto"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const delta: Record<number, number> = {};
  for (const m of movs || []) {
    delta[m.cuenta_id] = (delta[m.cuenta_id] || 0) + (m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto));
  }
  return (cuentas || []).map(c => ({ ...c, saldo_actual: Number(c.saldo_inicial) + (delta[c.id] || 0) }));
}

export async function movimientosBancarios() {
  const { data, error } = await db()
    .from("movimientos_bancarios").select("*")
    .order("fecha", { ascending: false }).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function gastosTodos() {
  const { data, error } = await db().from("gastos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function pagosGastosPorGasto(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("pagos_gastos").select("*").order("creado_en");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const p of data || []) {
    if (!out[p.gasto_id]) out[p.gasto_id] = [];
    out[p.gasto_id].push(p);
  }
  return out;
}

export async function prospectosTodos() {
  const { data, error } = await db().from("prospectos").select("*").order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function historialPorVenta(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("historial_entregas").select("*").order("fecha");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const h of data || []) {
    if (!out[h.venta_id]) out[h.venta_id] = [];
    out[h.venta_id].push(h);
  }
  return out;
}

// ------------------------------------------------------------
// INVENTARIO
// ------------------------------------------------------------

/** Catálogo completo de productos (todas las columnas del inventario). */
export async function productosCatalogo() {
  const { data, error } = await db().from("productos").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function ubicacionesInventario() {
  const { data, error } = await db().from("inventario_ubicaciones").select("*").order("id");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function existenciasInventario() {
  const { data, error } = await db().from("inventario_existencias").select("*");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function reservasInventarioActivas() {
  const { data, error } = await db().from("inventario_reservas").select("*").eq("estado", "Activa").order("creado_en");
  if (error) throw new Error(error.message);
  return data || [];
}

/** Kardex con límite (la tabla crece indefinidamente — nunca traerla completa). */
export async function movimientosInventario(limite = 500) {
  const { data, error } = await db()
    .from("inventario_movimientos").select("*")
    .order("fecha", { ascending: false }).order("id", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function ordenesCompra() {
  const { data, error } = await db().from("ordenes_compra").select("*").order("numero", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function ordenesCompraDetallePorOrden(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("ordenes_compra_detalle").select("*").order("id");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.orden_compra_id]) out[d.orden_compra_id] = [];
    out[d.orden_compra_id].push(d);
  }
  return out;
}

export async function devolucionesTodas() {
  const { data, error } = await db().from("devoluciones").select("*").order("creado_en", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function devolucionesDetallePorDevolucion(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("devoluciones_detalle").select("*").order("id");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.devolucion_id]) out[d.devolucion_id] = [];
    out[d.devolucion_id].push(d);
  }
  return out;
}

export async function devolucionesHistorialPorDetalle(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("devoluciones_historial").select("*").order("fecha");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const h of data || []) {
    if (!out[h.devolucion_detalle_id]) out[h.devolucion_detalle_id] = [];
    out[h.devolucion_detalle_id].push(h);
  }
  return out;
}

/** Conteo liviano para el KPI/insight del dashboard: solo prendas sin resolver. */
export async function devolucionesDetallePendientes() {
  const { data, error } = await db()
    .from("devoluciones_detalle")
    .select("id, estado, creado_en")
    .in("estado", ["Pendiente", "En Reproceso"]);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function gastosDetallePorGasto(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("gastos_detalle").select("*").order("id");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.gasto_id]) out[d.gasto_id] = [];
    out[d.gasto_id].push(d);
  }
  return out;
}

export async function ingresosTodos() {
  const { data, error } = await db().from("ingresos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function pagosIngresosPorIngreso(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("pagos_ingresos").select("*").order("creado_en");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const p of data || []) {
    if (!out[p.ingreso_id]) out[p.ingreso_id] = [];
    out[p.ingreso_id].push(p);
  }
  return out;
}

export async function auditoriaPorTabla(tabla: "gastos" | "ingresos", acciones: string[] = ["editar"]): Promise<Record<number, unknown[]>> {
  const { data, error } = await db()
    .from("bitacora").select("*")
    .eq("tabla_afectada", tabla).in("accion", acciones).order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const a of data || []) {
    if (!out[a.registro_id]) out[a.registro_id] = [];
    out[a.registro_id].push(a);
  }
  return out;
}

/** Bitácora completa del sistema, sin límite ni filtro de fecha (uso: módulo Trazabilidad, solo admin). */
export async function bitacoraTodos() {
  const { data, error } = await db().from("bitacora").select("*").order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
