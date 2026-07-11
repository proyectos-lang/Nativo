"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";
import type { Permisos } from "@/lib/tipos";

export async function guardarUsuario(datos: {
  id?: number;
  nombre: string;
  usuario: string;
  correo?: string;
  contrasena?: string;
  rol: "admin" | "usuario";
  permisos: Permisos;
  activo: boolean;
}) {
  await requierePermiso("configuracion");
  if (!datos.nombre?.trim() || !datos.usuario?.trim()) throw new Error("Nombre y usuario son obligatorios.");

  const fila: Record<string, unknown> = {
    nombre: datos.nombre.trim(),
    usuario: datos.usuario.trim(),
    correo: datos.correo?.trim() || null,
    rol: datos.rol,
    permisos: datos.permisos,
    activo: datos.activo,
  };

  if (datos.id) {
    if (datos.contrasena?.trim()) fila.contrasena = datos.contrasena.trim();
    const { error } = await db().from("usuarios").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
  } else {
    if (!datos.contrasena?.trim()) throw new Error("La contraseña es obligatoria para un usuario nuevo.");
    fila.contrasena = datos.contrasena.trim();
    const { error } = await db().from("usuarios").insert(fila);
    if (error) throw new Error(error.message.includes("usuarios_usuario_key") ? "Ese nombre de usuario ya existe." : error.message);
  }
  revalidatePath("/configuracion");
}

export async function eliminarUsuario(id: number) {
  const sesion = await requierePermiso("configuracion");
  if (sesion.id === id) throw new Error("No puedes eliminar tu propio usuario.");
  const { error } = await db().from("usuarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}

export async function agregarValorMaestro(tipo: string, valor: string) {
  await requierePermiso("configuracion");
  if (!valor?.trim()) throw new Error("El valor es obligatorio.");
  const { error } = await db().from("listas_maestras").insert({ tipo, valor: valor.trim() });
  if (error) throw new Error(error.message.includes("duplicate") ? "Ese valor ya existe en la lista." : error.message);
  revalidatePath("/configuracion");
}

export async function eliminarValorMaestro(id: number) {
  await requierePermiso("configuracion");
  const { error } = await db().from("listas_maestras").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}

export async function crearProducto(nombre: string) {
  await requierePermiso("configuracion");
  const limpio = nombre?.trim();
  if (!limpio) throw new Error("El nombre del producto es obligatorio.");
  const { error } = await db().from("productos").insert({ nombre: limpio });
  if (error) throw new Error(error.message.includes("duplicate") ? "Ese producto ya existe." : error.message);
  revalidatePath("/configuracion");
  revalidatePath("/ventas");
}

export async function eliminarProducto(id: number) {
  await requierePermiso("configuracion");
  const { error } = await db().from("productos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
  revalidatePath("/ventas");
}

export async function cambiarPinAutorizacion(pinActual: string, pinNuevo: string) {
  const sesion = await requierePermiso("configuracion");
  if (sesion.rol !== "admin") throw new Error("Solo un administrador puede cambiar el PIN.");
  if (!pinNuevo?.trim() || pinNuevo.trim().length < 4) throw new Error("El nuevo PIN debe tener al menos 4 caracteres.");

  const { data, error: errGet } = await db().from("configuracion_sistema").select("id, clave_autorizacion").limit(1).single();
  if (errGet) throw new Error(errGet.message);
  if ((pinActual || "").trim() !== data.clave_autorizacion) throw new Error("El PIN actual no coincide.");

  const { error } = await db().from("configuracion_sistema").update({ clave_autorizacion: pinNuevo.trim() }).eq("id", data.id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}

export async function cambiarClaveContadora(claveActual: string, claveNueva: string) {
  const sesion = await requierePermiso("configuracion");
  if (sesion.rol !== "admin") throw new Error("Solo un administrador puede cambiar la clave de la contadora.");
  if (!claveNueva?.trim() || claveNueva.trim().length < 4) throw new Error("La nueva clave debe tener al menos 4 caracteres.");

  const { data, error: errGet } = await db().from("configuracion_sistema").select("id, clave_contadora").limit(1).single();
  if (errGet) throw new Error(errGet.message);
  if ((claveActual || "").trim() !== data.clave_contadora) throw new Error("La clave actual no coincide.");

  const { error } = await db().from("configuracion_sistema").update({ clave_contadora: claveNueva.trim() }).eq("id", data.id);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion");
}
