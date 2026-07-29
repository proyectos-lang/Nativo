"use server";

import { db } from "@/lib/db";
import { requiereSesion } from "@/lib/sesion";
import { notificacionesDe, notificacionesNoLeidas } from "@/lib/consultas";
import type { Notificacion } from "@/lib/tipos";

/** Novedades del usuario de la sesión. La campanita la consulta cada 30 s. */
export async function novedadesDe(): Promise<{ noLeidas: number; items: Notificacion[] }> {
  const sesion = await requiereSesion();
  const [noLeidas, items] = await Promise.all([
    notificacionesNoLeidas(sesion.id),
    notificacionesDe(sesion.id),
  ]);
  return { noLeidas, items: items as Notificacion[] };
}

export async function marcarNotificacionesLeidas(): Promise<void> {
  const sesion = await requiereSesion();
  try {
    await db().from("notificaciones").update({ leida: true }).eq("usuario_id", sesion.id).eq("leida", false);
  } catch (e) {
    console.error("[notificaciones] no se pudieron marcar como leídas:", (e as Error).message);
  }
}

/** Guarda (o renueva) la suscripción de push del navegador actual. */
export async function guardarSuscripcionPush(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  agente?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sesion = await requiereSesion();
  if (!sub?.endpoint || !sub.p256dh || !sub.auth) return { ok: false, error: "Suscripción incompleta." };
  const { error } = await db().from("push_suscripciones").upsert({
    usuario_id: sesion.id,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    agente: sub.agente || null,
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("[push] no se pudo guardar la suscripción:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function eliminarSuscripcionPush(endpoint: string): Promise<void> {
  await requiereSesion();
  try {
    await db().from("push_suscripciones").delete().eq("endpoint", endpoint);
  } catch (e) {
    console.error("[push] no se pudo eliminar la suscripción:", (e as Error).message);
  }
}
