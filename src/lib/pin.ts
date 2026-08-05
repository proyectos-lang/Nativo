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

/** Con cuál de las dos claves se autorizó la operación. */
export type OrigenClave = "gerencia" | "contadora";

/**
 * Verifica una clave de autorización aceptando **cualquiera de las dos**: la de
 * gerencia o la de la contadora. Se usa en las operaciones que tocan dinero ya
 * registrado (editar/eliminar una venta, editar/anular un abono), donde ambas
 * áreas tienen por qué poder corregir sin depender la una de la otra.
 *
 * Devuelve cuál se usó para dejarlo en la bitácora: sin eso, al revisar el
 * histórico no se sabría quién autorizó el cambio.
 */
export async function verificarClaveAutorizada(pin: string | undefined | null): Promise<OrigenClave> {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa la clave de autorización.");
  const { data, error } = await db().from("configuracion_sistema")
    .select("clave_autorizacion, clave_contadora").limit(1).single();
  if (error) throw new Error("No se pudo validar la clave: " + error.message);
  if (limpio === data.clave_autorizacion) return "gerencia";
  if (limpio === data.clave_contadora) return "contadora";
  throw new Error("Clave incorrecta. Sirve la de administración o la de contabilidad.");
}

/** Verifica la clave de la contadora (edición de gastos/ingresos). Lanza error si no coincide. */
export async function verificarPinContadora(pin: string | undefined | null) {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa la clave de la contadora.");
  const { data, error } = await db().from("configuracion_sistema").select("clave_contadora").limit(1).single();
  if (error) throw new Error("No se pudo validar la clave: " + error.message);
  if (limpio !== data.clave_contadora) throw new Error("Clave incorrecta.");
}
