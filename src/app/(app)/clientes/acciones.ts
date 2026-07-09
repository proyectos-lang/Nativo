"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";
import type { Cliente } from "@/lib/tipos";

export async function guardarCliente(datos: Partial<Cliente> & { nombre: string }) {
  await requierePermiso("clientes");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");

  const fila = {
    nombre: datos.nombre.trim(),
    empresa: datos.empresa?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    correo: datos.correo?.trim() || null,
    cedula_nit: datos.cedula_nit?.trim() || null,
    rut: datos.rut?.trim() || null,
  };

  if (datos.id) {
    const { error } = await db().from("clientes").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
  } else {
    if (fila.cedula_nit) {
      const { data: dup } = await db().from("clientes").select("id").eq("cedula_nit", fila.cedula_nit).maybeSingle();
      if (dup) throw new Error("Ya existe un cliente con esa cédula/NIT.");
    }
    const { error } = await db().from("clientes").insert(fila);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/clientes");
  revalidatePath("/ventas");
}
