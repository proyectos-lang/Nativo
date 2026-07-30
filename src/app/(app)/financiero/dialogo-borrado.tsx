"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

/**
 * Confirmación única para todo lo que se borra en Financiero: pide la clave de
 * la contadora y un motivo, y solo entonces ejecuta la acción. El borrado es
 * real, así que el motivo es lo que después explica el hueco en la bitácora.
 */
export function DialogoBorrado({ abierto, onCerrar, titulo, advertencia, etiquetaBoton, onConfirmar }: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  /** Qué se lleva por delante el borrado, en palabras del negocio. */
  advertencia: string;
  etiquetaBoton?: string;
  onConfirmar: (clave: string, motivo: string) => Promise<string>;
}) {
  const [clave, setClave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  const cerrar = () => { setClave(""); setMotivo(""); onCerrar(); };

  const confirmar = () => {
    startTransition(async () => {
      try {
        const mensaje = await onConfirmar(clave, motivo);
        toast.success(mensaje);
        cerrar();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={o => !o && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> {titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">{advertencia}</p>
          <div className="grid gap-1.5">
            <Label>Clave de la contadora *</Label>
            <Input
              type="password" value={clave} autoFocus
              onChange={e => setClave(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && clave) confirmar(); }}
              placeholder="••••"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Motivo *</Label>
            <Textarea
              rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej. Se causó por error, el pago nunca salió del banco"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Queda en la bitácora quién lo borró, cuándo, con qué motivo y una copia completa de lo eliminado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendiente || !clave || !motivo.trim()}>
            {pendiente ? "Eliminando..." : etiquetaBoton || "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
