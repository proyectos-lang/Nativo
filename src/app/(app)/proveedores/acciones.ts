"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";
import type { Proveedor } from "@/lib/tipos";

export async function guardarProveedor(datos: Partial<Proveedor> & { nombre: string }) {
  await requierePermiso("proveedores");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");

  const fila = {
    nombre: datos.nombre.trim(),
    nit: datos.nit?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    correo: datos.correo?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
  };

  if (datos.id) {
    const { error } = await db().from("proveedores").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
  } else {
    if (fila.nit) {
      const { data: dup } = await db().from("proveedores").select("id").eq("nit", fila.nit).maybeSingle();
      if (dup) throw new Error("Ya existe un proveedor con ese NIT/identificación.");
    }
    const { error } = await db().from("proveedores").insert(fila);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/proveedores");
  revalidatePath("/financiero");
}
