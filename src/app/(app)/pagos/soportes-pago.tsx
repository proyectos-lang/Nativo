"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { subirSoportePago, adjuntarSoportePago, eliminarSoportePago, type SoporteNuevo } from "./acciones";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Paperclip, Trash2, FileText, Upload } from "lucide-react";
import { formatoFecha, soporteEsPdf, type Pago, type SoportePago } from "@/lib/tipos";

const ACEPTA = "image/png,image/jpeg,image/webp,image/heic,application/pdf";

/** Miniatura de un comprobante: imagen si lo es, enlace si es PDF. */
function Miniatura({ url, nombre, esPdf }: { url: string; nombre: string; esPdf: boolean }) {
  if (esPdf) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted/40 text-xs hover:bg-muted">
        <FileText className="size-6" />
        PDF
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={nombre}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nombre} className="size-20 rounded-md border object-cover transition hover:opacity-80" />
    </a>
  );
}

/**
 * Selector de comprobantes para el formulario de un abono NUEVO. Los archivos
 * se suben al elegirlos (y quedan en el bucket), pero solo se asocian al abono
 * cuando el pago se guarda: es `registrarPago` quien los cuelga.
 */
export function SelectorSoportes({ soportes, onCambio }: {
  soportes: SoporteNuevo[];
  onCambio: (s: SoporteNuevo[]) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const elegir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setSubiendo(true);
    const nuevos: SoporteNuevo[] = [];
    for (const archivo of Array.from(archivos)) {
      try {
        const fd = new FormData();
        fd.append("archivo", archivo);
        nuevos.push(await subirSoportePago(fd));
      } catch (e) {
        toast.error(`${archivo.name}: ${(e as Error).message}`);
      }
    }
    if (nuevos.length) {
      onCambio([...soportes, ...nuevos]);
      toast.success(`${nuevos.length} soporte(s) listo(s)`);
    }
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Soportes de pago</Label>
        <Button type="button" variant="outline" size="sm" disabled={subiendo} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {subiendo ? "Subiendo..." : "Adjuntar"}
        </Button>
      </div>
      <input
        ref={inputRef} type="file" accept={ACEPTA} multiple className="hidden"
        onChange={e => elegir(e.target.files)}
      />
      {soportes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {soportes.map((s, i) => (
            <div key={s.url} className="relative">
              <Miniatura url={s.url} nombre={s.nombre_archivo || "soporte"} esPdf={soporteEsPdf(s)} />
              <Button
                type="button" variant="destructive" size="icon"
                className="absolute -right-2 -top-2 size-6"
                title="Quitar"
                onClick={() => onCambio(soportes.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Comprobante de la transferencia, la consignación o el recibo. Imagen o PDF, hasta 5MB cada uno.
        </p>
      )}
    </div>
  );
}

/** Botón con el conteo de soportes de un abono ya registrado. */
export function BotonSoportes({ cantidad, onClick }: { cantidad: number; onClick: () => void }) {
  return (
    <Button
      variant="ghost" size="icon"
      title={cantidad ? `${cantidad} soporte(s)` : "Adjuntar soporte"}
      onClick={onClick}
      className={cantidad ? "" : "text-muted-foreground"}
    >
      <span className="relative">
        <Paperclip className="size-4" />
        {cantidad > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {cantidad}
          </span>
        )}
      </span>
    </Button>
  );
}

/** Ver, adjuntar y quitar los comprobantes de un abono existente. */
export function DialogoSoportes({ pago, soportes, onCerrar }: {
  pago: Pago | null;
  soportes: SoportePago[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const adjuntar = async (archivos: FileList | null) => {
    if (!archivos?.length || !pago) return;
    setSubiendo(true);
    const nuevos: SoporteNuevo[] = [];
    for (const archivo of Array.from(archivos)) {
      try {
        const fd = new FormData();
        fd.append("archivo", archivo);
        nuevos.push(await subirSoportePago(fd));
      } catch (e) {
        toast.error(`${archivo.name}: ${(e as Error).message}`);
      }
    }
    if (nuevos.length) {
      try {
        await adjuntarSoportePago({ pago_id: pago.id, soportes: nuevos });
        toast.success(`${nuevos.length} soporte(s) adjuntado(s)`);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    }
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const quitar = (s: SoportePago) => {
    if (!confirm(`¿Quitar "${s.nombre_archivo || "este soporte"}"? Se elimina también el archivo.`)) return;
    startTransition(async () => {
      try {
        await eliminarSoportePago(s.id);
        toast.success("Soporte eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Dialog open={!!pago} onOpenChange={o => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Soportes del abono del {formatoFecha(pago?.fecha)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{soportes.length} archivo(s)</p>
            <Button type="button" variant="outline" size="sm" disabled={subiendo} onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> {subiendo ? "Subiendo..." : "Adjuntar"}
            </Button>
          </div>
          <input
            ref={inputRef} type="file" accept={ACEPTA} multiple className="hidden"
            onChange={e => adjuntar(e.target.files)}
          />

          {soportes.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este abono no tiene comprobantes. Adjunta la transferencia, la consignación o el recibo.
            </p>
          ) : (
            <div className="grid gap-2">
              {soportes.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-md border p-2">
                  <Miniatura url={s.url} nombre={s.nombre_archivo || "soporte"} esPdf={soporteEsPdf(s)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{s.nombre_archivo || "Soporte"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatoFecha(s.creado_en)}{s.usuario ? ` — ${s.usuario}` : ""}
                    </p>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                      Abrir en pestaña nueva
                    </a>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="text-destructive" title="Quitar soporte"
                    disabled={pendiente} onClick={() => quitar(s)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
