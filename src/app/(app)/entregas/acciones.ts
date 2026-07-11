"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";

export async function actualizarEntrega(datos: {
  venta_id: number;
  estado_nuevo: string;
  comentario?: string;
  fecha_entrega_real?: string;
  transportadora?: string;
  numero_guia?: string;
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
  });
  if (error) throw new Error(error.message);

  revalidatePath("/entregas");
  revalidatePath("/seguimiento");
  revalidatePath("/");
  return data;
}
