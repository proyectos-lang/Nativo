"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarPin } from "@/lib/pin";
import { registrarBitacora } from "@/lib/bitacora";
import { formatoPesos } from "@/lib/tipos";
import { revalidatePath } from "next/cache";

function revalidarCompras() {
  revalidatePath("/compras");
  revalidatePath("/inventario");
  revalidatePath("/financiero");
  revalidatePath("/");
}

export type LineaOrdenCompra = {
  producto_id: number;
  producto: string;
  cantidad: number;
  precio_unitario: number;
};

export async function guardarOrdenCompra(datos: {
  id?: number;
  proveedor_id: number;
  proveedor: string;
  fecha?: string;
  fecha_esperada?: string;
  observaciones?: string;
  lineas: LineaOrdenCompra[];
}) {
  const sesion = await requierePermiso("compras");
  if (!datos.proveedor_id) throw new Error("Selecciona un proveedor.");
  const lineas = (datos.lineas || []).filter(l => l.producto_id && Number(l.cantidad) > 0);
  if (!lineas.length) throw new Error("Agrega al menos un producto con cantidad.");

  const total = lineas.reduce((s, l) => s + Number(l.cantidad) * (Number(l.precio_unitario) || 0), 0);
  const filasDetalle = lineas.map(l => ({
    producto_id: l.producto_id,
    producto: l.producto,
    cantidad: Number(l.cantidad),
    precio_unitario: Number(l.precio_unitario) || 0,
    valor_total: Number(l.cantidad) * (Number(l.precio_unitario) || 0),
  }));

  if (datos.id) {
    const { data: anterior, error: errGet } = await db().from("ordenes_compra").select("*").eq("id", datos.id).single();
    if (errGet) throw new Error(errGet.message);
    if (anterior.estado !== "Borrador") throw new Error(`Solo se pueden editar órdenes en Borrador (esta está "${anterior.estado}").`);

    const { error: errUpd } = await db().from("ordenes_compra").update({
      proveedor_id: datos.proveedor_id,
      proveedor: datos.proveedor?.trim() || null,
      fecha: datos.fecha || anterior.fecha,
      fecha_esperada: datos.fecha_esperada || null,
      observaciones: datos.observaciones?.trim() || null,
      total,
    }).eq("id", datos.id);
    if (errUpd) throw new Error(errUpd.message);

    const { error: errDel } = await db().from("ordenes_compra_detalle").delete().eq("orden_compra_id", datos.id);
    if (errDel) throw new Error(errDel.message);
    const { error: errIns } = await db().from("ordenes_compra_detalle")
      .insert(filasDetalle.map(f => ({ ...f, orden_compra_id: datos.id })));
    if (errIns) throw new Error(errIns.message);

    await registrarBitacora({
      usuario: sesion.usuario, modulo: "compras", accion: "editar",
      entidad_tipo: "ordenes_compra", entidad_id: datos.id,
      descripcion: `Orden de compra #${anterior.numero} editada — ${formatoPesos(total)}`,
      datos_anteriores: anterior, datos_nuevos: { ...datos, total, lineas: filasDetalle },
    });
    revalidarCompras();
    return { numero: anterior.numero as number };
  }

  const { data: maxData, error: errMax } = await db().from("ordenes_compra").select("numero").order("numero", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const numero = ((maxData?.[0]?.numero as number) || 0) + 1;

  const { data: oc, error } = await db().from("ordenes_compra").insert({
    numero,
    fecha: datos.fecha || new Date().toISOString().slice(0, 10),
    proveedor_id: datos.proveedor_id,
    proveedor: datos.proveedor?.trim() || null,
    estado: "Borrador",
    fecha_esperada: datos.fecha_esperada || null,
    observaciones: datos.observaciones?.trim() || null,
    total,
    usuario: sesion.usuario,
  }).select("id, numero").single();
  if (error) throw new Error(error.message);

  const { error: errDet } = await db().from("ordenes_compra_detalle")
    .insert(filasDetalle.map(f => ({ ...f, orden_compra_id: oc.id })));
  if (errDet) {
    await db().from("ordenes_compra").delete().eq("id", oc.id);
    throw new Error(errDet.message);
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "compras", accion: "crear",
    entidad_tipo: "ordenes_compra", entidad_id: oc.id,
    descripcion: `Orden de compra #${numero} creada — ${formatoPesos(total)}`,
    datos_nuevos: { ...datos, numero, total, lineas: filasDetalle },
  });
  revalidarCompras();
  return { numero: oc.numero as number };
}

export async function cambiarEstadoOrden(id: number, estado: "Enviada" | "Anulada", pin?: string) {
  const sesion = await requierePermiso("compras");
  const { data: oc, error: errGet } = await db().from("ordenes_compra").select("*").eq("id", id).single();
  if (errGet) throw new Error(errGet.message);

  if (estado === "Enviada") {
    if (oc.estado !== "Borrador") throw new Error("Solo un Borrador se puede marcar como Enviada.");
  } else {
    await verificarPin(pin);
    if (!["Borrador", "Enviada"].includes(oc.estado)) throw new Error(`No se puede anular una orden en estado "${oc.estado}".`);
    const { data: recibidas } = await db().from("ordenes_compra_detalle")
      .select("id").eq("orden_compra_id", id).gt("cantidad_recibida", 0).limit(1);
    if (recibidas?.length) throw new Error("No se puede anular: la orden ya tiene mercancía recibida.");
  }

  const { error } = await db().from("ordenes_compra").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "compras", accion: "cambiar_estado",
    entidad_tipo: "ordenes_compra", entidad_id: id,
    descripcion: `Orden de compra #${oc.numero} — ${estado}`,
    datos_anteriores: { estado: oc.estado }, datos_nuevos: { estado },
  });
  revalidarCompras();
}

export async function recibirOrden(datos: {
  orden_id: number;
  numero_factura?: string;
  fecha?: string;
  crear_gasto?: boolean;
  lineas: { detalle_id: number; cantidad: number; ubicacion_id: number; lote?: string }[];
}) {
  const sesion = await requierePermiso("compras");
  const lineas = (datos.lineas || []).filter(l => Number(l.cantidad) > 0);
  if (!lineas.length) throw new Error("Indica al menos una cantidad a recibir.");

  const { data, error } = await db().rpc("recibir_orden_compra", {
    p_orden_id: datos.orden_id,
    p_lineas: lineas.map(l => ({
      detalle_id: l.detalle_id,
      cantidad: Number(l.cantidad),
      ubicacion_id: l.ubicacion_id,
      lote: l.lote?.trim() || null,
    })),
    p_numero_factura: datos.numero_factura?.trim() || null,
    p_fecha: datos.fecha || null,
    p_usuario: sesion.usuario,
    p_crear_gasto: datos.crear_gasto !== false,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "compras", accion: "crear",
    entidad_tipo: "ordenes_compra", entidad_id: datos.orden_id,
    descripcion: `Recepción de OC #${data?.numero} (${lineas.length} línea${lineas.length > 1 ? "s" : ""}) — estado: ${data?.estado}`,
    datos_nuevos: { ...datos, orden_resultante: data },
  });
  revalidarCompras();
  return data;
}
