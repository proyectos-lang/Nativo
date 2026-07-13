"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

export async function registrarPago(datos: {
  venta_id: number;
  abono: number;
  retencion: number;
  fecha?: string;
  comentario?: string;
  cuenta_id?: number | null;
}) {
  const sesion = await requierePermiso("pagos");
  const abono = Number(datos.abono) || 0;
  const retencion = Number(datos.retencion) || 0;
  if (abono <= 0 && retencion <= 0) throw new Error("Ingresa un valor de abono o retención.");

  const { data, error } = await db().rpc("registrar_pago", {
    p_venta_id: datos.venta_id,
    p_abono: abono,
    p_retencion: retencion,
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario || null,
    p_usuario: sesion.usuario,
    p_cuenta_id: datos.cuenta_id || null,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "pagar",
    entidad_tipo: "ventas", entidad_id: datos.venta_id,
    descripcion: descripcionTicket("Abono Venta", data?.ticket, abono),
    datos_nuevos: { ...datos, abono, retencion, venta_resultante: data },
  });

  revalidatePath("/pagos");
  revalidatePath("/financiero");
  revalidatePath("/");
  return data;
}
