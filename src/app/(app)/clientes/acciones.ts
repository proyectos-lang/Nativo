"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import type { Cliente } from "@/lib/tipos";

export async function guardarCliente(datos: Partial<Cliente> & { nombre: string }) {
  const sesion = await requierePermiso("clientes");
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
    const { data: anterior } = await db().from("clientes").select("*").eq("id", datos.id).single();
    const { error } = await db().from("clientes").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "clientes", accion: "editar",
      entidad_tipo: "clientes", entidad_id: datos.id,
      descripcion: `Cliente: ${fila.nombre}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
  } else {
    if (fila.cedula_nit) {
      const { data: dup } = await db().from("clientes").select("id").eq("cedula_nit", fila.cedula_nit).maybeSingle();
      if (dup) throw new Error("Ya existe un cliente con esa cédula/NIT.");
    }
    const { data: nuevo, error } = await db().from("clientes").insert(fila).select("id").single();
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "clientes", accion: "crear",
      entidad_tipo: "clientes", entidad_id: nuevo.id,
      descripcion: `Cliente: ${fila.nombre}`,
      datos_nuevos: fila,
    });
  }
  revalidatePath("/clientes");
  revalidatePath("/ventas");
}

export async function cambiarActivoCliente(id: number, activo: boolean) {
  const sesion = await requierePermiso("clientes");
  const { data: anterior } = await db().from("clientes").select("nombre, activo").eq("id", id).single();
  const { error } = await db().from("clientes").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "clientes", accion: "editar",
    entidad_tipo: "clientes", entidad_id: id,
    descripcion: `Cliente ${activo ? "activado" : "desactivado"}: ${anterior?.nombre ?? id}`,
    datos_anteriores: anterior ?? null, datos_nuevos: { activo },
  });
  revalidatePath("/clientes");
  revalidatePath("/ventas");
}

export async function eliminarCliente(id: number) {
  const sesion = await requierePermiso("clientes");
  const { data: anterior } = await db().from("clientes").select("*").eq("id", id).single();
  const { error } = await db().from("clientes").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar: este cliente tiene ventas registradas.");
    throw new Error(error.message);
  }
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "clientes", accion: "eliminar",
    entidad_tipo: "clientes", entidad_id: id,
    descripcion: `Cliente eliminado: ${anterior?.nombre ?? id}`,
    datos_anteriores: anterior ?? null,
  });
  revalidatePath("/clientes");
  revalidatePath("/ventas");
}
