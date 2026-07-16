"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { formatoPesos } from "@/lib/tipos";
import { revalidatePath } from "next/cache";

function revalidarDevoluciones() {
  revalidatePath("/devoluciones");
  revalidatePath("/");
}

export type ItemDevolucion = {
  ventas_detalle_id: number;
  cantidad_devuelta: number;
  causal: string;
  observacion?: string;
  recuperable: boolean;
};

export async function crearDevolucion(datos: {
  venta_id: number;
  comentario?: string;
  items: ItemDevolucion[];
}) {
  const sesion = await requierePermiso("devoluciones");
  const items = (datos.items || []).filter(i => i.ventas_detalle_id && Number(i.cantidad_devuelta) > 0);
  if (!items.length) throw new Error("Selecciona al menos una prenda a devolver.");

  const idsLinea = items.map(i => i.ventas_detalle_id);
  const [{ data: lineasVenta, error: errLineas }, { data: previas, error: errPrevias }, { data: venta, error: errVenta }] = await Promise.all([
    db().from("ventas_detalle").select("id, producto, talla, color, valor_unitario, cantidad").in("id", idsLinea),
    db().from("devoluciones_detalle").select("ventas_detalle_id, cantidad_devuelta").in("ventas_detalle_id", idsLinea),
    db().from("ventas").select("id, ticket").eq("id", datos.venta_id).single(),
  ]);
  if (errLineas) throw new Error(errLineas.message);
  if (errPrevias) throw new Error(errPrevias.message);
  if (errVenta) throw new Error(errVenta.message);

  const yaDevuelto = new Map<number, number>();
  for (const p of previas || []) {
    yaDevuelto.set(p.ventas_detalle_id, (yaDevuelto.get(p.ventas_detalle_id) || 0) + Number(p.cantidad_devuelta));
  }

  const filasDetalle = items.map(it => {
    const linea = lineasVenta?.find(l => l.id === it.ventas_detalle_id);
    if (!linea) throw new Error(`La línea ${it.ventas_detalle_id} no pertenece a esta venta.`);
    const disponible = Number(linea.cantidad) - (yaDevuelto.get(it.ventas_detalle_id) || 0);
    if (Number(it.cantidad_devuelta) > disponible) {
      throw new Error(`No puedes devolver más de ${disponible} unidad(es) de "${linea.producto}" (ya hay devoluciones registradas sobre esa línea).`);
    }
    return {
      ventas_detalle_id: linea.id as number,
      producto: linea.producto as string,
      talla: linea.talla as string | null,
      color: linea.color as string | null,
      valor_unitario: Number(linea.valor_unitario) || 0,
      cantidad_devuelta: Number(it.cantidad_devuelta),
      causal: it.causal?.trim() || null,
      observacion: it.observacion?.trim() || null,
      recuperable: !!it.recuperable,
      estado: "Pendiente",
    };
  });

  const { data: cab, error: errCab } = await db().from("devoluciones").insert({
    venta_id: datos.venta_id,
    comentario: datos.comentario?.trim() || null,
    usuario: sesion.usuario,
  }).select("id").single();
  if (errCab) throw new Error(errCab.message);

  const { data: detallesInsertados, error: errDet } = await db()
    .from("devoluciones_detalle")
    .insert(filasDetalle.map(f => ({ ...f, devolucion_id: cab.id })))
    .select("id");
  if (errDet) {
    await db().from("devoluciones").delete().eq("id", cab.id);
    throw new Error(errDet.message);
  }

  const filasHistorial = (detallesInsertados || []).map(d => ({
    devolucion_detalle_id: d.id, estado_anterior: null, estado_nuevo: "Pendiente", usuario: sesion.usuario,
  }));
  if (filasHistorial.length) await db().from("devoluciones_historial").insert(filasHistorial);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "devoluciones", accion: "crear",
    entidad_tipo: "devoluciones", entidad_id: cab.id,
    descripcion: `Devolución registrada — Ticket #${venta.ticket} (${items.length} prenda${items.length > 1 ? "s" : ""})`,
    datos_nuevos: { venta_id: datos.venta_id, ticket: venta.ticket, items: filasDetalle },
  });

  revalidarDevoluciones();
  revalidatePath("/ventas");
  return { id: cab.id as number, ticket: venta.ticket as number };
}

