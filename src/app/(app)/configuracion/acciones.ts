"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
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
  const sesion = await requierePermiso("configuracion");
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
    const { data: anterior } = await db().from("usuarios").select("id, nombre, usuario, correo, rol, permisos, activo").eq("id", datos.id).single();
    const { error } = await db().from("usuarios").update(fila).eq("id", datos.id);
    if (error) throw new Error(error.message);
    const filaSinClave = { ...fila };
    delete filaSinClave.contrasena;
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "configuracion", accion: "editar",
      entidad_tipo: "usuarios", entidad_id: datos.id,
      descripcion: `Usuario ${fila.usuario} (${fila.rol})`,
      datos_anteriores: anterior ?? null, datos_nuevos: filaSinClave,
    });
  } else {
    if (!datos.contrasena?.trim()) throw new Error("La contraseña es obligatoria para un usuario nuevo.");
    fila.contrasena = datos.contrasena.trim();
    const { data: nuevo, error } = await db().from("usuarios").insert(fila).select("id").single();
    if (error) throw new Error(error.message.includes("usuarios_usuario_key") ? "Ese nombre de usuario ya existe." : error.message);
    const filaSinClave = { ...fila };
    delete filaSinClave.contrasena;
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "configuracion", accion: "crear",
      entidad_tipo: "usuarios", entidad_id: nuevo.id,
      descripcion: `Usuario ${fila.usuario} (${fila.rol})`,
      datos_nuevos: filaSinClave,
    });
  }
  revalidatePath("/configuracion");
}

export async function eliminarUsuario(id: number) {
  const sesion = await requierePermiso("configuracion");
  if (sesion.id === id) throw new Error("No puedes eliminar tu propio usuario.");
  const { data: anterior } = await db().from("usuarios").select("id, nombre, usuario, correo, rol, permisos, activo").eq("id", id).single();
  const { error } = await db().from("usuarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "eliminar",
    entidad_tipo: "usuarios", entidad_id: id,
    descripcion: `Usuario eliminado: ${anterior?.usuario ?? id}`,
    datos_anteriores: anterior ?? null,
  });
  revalidatePath("/configuracion");
}

export async function agregarValorMaestro(tipo: string, valor: string) {
  const sesion = await requierePermiso("configuracion");
  if (!valor?.trim()) throw new Error("El valor es obligatorio.");
  const limpio = valor.trim();
  const { data, error } = await db().from("listas_maestras").insert({ tipo, valor: limpio }).select("id").single();
  if (error) throw new Error(error.message.includes("duplicate") ? "Ese valor ya existe en la lista." : error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "crear",
    entidad_tipo: "listas_maestras", entidad_id: data.id,
    descripcion: `Valor "${limpio}" agregado a lista "${tipo}"`,
    datos_nuevos: { tipo, valor: limpio },
  });
  revalidatePath("/configuracion");
  revalidatePath("/financiero");
}

export async function eliminarValorMaestro(id: number) {
  const sesion = await requierePermiso("configuracion");
  const { data: anterior } = await db().from("listas_maestras").select("*").eq("id", id).single();
  const { error } = await db().from("listas_maestras").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "eliminar",
    entidad_tipo: "listas_maestras", entidad_id: id,
    descripcion: `Valor "${anterior?.valor ?? id}" eliminado de lista "${anterior?.tipo ?? ""}"`,
    datos_anteriores: anterior ?? null,
  });
  revalidatePath("/configuracion");
  revalidatePath("/financiero");
}

export async function crearProducto(nombre: string) {
  const sesion = await requierePermiso("configuracion");
  const limpio = nombre?.trim();
  if (!limpio) throw new Error("El nombre del producto es obligatorio.");
  const { data, error } = await db().from("productos").insert({ nombre: limpio }).select("id").single();
  if (error) throw new Error(error.message.includes("duplicate") ? "Ese producto ya existe." : error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "crear",
    entidad_tipo: "productos", entidad_id: data.id,
    descripcion: `Producto creado: ${limpio}`,
    datos_nuevos: { nombre: limpio },
  });
  revalidatePath("/configuracion");
  revalidatePath("/ventas");
}

export async function eliminarProducto(id: number) {
  const sesion = await requierePermiso("configuracion");
  const { data: anterior } = await db().from("productos").select("*").eq("id", id).single();
  const { error } = await db().from("productos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "eliminar",
    entidad_tipo: "productos", entidad_id: id,
    descripcion: `Producto eliminado: ${anterior?.nombre ?? id}`,
    datos_anteriores: anterior ?? null,
  });
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
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "cambiar_clave",
    entidad_tipo: "configuracion_sistema", entidad_id: data.id,
    descripcion: "PIN de autorización cambiado",
  });
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
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "configuracion", accion: "cambiar_clave",
    entidad_tipo: "configuracion_sistema", entidad_id: data.id,
    descripcion: "Clave de contadora cambiada",
  });
  revalidatePath("/configuracion");
}
