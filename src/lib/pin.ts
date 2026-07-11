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

/** Verifica la clave de la contadora (edición de gastos/ingresos). Lanza error si no coincide. */
export async function verificarPinContadora(pin: string | undefined | null) {
  const limpio = (pin || "").trim();
  if (!limpio) throw new Error("Ingresa la clave de la contadora.");
  const { data, error } = await db().from("configuracion_sistema").select("clave_contadora").limit(1).single();
  if (error) throw new Error("No se pudo validar la clave: " + error.message);
  if (limpio !== data.clave_contadora) throw new Error("Clave incorrecta.");
}
