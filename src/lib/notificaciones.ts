import "server-only";
import webpush from "web-push";
import { db } from "./db";

export type NuevaNotificacion = {
  usuario_id: number;
  titulo: string;
  cuerpo?: string | null;
  url?: string | null;
  solicitud_id?: number | null;
  tipo?: string;
};

let vapidListo: boolean | null = null;

/** Configura VAPID una sola vez. Devuelve false si faltan las claves (push desactivado). */
function configurarVapid(): boolean {
  if (vapidListo !== null) return vapidListo;
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const sujeto = process.env.VAPID_SUBJECT || "mailto:admin@nativo.app";
  if (!publica || !privada) {
    console.error("[push] faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: no se enviarán notificaciones push");
    vapidListo = false;
    return false;
  }
  webpush.setVapidDetails(sujeto, publica, privada);
  vapidListo = true;
  return true;
}

/**
 * Envía la notificación push a todos los dispositivos del usuario.
 * Las suscripciones vencidas (404/410) se eliminan solas.
 */
async function enviarPush(usuarioId: number, payload: { titulo: string; cuerpo?: string | null; url?: string | null }) {
  if (!configurarVapid()) return;

  const { data: subs, error } = await db()
    .from("push_suscripciones")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", usuarioId);
  if (error || !subs?.length) return;

  const cuerpo = JSON.stringify({
    titulo: payload.titulo,
    cuerpo: payload.cuerpo || "",
    url: payload.url || "/solicitudes",
  });

  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        cuerpo,
      );
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) {
        await db().from("push_suscripciones").delete().eq("id", s.id);
      } else {
        console.error("[push] no se pudo enviar a una suscripción:", (e as Error).message);
      }
    }
  }));
}

/**
 * Crea la notificación interna (campanita) y dispara el push.
 * Best-effort: cualquier fallo se registra en consola pero NUNCA se relanza —
 * no debe interrumpir la operación de negocio que la originó (mismo criterio
 * que registrarBitacora).
 */
export async function crearNotificacion(n: NuevaNotificacion): Promise<void> {
  try {
    const { error } = await db().from("notificaciones").insert({
      usuario_id: n.usuario_id,
      tipo: n.tipo || "solicitud_asignada",
      titulo: n.titulo,
      cuerpo: n.cuerpo || null,
      url: n.url || null,
      solicitud_id: n.solicitud_id || null,
    });
    if (error) console.error("[notificaciones] no se pudo guardar el aviso:", error.message);

    await enviarPush(n.usuario_id, { titulo: n.titulo, cuerpo: n.cuerpo, url: n.url });
  } catch (e) {
    console.error("[notificaciones] excepción al notificar:", e);
  }
}
