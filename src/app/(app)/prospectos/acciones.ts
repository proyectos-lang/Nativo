"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

export async function crearProspecto(datos: {
  nombre: string; telefono?: string; correo?: string; referido_por?: string;
  evento_lugar?: string; descripcion?: string;
}) {
  const sesion = await requierePermiso("prospectos");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  const descripcion = datos.descripcion?.trim() || null;
  const fila = {
    nombre: datos.nombre.trim(),
    telefono: datos.telefono?.trim() || null,
    correo: datos.correo?.trim() || null,
    referido_por: datos.referido_por?.trim() || null,
    evento_lugar: datos.evento_lugar?.trim() || null,
    descripcion,
    // La nota inicial entra al mismo historial de observaciones que usan las
    // actualizaciones de seguimiento, para que quede visible de inmediato.
    observaciones: descripcion ? `[${new Date().toLocaleDateString("es-CO")} ${sesion.usuario}] ${descripcion}` : null,
    estado: "Pendiente",
  };
  const { data, error } = await db().from("prospectos").insert(fila).select("id").single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "prospectos", accion: "crear",
    entidad_tipo: "prospectos", entidad_id: data.id,
    descripcion: `Prospecto creado: ${fila.nombre}`,
    datos_nuevos: fila,
  });
  revalidatePath("/prospectos");
}

export async function actualizarProspecto(datos: {
  id: number; estado: string; fecha_contacto?: string; proximo_contacto?: string; observacion?: string;
}) {
  const sesion = await requierePermiso("prospectos");
  const { data: actual, error: errGet } = await db().from("prospectos").select("*").eq("id", datos.id).single();
  if (errGet) throw new Error(errGet.message);

  const nuevaObs = datos.observacion?.trim()
    ? `${actual.observaciones ? actual.observaciones + "\n" : ""}[${new Date().toLocaleDateString("es-CO")} ${sesion.usuario}] ${datos.observacion.trim()}`
    : actual.observaciones;

  const camposActualizados = {
    estado: datos.estado,
    fecha_contacto: datos.fecha_contacto || null,
    proximo_contacto: datos.proximo_contacto || null,
    observaciones: nuevaObs,
  };
  const { error } = await db().from("prospectos").update(camposActualizados).eq("id", datos.id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "prospectos", accion: "editar",
    entidad_tipo: "prospectos", entidad_id: datos.id,
    descripcion: `Prospecto #${datos.id} — estado: ${datos.estado}`,
    datos_anteriores: actual, datos_nuevos: { ...actual, ...camposActualizados },
  });
  revalidatePath("/prospectos");
}
