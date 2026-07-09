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
