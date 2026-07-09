"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoNativo } from "@/components/logo-nativo";

export default function PaginaLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, {});

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-950 p-4">
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-green-400/15 blur-3xl" />
      <Card className="w-full max-w-sm border-white/10 shadow-2xl">
        <CardHeader className="text-center">
          <LogoNativo className="mx-auto mb-2 size-20 shadow-lg" />
          <CardTitle className="text-lg leading-snug">
            Sistema de Control de Pedidos y Despachos Nativo
          </CardTitle>
          <CardDescription>Inicia sesión para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={accion} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="usuario">Usuario</Label>
              <Input id="usuario" name="usuario" autoComplete="username" autoFocus required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contrasena">Contraseña</Label>
              <Input id="contrasena" name="contrasena" type="password" autoComplete="current-password" required />
            </div>
            {estado?.error && (
              <p className="text-sm text-destructive">{estado.error}</p>
            )}
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Verificando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
