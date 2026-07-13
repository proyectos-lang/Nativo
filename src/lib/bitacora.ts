import "server-only";
import { db } from "./db";
import { formatoPesos } from "./tipos";

export type ParametrosBitacora = {
  usuario: string | null;
  modulo: string;
  accion: string;
  entidad_tipo: string;
  entidad_id: number;
  descripcion: string;
  datos_anteriores?: Record<string, unknown> | null;
  datos_nuevos?: Record<string, unknown> | null;
  motivo?: string | null;
};

/**
 * Registra un evento en la bitácora de auditoría. Best-effort: un fallo
 * aquí (de red, de Supabase, lo que sea) se captura y se registra en
 * consola, pero NUNCA se relanza — jamás debe revertir ni interrumpir
 * una transacción de negocio que ya se completó.
 */
export async function registrarBitacora(p: ParametrosBitacora): Promise<void> {
  try {
    const { error } = await db().from("bitacora").insert({
      tabla_afectada: p.entidad_tipo,
      registro_id: p.entidad_id,
      usuario: p.usuario,
      modulo: p.modulo,
      accion: p.accion,
      descripcion: p.descripcion,
      datos_anteriores: p.datos_anteriores ?? null,
      datos_nuevos: p.datos_nuevos ?? null,
      motivo: p.motivo ?? null,
    });
    if (error) console.error("[bitacora] no se pudo registrar el evento:", error.message, p);
  } catch (e) {
    console.error("[bitacora] excepción al registrar el evento:", e, p);
  }
}

/** Descripción legible consistente para entidades con ticket + monto, ej. "Venta #123 — $150.000". */
export function descripcionTicket(etiqueta: string, ticket: number, monto?: number | null): string {
  const partes = [`${etiqueta} #${ticket}`];
  if (monto != null) partes.push(formatoPesos(monto));
  return partes.join(" — ");
}