export async function enviarAReproceso(detalleId: number, comentario?: string) {
  const sesion = await requierePermiso("devoluciones");
  const { data: detalle, error: errGet } = await db()
    .from("devoluciones_detalle")
    .select("id, estado, recuperable, producto, devoluciones(ventas(ticket))")
    .eq("id", detalleId).single();
  if (errGet) throw new Error(errGet.message);
  if (!detalle) throw new Error("Detalle de devolución no encontrado.");
  if (["Recuperada", "Perdida"].includes(detalle.estado)) throw new Error("Esta prenda ya fue resuelta.");
  if (!detalle.recuperable) throw new Error("Esta prenda no fue marcada como recuperable; resuélvela como pérdida.");

  const estadoAnterior = detalle.estado;
  const { error: errUpd } = await db().from("devoluciones_detalle").update({ estado: "En Reproceso" }).eq("id", detalleId);
  if (errUpd) throw new Error(errUpd.message);
  await db().from("devoluciones_historial").insert({
    devolucion_detalle_id: detalleId, estado_anterior: estadoAnterior, estado_nuevo: "En Reproceso",
    comentario: comentario?.trim() || null, usuario: sesion.usuario,
  });

  const ticket = (detalle as { devoluciones?: { ventas?: { ticket?: number } } }).devoluciones?.ventas?.ticket;
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "devoluciones", accion: "cambiar_estado",
    entidad_tipo: "devoluciones_detalle", entidad_id: detalleId,
    descripcion: `Devolución Ticket #${ticket} — "${detalle.producto}" enviada a reproceso`,
    datos_nuevos: { estado_anterior: estadoAnterior, estado_nuevo: "En Reproceso", comentario },
  });

  revalidarDevoluciones();
}

