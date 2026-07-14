"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

export async function actualizarFechaEntregaReal(ventaId: number, fechaEntregaReal: string) {
  const sesion = await requierePermiso("seguimiento");
  if (!fechaEntregaReal) throw new Error("Selecciona una fecha.");
  const { data: venta, error: errGet } = await db()
    .from("ventas").select("ticket, estado_entrega, fecha_entrega_real").eq("id", ventaId).single();
  if (errGet) throw new Error(errGet.message);

  const { data, error } = await db().rpc("actualizar_entrega", {
    p_venta_id: ventaId,
    p_estado_nuevo: venta.estado_entrega || "En Proceso",
    p_comentario: null,
    p_usuario: sesion.usuario,
    p_fecha_entrega_real: fechaEntregaReal,
    p_transportadora: null,
    p_numero_guia: null,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "seguimiento", accion: "editar",
    entidad_tipo: "ventas", entidad_id: ventaId,
    descripcion: descripcionTicket("Fecha real de entrega Venta", venta.ticket),
    datos_anteriores: { fecha_entrega_real: venta.fecha_entrega_real },
    datos_nuevos: { fecha_entrega_real: fechaEntregaReal },
  });

  revalidatePath("/seguimiento");
  revalidatePath("/entregas");
  revalidatePath("/");
  return data;
}
