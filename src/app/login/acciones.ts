"use server";

import { db } from "@/lib/db";
import { crearSesion, cerrarSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import type { Permisos } from "@/lib/tipos";

export async function iniciarSesion(_estadoPrevio: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const usuario = String(formData.get("usuario") || "").trim();
  const contrasena = String(formData.get("contrasena") || "");
  if (!usuario || !contrasena) return { error: "Ingresa usuario y contraseña." };

  const { data, error } = await db()
    .from("usuarios")
    .select("id, nombre, usuario, contrasena, rol, permisos, activo")
    .eq("usuario", usuario)
    .maybeSingle();

  if (error) return { error: "Error de conexión: " + error.message };
  // Comparación en texto plano por decisión del propietario del sistema.
  if (!data || data.contrasena !== contrasena) return { error: "Usuario o contraseña incorrectos." };
  if (!data.activo) return { error: "Este usuario está desactivado." };

  await crearSesion({
    id: data.id,
    nombre: data.nombre,
    usuario: data.usuario,
    rol: data.rol,
    permisos: data.permisos as Permisos,
  });
  redirect("/");
}

export async function salir() {
  await cerrarSesion();
  redirect("/login");
}
