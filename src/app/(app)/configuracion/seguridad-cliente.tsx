"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarPinAutorizacion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert } from "lucide-react";

export function SeguridadCliente() {
  const [pendiente, startTransition] = useTransition();
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinConfirmar, setPinConfirmar] = useState("");

  const cambiar = () => {
    if (pinNuevo !== pinConfirmar) return toast.error("El nuevo PIN y su confirmación no coinciden.");
    startTransition(async () => {
      try {
        await cambiarPinAutorizacion(pinActual, pinNuevo);
        toast.success("PIN de autorización actualizado");
        setPinActual(""); setPinNuevo(""); setPinConfirmar("");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Card className="mt-2 max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-primary" /> PIN de Autorización</CardTitle>
        <p className="text-sm text-muted-foreground">
          Se pide al editar o eliminar una venta en Historial. Compártelo solo con quien deba autorizar esos cambios.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5"><Label>PIN actual</Label><Input type="password" value={pinActual} onChange={e => setPinActual(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Nuevo PIN</Label><Input type="password" value={pinNuevo} onChange={e => setPinNuevo(e.target.value)} placeholder="Mínimo 4 caracteres" /></div>
        <div className="grid gap-1.5"><Label>Confirmar nuevo PIN</Label><Input type="password" value={pinConfirmar} onChange={e => setPinConfirmar(e.target.value)} /></div>
        <Button onClick={cambiar} disabled={pendiente || !pinActual || !pinNuevo || !pinConfirmar}>
          {pendiente ? "Guardando..." : "Cambiar PIN"}
        </Button>
      </CardContent>
    </Card>
  );
}
