"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { crearNotificacion } from "@/lib/notificaciones";
import { revalidatePath } from "next/cache";
import type { Sesion } from "@/lib/tipos";

function revalidar() {
  revalidatePath("/solicitudes");
  revalidatePath("/");
}

const ESTADOS = ["Pendiente", "En proceso", "Esperando información", "Esperando aprobación", "Finalizada", "Cancelada"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];

async function nombreUsuario(id: number): Promise<string | null> {
  const { data } = await db().from("usuarios").select("nombre").eq("id", id).single();
  return (data?.nombre as string) || null;
}

/** Trae la solicitud y valida que el actor pueda intervenir (responsable, solicitante o admin). */
async function solicitudConPermiso(sesion: Sesion, solicitudId: number, soloResponsable = false) {
  const { data: sol, error } = await db().from("solicitudes").select("*").eq("id", solicitudId).single();
  if (error || !sol) throw new Error("Solicitud no encontrada.");
  const esAdmin = sesion.rol === "admin";
  const esResponsable = sol.responsable_id === sesion.id;
  const esSolicitante = sol.solicitado_por_id === sesion.id;
  if (soloResponsable) {
    if (!esAdmin && !esResponsable) throw new Error("Solo el responsable asignado o un administrador puede realizar esta acción.");
  } else if (!esAdmin && !esResponsable && !esSolicitante) {
    throw new Error("No tienes permiso para intervenir en esta solicitud.");
  }
  return sol;
}

export async function crearSolicitud(datos: {
  responsable_id: number;
  area?: string;
  titulo: string;
  descripcion?: string;
  prioridad?: string;
  fecha_limite?: string;
}) {
  const sesion = await requierePermiso("solicitudes");
  const titulo = datos.titulo?.trim();
  if (!titulo) throw new Error("El título de la solicitud es obligatorio.");
  if (!datos.responsable_id) throw new Error("Debes elegir a quién va dirigida la solicitud.");
  const prioridad = PRIORIDADES.includes(datos.prioridad || "") ? datos.prioridad! : "Media";

  const { data: maxData, error: errMax } = await db().from("solicitudes").select("numero").order("numero", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const numero = ((maxData?.[0]?.numero as number) || 0) + 1;

  const responsable = await nombreUsuario(datos.responsable_id);

  const { data: nueva, error } = await db().from("solicitudes").insert({
    numero,
    solicitado_por_id: sesion.id,
    solicitado_por: sesion.nombre,
    responsable_id: datos.responsable_id,
    responsable,
    area: datos.area?.trim() || null,
    titulo,
    descripcion: datos.descripcion?.trim() || null,
    prioridad,
    fecha_limite: datos.fecha_limite || null,
    estado: "Pendiente",
    usuario: sesion.usuario,
  }).select("id, numero").single();
  if (error) throw new Error(error.message);

  await db().from("solicitudes_historial").insert({
    solicitud_id: nueva.id, tipo: "creacion", estado_nuevo: "Pendiente",
    comentario: `Solicitud creada y asignada a ${responsable ?? "—"}`, usuario: sesion.nombre,
  });

  // Avisa al responsable (campanita + push). No se notifica a uno mismo.
  if (datos.responsable_id !== sesion.id) {
    await crearNotificacion({
      usuario_id: datos.responsable_id,
      tipo: "solicitud_asignada",
      titulo: `Nueva solicitud de ${sesion.nombre}`,
      cuerpo: `#${numero} · ${titulo}${prioridad === "Urgente" || prioridad === "Alta" ? ` (prioridad ${prioridad.toLowerCase()})` : ""}`,
      url: "/solicitudes",
      solicitud_id: nueva.id,
    });
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "solicitudes", accion: "crear",
    entidad_tipo: "solicitudes", entidad_id: nueva.id,
    descripcion: `Solicitud #${numero}: ${titulo}`,
    datos_nuevos: { ...datos, numero, responsable },
  });
  revalidar();
  return { id: nueva.id as number, numero };
}

