"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { subirImagenLinea } from "@/app/(app)/ventas/acciones";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

/** Subida de una imagen de referencia (estampado/bordado) para una línea de venta. */
export function SubidaImagen({ label, url, onChange }: {
  label: string;
  url: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const [pendiente, startTransition] = useTransition();

  const manejarArchivo = (archivo: File | undefined) => {
    if (!archivo) return;
    const formData = new FormData();
    formData.append("archivo", archivo);
    startTransition(async () => {
      try {
        const nuevaUrl = await subirImagenLinea(formData);
        onChange(nuevaUrl);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {url ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="h-20 w-20 rounded-md border object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-destructive text-white"
            title="Quitar imagen"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Input type="file" accept="image/*" disabled={pendiente} onChange={e => manejarArchivo(e.target.files?.[0])} />
      )}
      {pendiente && <p className="text-xs text-muted-foreground">Subiendo...</p>}
    </div>
  );
}
