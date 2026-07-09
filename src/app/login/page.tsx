"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package } from "lucide-react";

export default function PaginaLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, {});

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 to-green-100 p-4 dark:from-emerald-950 dark:to-green-950">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Package className="size-6" />
          </div>
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
            <Button type="submit" disabled={pendiente} className="bg-emerald-700 hover:bg-emerald-800">
              {pendiente ? "Verificando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
