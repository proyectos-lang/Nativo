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
