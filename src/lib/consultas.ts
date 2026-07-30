import "server-only";
import { db } from "./db";

/** Listas maestras ACTIVAS agrupadas por tipo (para los selectores de la app). */
export async function listasMaestras(): Promise<Record<string, string[]>> {
  const { data, error } = await db().from("listas_maestras").select("tipo, valor").eq("activo", true).order("valor");
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

export async function activosTodos() {
  const { data, error } = await db().from("activos").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

/** Usuarios activos (id + nombre) para selectores de asignación. */
export async function usuariosActivos() {
  const { data, error } = await db().from("usuarios").select("id, nombre").eq("activo", true).order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

// ------------------------------------------------------------
// SOLICITUDES INTERNAS
// ------------------------------------------------------------
const ESTADOS_SOLICITUD_ACTIVOS = ["Pendiente", "En proceso", "Esperando información", "Esperando aprobación"];

export async function solicitudesTodas() {
  const { data, error } = await db().from("solicitudes").select("*").order("fecha_creacion", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function solicitudesHistorialPorSolicitud(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("solicitudes_historial").select("*").order("fecha");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const h of data || []) {
    if (!out[h.solicitud_id]) out[h.solicitud_id] = [];
    out[h.solicitud_id].push(h);
  }
  return out;
}

export async function solicitudesAdjuntosPorSolicitud(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("solicitudes_adjuntos").select("*").order("creado_en");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const a of data || []) {
    if (!out[a.solicitud_id]) out[a.solicitud_id] = [];
    out[a.solicitud_id].push(a);
  }
  return out;
}

/** Conteo liviano de solicitudes activas asignadas a un usuario (badge/insight). Best-effort: 0 si la tabla aún no existe. */
export async function solicitudesPendientesDe(usuarioId: number): Promise<number> {
  try {
    const { count, error } = await db()
      .from("solicitudes")
      .select("id", { count: "exact", head: true })
      .eq("responsable_id", usuarioId)
      .in("estado", ESTADOS_SOLICITUD_ACTIVOS);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------
// NOTIFICACIONES (campanita)
// Best-effort: si la migración 025 aún no corre, devuelven vacío
// en vez de tumbar el layout, que se renderiza en cada página.
// ------------------------------------------------------------
export async function notificacionesDe(usuarioId: number, limite = 20) {
  try {
    const { data, error } = await db()
      .from("notificaciones")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("creado_en", { ascending: false })
      .limit(limite);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function notificacionesNoLeidas(usuarioId: number): Promise<number> {
  try {
    const { count, error } = await db()
      .from("notificaciones")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("leida", false);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/** Resumen liviano de solicitudes activas del usuario (para insights del dashboard). Best-effort. */
export async function solicitudesResumenDe(usuarioId: number) {
  try {
    const { data, error } = await db()
      .from("solicitudes")
      .select("id, titulo, estado, fecha_limite, responsable_id, solicitado_por_id")
      .in("estado", ESTADOS_SOLICITUD_ACTIVOS)
      .or(`responsable_id.eq.${usuarioId},solicitado_por_id.eq.${usuarioId}`);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
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

/** Resuelve el cliente/proveedor al que se le causó un movimiento bancario. */
type MovimientoAnidado = Record<string, unknown> & {
  pagos?: { ventas?: { ticket?: number; clientes?: { nombre?: string } | null } | null } | null;
  pagos_gastos?: { gastos?: { proveedor?: string | null; numero_factura?: string | null; proveedores?: { nombre?: string } | null } | null } | null;
  pagos_ingresos?: { ingresos?: { cliente?: string | null; numero_factura?: string | null; clientes?: { nombre?: string } | null } | null } | null;
  ventas?: { ticket?: number; clientes?: { nombre?: string } | null } | null;
};

function aplanarTercero(m: MovimientoAnidado) {
  const { pagos, pagos_gastos, pagos_ingresos, ventas, ...plano } = m;
  let tercero: string | null = null;
  let factura: string | null = null;

  if (pagos?.ventas) {
    tercero = pagos.ventas.clientes?.nombre || (pagos.ventas.ticket ? `Ticket #${pagos.ventas.ticket}` : null);
  } else if (pagos_gastos?.gastos) {
    tercero = pagos_gastos.gastos.proveedores?.nombre || pagos_gastos.gastos.proveedor || null;
    factura = pagos_gastos.gastos.numero_factura || null;
  } else if (pagos_ingresos?.ingresos) {
    tercero = pagos_ingresos.ingresos.clientes?.nombre || pagos_ingresos.ingresos.cliente || null;
    factura = pagos_ingresos.ingresos.numero_factura || null;
  } else if (ventas) {
    const nombre = ventas.clientes?.nombre;
    tercero = nombre ? `${nombre}${ventas.ticket ? ` (Ticket #${ventas.ticket})` : ""}` : (ventas.ticket ? `Ticket #${ventas.ticket}` : null);
  }
  return { ...plano, tercero, factura };
}

/**
 * Movimientos bancarios con el tercero (cliente/proveedor) resuelto por su origen.
 * Si el embed falla —p. ej. porque falta correr la migración 022— se degrada al
 * listado plano en vez de tumbar todo el módulo Financiero.
 */
export async function movimientosBancarios() {
  try {
    const { data, error } = await db()
      .from("movimientos_bancarios")
      .select(`*,
        pagos:pago_id(ventas(ticket, clientes(nombre))),
        pagos_gastos:pago_gasto_id(gastos(proveedor, numero_factura, proveedores(nombre))),
        pagos_ingresos:pago_ingreso_id(ingresos(cliente, numero_factura, clientes(nombre))),
        ventas:venta_id(ticket, clientes(nombre))`)
      .order("fecha", { ascending: false }).order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(m => aplanarTercero(m as MovimientoAnidado));
  } catch (e) {
    console.error("[financiero] movimientos sin tercero (¿falta la migración 022?):", (e as Error).message);
    const { data, error } = await db()
      .from("movimientos_bancarios").select("*")
      .order("fecha", { ascending: false }).order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(m => ({ ...m, tercero: null, factura: null }));
  }
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

// ------------------------------------------------------------
// COSTOS Y RECETAS (explosión de materiales)
// ------------------------------------------------------------

/** Inventario de insumos completo (activos e inactivos), ordenado por nombre. */
export async function insumosTodos() {
  const { data, error } = await db().from("insumos").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Últimos movimientos de insumos. El libro crece indefinidamente, así que se
 * pagina igual que el kardex de productos.
 */
export async function movimientosInsumos(limite = 300) {
  const { data, error } = await db().from("insumos_movimientos")
    .select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Recetas con sus líneas agrupadas por producto_id. */
export async function recetasConMateriales(): Promise<Record<number, { receta: unknown; lineas: unknown[] }>> {
  const [{ data: recetas, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    db().from("recetas").select("*"),
    db().from("recetas_materiales").select("*").order("id"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const porReceta: Record<number, unknown[]> = {};
  for (const l of lineas || []) {
    if (!porReceta[l.receta_id]) porReceta[l.receta_id] = [];
    porReceta[l.receta_id].push(l);
  }
  const out: Record<number, { receta: unknown; lineas: unknown[] }> = {};
  for (const r of recetas || []) out[r.producto_id] = { receta: r, lineas: porReceta[r.id] || [] };
  return out;
}

/**
 * Costo unitario de receta indexado por NOMBRE de producto. `ventas_detalle` no
 * guarda `producto_id` (enlaza por texto), así que este mapa es lo que permite
 * calcular la utilidad de ventas anteriores al congelado del costo.
 * Best-effort: si la migración 026 aún no corrió, devuelve vacío.
 */
export async function costosPorNombreProducto(): Promise<Record<string, number>> {
  try {
    const { data, error } = await db().from("recetas").select("costo_total, productos(nombre)");
    if (error) return {};
    const out: Record<string, number> = {};
    for (const r of data || []) {
      const nombre = (r as { productos?: { nombre?: string } | null }).productos?.nombre;
      if (nombre) out[nombre] = Number(r.costo_total) || 0;
    }
    return out;
  } catch {
    return {};
  }
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

/**
 * Info liviana del catálogo para el formulario de ventas: disponible = físico − reservado.
 * Es una consulta SECUNDARIA (solo alimenta el badge de disponibilidad): si el inventario
 * no está disponible en la BD, se degrada a lista vacía en vez de tumbar el render de Ventas.
 */
export async function catalogoVentaInventario() {
  try {
    const [{ data: prods, error: e1 }, { data: exis, error: e2 }, { data: resv, error: e3 }] = await Promise.all([
      db().from("productos").select("id, nombre, sku, es_servicio, controla_inventario").eq("estado", "Activo"),
      db().from("inventario_existencias").select("producto_id, cantidad"),
      db().from("inventario_reservas").select("producto_id, cantidad, cantidad_pendiente").eq("estado", "Activa"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);

    const fisico: Record<number, number> = {};
    for (const e of exis || []) fisico[e.producto_id] = (fisico[e.producto_id] || 0) + Number(e.cantidad);
    const reservado: Record<number, number> = {};
    for (const r of resv || []) reservado[r.producto_id] = (reservado[r.producto_id] || 0) + (Number(r.cantidad) - Number(r.cantidad_pendiente));

    return (prods || []).map(p => ({
      nombre: p.nombre as string,
      sku: (p.sku as string) || null,
      es_servicio: !!p.es_servicio,
      controla_inventario: !!p.controla_inventario,
      disponible: (fisico[p.id] || 0) - (reservado[p.id] || 0),
    }));
  } catch (e) {
    console.error("[catalogoVentaInventario] no se pudo cargar el inventario de ventas:", (e as Error).message);
    return [];
  }
}

/** Movimientos de inventario de los últimos N meses (solo campos de análisis) — para gráficos y reportes de rotación. */
export async function movimientosInventarioResumen(meses = 12) {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);
  const { data, error } = await db()
    .from("inventario_movimientos")
    .select("tipo, producto_id, producto, cantidad, costo_unitario, fecha, usuario, motivo, referencia")
    .gte("fecha", desde.toISOString())
    .order("fecha");
  if (error) throw new Error(error.message);
  return data || [];
}

/** Todas las reservas (histórico) — para el reporte de ventas sin inventario. */
export async function reservasInventarioTodas() {
  const { data, error } = await db().from("inventario_reservas").select("*").order("creado_en", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Resumen liviano de alertas de inventario para los insights del dashboard principal. */
export async function alertasInventario() {
  const [{ data: prods }, { data: exis }, { data: resv }, { data: conf }, { data: arq }] = await Promise.all([
    db().from("productos").select("id, stock_minimo, stock_maximo, fecha_vencimiento").eq("controla_inventario", true).eq("estado", "Activo"),
    db().from("inventario_existencias").select("producto_id, cantidad"),
    db().from("inventario_reservas").select("cantidad_pendiente, creado_en").eq("estado", "Activa").gt("cantidad_pendiente", 0),
    db().from("configuracion_sistema").select("frecuencia_conteo").limit(1).maybeSingle(),
    db().from("arqueos").select("fecha_cierre").eq("estado", "Cerrado").order("fecha_cierre", { ascending: false }).limit(1),
  ]);

  const fisico: Record<number, number> = {};
  for (const e of exis || []) fisico[e.producto_id] = (fisico[e.producto_id] || 0) + Number(e.cantidad);

  let agotados = 0, bajoMinimo = 0;
  const hoy = new Date();
  const limiteVencer = new Date(hoy); limiteVencer.setDate(limiteVencer.getDate() + 30);
  let proximosVencer = 0;
  for (const p of prods || []) {
    const stock = fisico[p.id] || 0;
    if (stock <= 0) agotados++;
    else if (stock <= Number(p.stock_minimo)) bajoMinimo++;
    if (p.fecha_vencimiento && p.fecha_vencimiento <= limiteVencer.toISOString().slice(0, 10) && stock > 0) proximosVencer++;
  }

  const pendientes = resv || [];
  const masAntigua = pendientes.length
    ? Math.floor((Date.now() - new Date(pendientes.reduce((min, r) => (r.creado_en < min ? r.creado_en : min), pendientes[0].creado_en)).getTime()) / 86400000)
    : 0;

  const frecuencia = (conf?.frecuencia_conteo as string) || null;
  const diasFrecuencia: Record<string, number> = { Mensual: 30, Trimestral: 90, Semestral: 180, Anual: 365 };
  const ultimoCierre = arq?.[0]?.fecha_cierre as string | undefined;
  const diasSinConteo = ultimoCierre ? Math.floor((Date.now() - new Date(ultimoCierre).getTime()) / 86400000) : null;
  const conteoVencido = !!frecuencia && (diasSinConteo == null || diasSinConteo > (diasFrecuencia[frecuencia] || 9999));

  return {
    totalInventariados: (prods || []).length,
    agotados,
    bajoMinimo,
    proximosVencer,
    pendientesSurtir: pendientes.length,
    pendienteMasAntiguaDias: masAntigua,
    frecuenciaConteo: frecuencia,
    diasSinConteo,
    conteoVencido,
  };
}

export async function arqueosTodos() {
  const { data, error } = await db().from("arqueos").select("*").order("numero", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function arqueosDetallePorArqueo(): Promise<Record<number, unknown[]>> {
  const { data, error } = await db().from("arqueos_detalle").select("*").order("producto");
  if (error) throw new Error(error.message);
  const out: Record<number, unknown[]> = {};
  for (const d of data || []) {
    if (!out[d.arqueo_id]) out[d.arqueo_id] = [];
    out[d.arqueo_id].push(d);
  }
  return out;
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