export async function agregarComentario(solicitudId: number, comentario: string) {
  const sesion = await requierePermiso("solicitudes");
  const texto = comentario?.trim();
  if (!texto) throw new Error("Escribe un comentario.");
  await solicitudConPermiso(sesion, solicitudId);
  const { error } = await db().from("solicitudes_historial").insert({
    solicitud_id: solicitudId, tipo: "comentario", comentario: texto, usuario: sesion.nombre,
  });
  if (error) throw new Error(error.message);
  await db().from("solicitudes").update({ actualizado_en: new Date().toISOString() }).eq("id", solicitudId);
  revalidar();
}

export async function cambiarEstadoSolicitud(solicitudId: number, nuevoEstado: string, comentario?: string) {
  const sesion = await requierePermiso("solicitudes");
  if (!ESTADOS.includes(nuevoEstado)) throw new Error("Estado inválido.");
  if (nuevoEstado === "Finalizada") throw new Error("Usa la opción Finalizar para cerrar la solicitud.");
  const sol = await solicitudConPermiso(sesion, solicitudId);
  if (sol.estado === nuevoEstado) throw new Error(`La solicitud ya está en estado "${nuevoEstado}".`);

  const { error } = await db().from("solicitudes").update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq("id", solicitudId);
  if (error) throw new Error(error.message);
  await db().from("solicitudes_historial").insert({
    solicitud_id: solicitudId, tipo: "cambio_estado", estado_anterior: sol.estado, estado_nuevo: nuevoEstado,
    comentario: comentario?.trim() || null, usuario: sesion.nombre,
  });
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "solicitudes", accion: "cambiar_estado",
    entidad_tipo: "solicitudes", entidad_id: solicitudId,
    descripcion: `Solicitud #${sol.numero}: ${sol.estado} → ${nuevoEstado}`,
    datos_anteriores: { estado: sol.estado }, datos_nuevos: { estado: nuevoEstado },
  });
  revalidar();
}

export async function finalizarSolicitud(solicitudId: number, observaciones: string) {
  const sesion = await requierePermiso("solicitudes");
  const sol = await solicitudConPermiso(sesion, solicitudId, true);
  if (sol.estado === "Finalizada") throw new Error("La solicitud ya está finalizada.");
  if (sol.estado === "Cancelada") throw new Error("No se puede finalizar una solicitud cancelada.");

  const { error } = await db().from("solicitudes").update({
    estado: "Finalizada",
    fecha_finalizacion: new Date().toISOString(),
    observaciones_finales: observaciones?.trim() || null,
    actualizado_en: new Date().toISOString(),
  }).eq("id", solicitudId);
  if (error) throw new Error(error.message);
  await db().from("solicitudes_historial").insert({
    solicitud_id: solicitudId, tipo: "finalizacion", estado_anterior: sol.estado, estado_nuevo: "Finalizada",
    comentario: observaciones?.trim() || null, usuario: sesion.nombre,
  });
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "solicitudes", accion: "finalizar",
    entidad_tipo: "solicitudes", entidad_id: solicitudId,
    descripcion: `Solicitud #${sol.numero} finalizada`,
    datos_nuevos: { observaciones_finales: observaciones },
  });
  revalidar();
}

export async function reasignarSolicitud(solicitudId: number, nuevoResponsableId: number) {
  const sesion = await requierePermiso("solicitudes");
  if (!nuevoResponsableId) throw new Error("Elige el nuevo responsable.");
  const sol = await solicitudConPermiso(sesion, solicitudId);
  if (sol.responsable_id === nuevoResponsableId) throw new Error("La solicitud ya está asignada a esa persona.");
  const nuevoNombre = await nombreUsuario(nuevoResponsableId);

  const { error } = await db().from("solicitudes").update({
    responsable_id: nuevoResponsableId, responsable: nuevoNombre, actualizado_en: new Date().toISOString(),
  }).eq("id", solicitudId);
  if (error) throw new Error(error.message);
  await db().from("solicitudes_historial").insert({
    solicitud_id: solicitudId, tipo: "reasignacion",
    comentario: `Reasignada de ${sol.responsable ?? "—"} a ${nuevoNombre ?? "—"}`, usuario: sesion.nombre,
  });
  // Avisa al nuevo responsable (campanita + push). No se notifica a uno mismo.
  if (nuevoResponsableId !== sesion.id) {
    await crearNotificacion({
      usuario_id: nuevoResponsableId,
      tipo: "solicitud_asignada",
      titulo: `Te reasignaron una solicitud`,
      cuerpo: `#${sol.numero} · ${sol.titulo}`,
      url: "/solicitudes",
      solicitud_id: solicitudId,
    });
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "solicitudes", accion: "reasignar",
    entidad_tipo: "solicitudes", entidad_id: solicitudId,
    descripcion: `Solicitud #${sol.numero} reasignada a ${nuevoNombre ?? "—"}`,
    datos_anteriores: { responsable: sol.responsable }, datos_nuevos: { responsable: nuevoNombre },
  });
  revalidar();
}

