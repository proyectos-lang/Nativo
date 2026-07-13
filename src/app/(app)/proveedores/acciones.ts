"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import type { Proveedor } from "@/lib/tipos";

export async function guardarProveedor(datos: Partial<Proveedor> & { nombre: string }) {
  const sesion = await requierePermiso("proveedores");
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
    const { data: anterior } = await db().from("proveedores").select("*").eq("id", datos.id).single();
    const { error } = await db().from("proveedores").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "proveedores", accion: "editar",
      entidad_tipo: "proveedores", entidad_id: datos.id,
      descripcion: `Proveedor: ${fila.nombre}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
  } else {
    if (fila.nit) {
      const { data: dup } = await db().from("proveedores").select("id").eq("nit", fila.nit).maybeSingle();
      if (dup) throw new Error("Ya existe un proveedor con ese NIT/identificación.");
    }
    const { data: nuevo, error } = await db().from("proveedores").insert(fila).select("id").single();
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "proveedores", accion: "crear",
      entidad_tipo: "proveedores", entidad_id: nuevo.id,
      descripcion: `Proveedor: ${fila.nombre}`,
      datos_nuevos: fila,
    });
  }
  revalidatePath("/proveedores");
  revalidatePath("/financiero");
}
