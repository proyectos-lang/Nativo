"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

export async function actualizarEntrega(datos: {
  venta_id: number;
  estado_nuevo: string;
  comentario?: string;
  fecha_entrega_real?: string;
  transportadora?: string;
  numero_guia?: string;
  ubicacion?: string;
}) {
  const sesion = await requierePermiso("entregas");
  if (!datos.estado_nuevo?.trim()) throw new Error("Selecciona un estado.");

  const { data, error } = await db().rpc("actualizar_entrega", {
    p_venta_id: datos.venta_id,
    p_estado_nuevo: datos.estado_nuevo,
    p_comentario: datos.comentario || null,
    p_usuario: sesion.usuario,
    p_fecha_entrega_real: datos.fecha_entrega_real || null,
    p_transportadora: datos.transportadora || null,
    p_numero_guia: datos.numero_guia || null,
    p_ubicacion: datos.ubicacion || null,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "entregas", accion: "cambiar_estado",
    entidad_tipo: "ventas", entidad_id: datos.venta_id,
    descripcion: `Entrega Venta #${data?.ticket} → ${datos.estado_nuevo}`,
    datos_nuevos: { ...datos, venta_resultante: data },
  });

  revalidatePath("/entregas");
  revalidatePath("/seguimiento");
  revalidatePath("/");
  return data;
}

export async function marcarLineaLista(detalleId: number, ventaId: number, listo: boolean) {
  const sesion = await requierePermiso("entregas");
  const { error } = await db().from("ventas_detalle").update({ listo }).eq("id", detalleId);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "entregas", accion: "editar",
    entidad_tipo: "ventas_detalle", entidad_id: detalleId,
    descripcion: `Línea de venta #${ventaId} marcada como ${listo ? "lista" : "pendiente"}`,
    datos_nuevos: { listo },
  });

  revalidatePath("/entregas");
  revalidatePath("/seguimiento");
}