export async function cancelarSolicitud(solicitudId: number, motivo: string) {
  const sesion = await requierePermiso("solicitudes");
  const sol = await solicitudConPermiso(sesion, solicitudId);
  if (sol.estado === "Cancelada") throw new Error("La solicitud ya está cancelada.");
  if (sol.estado === "Finalizada") throw new Error("No se puede cancelar una solicitud finalizada.");

  const { error } = await db().from("solicitudes").update({ estado: "Cancelada", actualizado_en: new Date().toISOString() }).eq("id", solicitudId);
  if (error) throw new Error(error.message);
  await db().from("solicitudes_historial").insert({
    solicitud_id: solicitudId, tipo: "cambio_estado", estado_anterior: sol.estado, estado_nuevo: "Cancelada",
    comentario: motivo?.trim() || "Cancelada", usuario: sesion.nombre,
  });
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "solicitudes", accion: "cancelar",
    entidad_tipo: "solicitudes", entidad_id: solicitudId,
    descripcion: `Solicitud #${sol.numero} cancelada`,
    datos_nuevos: { motivo },
  });
  revalidar();
}

// ------------------------------------------------------------
// Adjuntos (Supabase Storage bucket "guias")
// ------------------------------------------------------------
const TIPOS_ADJUNTO = [
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "application/pdf",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const TAMANO_MAXIMO = 10 * 1024 * 1024;

export async function subirAdjuntoSolicitud(formData: FormData) {
  await requierePermiso("solicitudes");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) throw new Error("Archivo inválido.");
  if (archivo.type && !TIPOS_ADJUNTO.includes(archivo.type)) {
    throw new Error("Tipo no permitido. Se aceptan imágenes, PDF, Excel o Word.");
  }
  if (archivo.size > TAMANO_MAXIMO) throw new Error("El archivo no debe superar 10MB.");
  const ext = archivo.name.split(".").pop() || "dat";
  const ruta = `solicitudes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await db().storage.from("guias").upload(ruta, archivo, { contentType: archivo.type || undefined });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);
  const { data } = db().storage.from("guias").getPublicUrl(ruta);
  return { url: data.publicUrl, nombre: archivo.name, tipo: archivo.type || null };
}

export async function guardarAdjunto(solicitudId: number, adjunto: { url: string; nombre?: string; tipo?: string | null }) {
  const sesion = await requierePermiso("solicitudes");
  await solicitudConPermiso(sesion, solicitudId);
  const { error } = await db().from("solicitudes_adjuntos").insert({
    solicitud_id: solicitudId, url: adjunto.url, nombre: adjunto.nombre || null, tipo: adjunto.tipo || null, usuario: sesion.nombre,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

export async function quitarAdjunto(adjuntoId: number) {
  const sesion = await requierePermiso("solicitudes");
  const { data: adj } = await db().from("solicitudes_adjuntos").select("solicitud_id").eq("id", adjuntoId).single();
  if (adj) await solicitudConPermiso(sesion, adj.solicitud_id);
  const { error } = await db().from("solicitudes_adjuntos").delete().eq("id", adjuntoId);
  if (error) throw new Error(error.message);
  revalidar();
}
