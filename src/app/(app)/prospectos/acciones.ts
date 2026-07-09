"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { revalidatePath } from "next/cache";

export async function crearProspecto(datos: {
  nombre: string; telefono?: string; correo?: string; referido_por?: string;
  evento_lugar?: string; descripcion?: string;
}) {
  await requierePermiso("prospectos");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  const { error } = await db().from("prospectos").insert({
    nombre: datos.nombre.trim(),
    telefono: datos.telefono?.trim() || null,
    correo: datos.correo?.trim() || null,
    referido_por: datos.referido_por?.trim() || null,
    evento_lugar: datos.evento_lugar?.trim() || null,
    descripcion: datos.descripcion?.trim() || null,
    estado: "Pendiente",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/prospectos");
}

export async function actualizarProspecto(datos: {
  id: number; estado: string; fecha_contacto?: string; proximo_contacto?: string; observacion?: string;
}) {
  const sesion = await requierePermiso("prospectos");
  const { data: actual, error: errGet } = await db().from("prospectos").select("observaciones").eq("id", datos.id).single();
  if (errGet) throw new Error(errGet.message);

  const nuevaObs = datos.observacion?.trim()
    ? `${actual.observaciones ? actual.observaciones + "\n" : ""}[${new Date().toLocaleDateString("es-CO")} ${sesion.usuario}] ${datos.observacion.trim()}`
    : actual.observaciones;

  const { error } = await db().from("prospectos").update({
    estado: datos.estado,
    fecha_contacto: datos.fecha_contacto || null,
    proximo_contacto: datos.proximo_contacto || null,
    observaciones: nuevaObs,
  }).eq("id", datos.id);
  if (error) throw new Error(error.message);
  revalidatePath("/prospectos");
}
