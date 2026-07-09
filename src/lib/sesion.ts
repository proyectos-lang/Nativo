import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Sesion, Modulo } from "./tipos";

const COOKIE = "nativo_sesion";
const DURACION_HORAS = 12;

function secreto() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Falta SESSION_SECRET en las variables de entorno");
  return new TextEncoder().encode(s);
}

export async function crearSesion(datos: Sesion) {
  const token = await new SignJWT(datos as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_HORAS}h`)
    .sign(secreto());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURACION_HORAS * 3600,
    path: "/",
  });
}

export async function cerrarSesion() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function obtenerSesion(): Promise<Sesion | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto());
    return payload as unknown as Sesion;
  } catch {
    return null;
  }
}

/** Para páginas: redirige a /login si no hay sesión. */
export async function requiereSesion(): Promise<Sesion> {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  return s;
}

/** Para server actions: lanza error si no hay sesión o no tiene el permiso. */
export async function requierePermiso(modulo: Modulo): Promise<Sesion> {
  const s = await obtenerSesion();
  if (!s) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  if (s.rol !== "admin" && !s.permisos?.[modulo]) {
    throw new Error("No tienes permiso para esta acción.");
  }
  return s;
}
