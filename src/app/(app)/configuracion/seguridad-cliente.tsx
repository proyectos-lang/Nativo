"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarPinAutorizacion, cambiarClaveContadora, cambiarFrecuenciaConteo } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Calculator, ClipboardCheck } from "lucide-react";

export function SeguridadCliente({ frecuenciaConteo }: { frecuenciaConteo: string }) {
  const [pendiente, startTransition] = useTransition();
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinConfirmar, setPinConfirmar] = useState("");

  const [pendienteContadora, startTransitionContadora] = useTransition();
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");
  const [claveConfirmar, setClaveConfirmar] = useState("");

  const [pendienteFrecuencia, startTransitionFrecuencia] = useTransition();
  const [frecuencia, setFrecuencia] = useState(frecuenciaConteo || "ninguna");

  const guardarFrecuencia = () => {
    startTransitionFrecuencia(async () => {
      try {
        await cambiarFrecuenciaConteo(frecuencia === "ninguna" ? "" : frecuencia);
        toast.success("Frecuencia de conteo actualizada");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

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

  const cambiarContadora = () => {
    if (claveNueva !== claveConfirmar) return toast.error("La nueva clave y su confirmación no coinciden.");
    startTransitionContadora(async () => {
      try {
        await cambiarClaveContadora(claveActual, claveNueva);
        toast.success("Clave de la contadora actualizada");
        setClaveActual(""); setClaveNueva(""); setClaveConfirmar("");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <div className="mt-2 grid max-w-md gap-4">
      <Card>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="size-5 text-primary" /> Clave de la Contadora</CardTitle>
          <p className="text-sm text-muted-foreground">
            Se pide al editar un gasto o ingreso en Financiero. Compártela solo con la contadora.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Clave actual</Label><Input type="password" value={claveActual} onChange={e => setClaveActual(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Nueva clave</Label><Input type="password" value={claveNueva} onChange={e => setClaveNueva(e.target.value)} placeholder="Mínimo 4 caracteres" /></div>
          <div className="grid gap-1.5"><Label>Confirmar nueva clave</Label><Input type="password" value={claveConfirmar} onChange={e => setClaveConfirmar(e.target.value)} /></div>
          <Button onClick={cambiarContadora} disabled={pendienteContadora || !claveActual || !claveNueva || !claveConfirmar}>
            {pendienteContadora ? "Guardando..." : "Cambiar Clave"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /> Conteo Físico de Inventario</CardTitle>
          <p className="text-sm text-muted-foreground">
            Con qué frecuencia debe recordarse hacer un arqueo del inventario. El recordatorio aparece en el dashboard cuando se vence.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Frecuencia</Label>
            <Select value={frecuencia} onValueChange={v => v && setFrecuencia(v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Sin recordatorio</SelectItem>
                <SelectItem value="Mensual">Mensual</SelectItem>
                <SelectItem value="Trimestral">Trimestral</SelectItem>
                <SelectItem value="Semestral">Semestral</SelectItem>
                <SelectItem value="Anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={guardarFrecuencia} disabled={pendienteFrecuencia}>
            {pendienteFrecuencia ? "Guardando..." : "Guardar Frecuencia"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