export async function resolverRecuperada(datos: {
  detalle_id: number;
  costo_recuperacion: number;
  comentario?: string;
  tipo_gasto?: "Gasto" | "Costo";
  pagarAhora?: boolean;
  cuenta_id?: number;
}) {
  const sesion = await requierePermiso("devoluciones");
  if (datos.pagarAhora && !datos.cuenta_id) throw new Error("Selecciona la cuenta desde donde se paga.");
  const costo = Number(datos.costo_recuperacion) || 0;
  if (costo < 0) throw new Error("El costo de recuperación no puede ser negativo.");

  const { data: detalle, error: errGet } = await db()
    .from("devoluciones_detalle")
    .select("id, estado, producto, devoluciones(ventas(ticket))")
    .eq("id", datos.detalle_id).single();
  if (errGet) throw new Error(errGet.message);
  if (!detalle) throw new Error("Detalle de devolución no encontrado.");
  if (["Recuperada", "Perdida"].includes(detalle.estado)) throw new Error("Esta prenda ya fue resuelta.");

  const ticket = (detalle as { devoluciones?: { ventas?: { ticket?: number } } }).devoluciones?.ventas?.ticket;
  let gastoId: number | null = null;
  let ticketGasto: number | null = null;

  if (costo > 0) {
    // Réplica mínima de crearGasto() de financiero/acciones.ts, gateada solo por permiso "devoluciones"
    // (no se puede llamar crearGasto directamente porque exige requierePermiso("financiero")).
    const { data: maxData, error: errMax } = await db().from("gastos").select("ticket").order("ticket", { ascending: false }).limit(1);
    if (errMax) throw new Error(errMax.message);
    const ticketGastoNuevo = ((maxData?.[0]?.ticket as number) || 0) + 1;
    const fecha = new Date().toISOString().slice(0, 10);

    const { data: gasto, error: errGasto } = await db().from("gastos").insert({
      ticket: ticketGastoNuevo, fecha, tipo: datos.tipo_gasto || "Costo", categoria: "Reproceso",
      proveedor_id: null, proveedor: null, numero_factura: null,
      monto: costo, abonado: 0, saldo: costo, estado: "Pendiente", usuario: sesion.usuario,
    }).select("id, ticket").single();
    if (errGasto) throw new Error(errGasto.message);

    const articulo = `Reproceso - ${detalle.producto} (Ticket #${ticket})`;
    const { error: errDet } = await db().from("gastos_detalle").insert({
      gasto_id: gasto.id, cantidad: 1, unidad_medida: null, articulo, precio_unitario: costo, valor_total: costo,
    });
    if (errDet) {
      await db().from("gastos").delete().eq("id", gasto.id);
      throw new Error(errDet.message);
    }

    if (datos.pagarAhora && datos.cuenta_id) {
      const { error: errPago } = await db().rpc("pagar_gasto", {
        p_gasto_id: gasto.id, p_cuenta_id: datos.cuenta_id, p_monto: costo,
        p_fecha: fecha, p_comentario: "Pago inmediato de reproceso", p_usuario: sesion.usuario,
      });
      if (errPago) throw new Error("El gasto de reproceso se creó pero falló el pago: " + errPago.message);
    }
    gastoId = gasto.id;
    ticketGasto = gasto.ticket;
  }

  const estadoAnterior = detalle.estado;
  const { error: errUpd } = await db().from("devoluciones_detalle")
    .update({ estado: "Recuperada", costo_recuperacion: costo, gasto_id: gastoId })
    .eq("id", datos.detalle_id);
  if (errUpd) throw new Error(errUpd.message);

  await db().from("devoluciones_historial").insert({
    devolucion_detalle_id: datos.detalle_id, estado_anterior: estadoAnterior, estado_nuevo: "Recuperada",
    comentario: datos.comentario?.trim() || null, usuario: sesion.usuario,
  });

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "devoluciones", accion: "resolver_recuperada",
    entidad_tipo: "devoluciones_detalle", entidad_id: datos.detalle_id,
    descripcion: `Devolución Ticket #${ticket} — "${detalle.producto}" recuperada${ticketGasto ? ` (Gasto #${ticketGasto} — ${formatoPesos(costo)})` : ""}`,
    datos_nuevos: { ...datos, gasto_id: gastoId },
  });

  revalidarDevoluciones();
  revalidatePath("/financiero");
}

export async function resolverPerdida(datos: {
  detalle_id: number;
  cuenta_id_reembolso?: number;
  comentario?: string;
}) {
  const sesion = await requierePermiso("devoluciones");
  const { data: detalle, error: errGet } = await db()
    .from("devoluciones_detalle")
    .select("id, estado, producto, valor_unitario, cantidad_devuelta, devoluciones(ventas(ticket))")
    .eq("id", datos.detalle_id).single();
  if (errGet) throw new Error(errGet.message);
  if (!detalle) throw new Error("Detalle de devolución no encontrado.");
  if (["Recuperada", "Perdida"].includes(detalle.estado)) throw new Error("Esta prenda ya fue resuelta.");

  const valorPerdido = Number(detalle.valor_unitario) * Number(detalle.cantidad_devuelta);
  const ticket = (detalle as { devoluciones?: { ventas?: { ticket?: number } } }).devoluciones?.ventas?.ticket;

  const { data: venta, error } = await db().rpc("registrar_devolucion_perdida", {
    p_devolucion_detalle_id: datos.detalle_id,
    p_valor_perdido: valorPerdido,
    p_cuenta_id: datos.cuenta_id_reembolso || null,
    p_fecha: new Date().toISOString().slice(0, 10),
    p_comentario: datos.comentario?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "devoluciones", accion: "resolver_perdida",
    entidad_tipo: "devoluciones_detalle", entidad_id: datos.detalle_id,
    descripcion: `Devolución Ticket #${ticket} — "${detalle.producto}" perdida (${formatoPesos(valorPerdido)})`,
    datos_nuevos: { ...datos, valor_perdido: valorPerdido, venta_resultante: venta },
  });

  revalidarDevoluciones();
  revalidatePath("/ventas");
  revalidatePath("/financiero");
  return venta;
}
