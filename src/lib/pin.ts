import "server-only";
import { db } from "./db";

/** Verifica el PIN de autorización (edición/eliminación de ventas). Lanza error si no coincide. */
export async function verificarPin(pin: string | undefined | null) {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa el PIN de autorización.");
  const { data, error } = await db().from("configuracion_sistema").select("clave_autorizacion").limit(1).single();
  if (error) throw new Error("No se pudo validar el PIN: " + error.message);
  if (limpio !== data.clave_autorizacion) throw new Error("PIN incorrecto.");
}

/** Con cuál de las claves se autorizó la operación. Se guarda en la bitácora. */
export type OrigenClave = "administracion" | "contabilidad" | "adicional";

/** Etiqueta legible de cada clave, para los mensajes y la bitácora. */
export const ETIQUETA_CLAVE: Record<OrigenClave, string> = {
  administracion: "administración",
  contabilidad: "contabilidad",
  adicional: "clave adicional",
};

/**
 * Verifica una clave de autorización aceptando **cualquiera de las tres**:
 * administración, contabilidad o la adicional. Se usa en las operaciones que
 * tocan dinero ya registrado (editar/eliminar una venta, editar/anular un
 * abono), donde las distintas áreas tienen por qué poder corregir sin depender
 * unas de otras.
 *
 * Devuelve cuál se usó para dejarlo en la bitácora: al ampliar quién puede
 * autorizar, sin esto se perdería el rastro de quién lo hizo.
 */
export async function verificarClaveAutorizada(pin: string | undefined | null): Promise<OrigenClave> {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa la clave de autorización.");
  const { data, error } = await db().from("configuracion_sistema")
    .select("clave_autorizacion, clave_contadora, clave_autorizacion_3").limit(1).single();
  if (error) throw new Error("No se pudo validar la clave: " + error.message);
  if (limpio === data.clave_autorizacion) return "administracion";
  if (limpio === data.clave_contadora) return "contabilidad";
  if (limpio === data.clave_autorizacion_3) return "adicional";
  throw new Error("Clave incorrecta. Sirve la de administración, la de contabilidad o la adicional.");
}

/** Verifica la clave de la contadora (edición de gastos/ingresos). Lanza error si no coincide. */
export async function verificarPinContadora(pin: string | undefined | null) {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa la clave de la contadora.");
  const { data, error } = await db().from("configuracion_sistema").select("clave_contadora").limit(1).single();
  if (error) throw new Error("No se pudo validar la clave: " + error.message);
  if (limpio !== data.clave_contadora) throw new Error("Clave incorrecta.");
}
