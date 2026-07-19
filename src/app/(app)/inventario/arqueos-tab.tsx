"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { abrirArqueo, registrarConteo, cerrarArqueo, anularArqueo } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, Plus, FileDown, ShieldAlert } from "lucide-react";
import { formatoPesos, type Arqueo, type ArqueoDetalle, type InventarioUbicacion } from "@/lib/tipos";

type Props = {
  arqueos: Arqueo[];
  detalles: Record<number, ArqueoDetalle[]>;
  ubicaciones: InventarioUbicacion[];
  categorias: string[];
};

const BADGE_ESTADO: Record<string, "outline" | "default" | "destructive"> = {
  Abierto: "outline",
  Cerrado: "default",
  Anulado: "destructive",
};

export function ArqueosTab({ arqueos, detalles, ubicaciones, categorias }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  // Nuevo arqueo
  const [dialogNuevo, setDialogNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ categoria: "", ubicacion_id: 0, observaciones: "" });

  // Conteo
  const [arqueoSel, setArqueoSel] = useState<Arqueo | null>(null);
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [busquedaConteo, setBusquedaConteo] = useState("");

  // Cierre / anulación con PIN
  const [dialogPin, setDialogPin] = useState<"cerrar" | "anular" | null>(null);
  const [pin, setPin] = useState("");

  const correr = (fn: () => Promise<unknown>, exito: string, cerrar?: () => void) => {
    startTransition(async () => {
      try {
        await fn();
        toast.success(exito);
        cerrar?.();
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirConteo = (a: Arqueo) => {
    setArqueoSel(a);
    setBusquedaConteo("");
    const iniciales: Record<number, string> = {};
    for (const d of detalles[a.id] || []) {
      if (d.cantidad_fisica != null) iniciales[d.id] = String(d.cantidad_fisica);
    }
    setConteos(iniciales);
  };

  const detallesSel = useMemo(() => {
    if (!arqueoSel) return [];
    const q = busquedaConteo.toLowerCase().trim();
    return (detalles[arqueoSel.id] || []).filter(d => !q || d.producto.toLowerCase().includes(q));
  }, [arqueoSel, detalles, busquedaConteo]);

  const resumenSel = useMemo(() => {
    if (!arqueoSel) return null;
    const dets = detalles[arqueoSel.id] || [];
    const contados = dets.filter(d => conteos[d.id] !== undefined && conteos[d.id] !== "" || d.cantidad_fisica != null);
    let diferencias = 0, valor = 0;
    for (const d of dets) {
      const fisicaStr = conteos[d.id];
      const fisica = fisicaStr !== undefined && fisicaStr !== "" ? Number(fisicaStr) : d.cantidad_fisica;
      if (fisica == null || isNaN(Number(fisica))) continue;
      const dif = Number(fisica) - Number(d.cantidad_sistema);
      if (dif !== 0) { diferencias++; valor += dif * Number(d.costo_unitario); }
    }
    return { total: dets.length, contados: contados.length, diferencias, valor };
  }, [arqueoSel, detalles, conteos]);

  const guardarConteos = () => {
    if (!arqueoSel) return;
    const filas = Object.entries(conteos)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)) && Number(v) >= 0)
      .map(([id, v]) => ({ detalle_id: Number(id), cantidad_fisica: Number(v) }));
    if (!filas.length) { toast.error("Ingresa al menos una cantidad física."); return; }
    correr(() => registrarConteo(arqueoSel.id, filas), "Conteos guardados");
  };

  const confirmarPin = () => {
    if (!arqueoSel || !dialogPin) return;
    if (dialogPin === "cerrar") {
      startTransition(async () => {
        try {
          // Guarda los conteos pendientes antes de cerrar
          const filas = Object.entries(conteos)
            .filter(([, v]) => v !== "" && !isNaN(Number(v)) && Number(v) >= 0)
            .map(([id, v]) => ({ detalle_id: Number(id), cantidad_fisica: Number(v) }));
          if (filas.length) await registrarConteo(arqueoSel.id, filas);
          const r = await cerrarArqueo(arqueoSel.id, pin);
          toast.success(`Arqueo cerrado: ${r.ajustados} ajuste(s), diferencia ${formatoPesos(r.valor_diferencia)}`);
          setDialogPin(null);
          setArqueoSel(null);
          router.refresh();
        } catch (e) { toast.error((e as Error).message); }
      });
    } else {
      correr(() => anularArqueo(arqueoSel.id, pin), "Arqueo anulado", () => { setDialogPin(null); setArqueoSel(null); });
    }
  };

  const exportarArqueo = async (a: Arqueo) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filas = (detalles[a.id] || []).map(d => ({
      Producto: d.producto,
      Ubicacion: d.ubicacion || "",
      "Cantidad Sistema": d.cantidad_sistema,
      "Cantidad Fisica": d.cantidad_fisica ?? "",
      Diferencia: d.diferencia ?? "",
      "Costo Unitario": d.costo_unitario,
      "Diferencia Valorizada": d.diferencia != null ? Number(d.diferencia) * Number(d.costo_unitario) : "",
      "Contado Por": d.usuario || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), `Arqueo ${a.numero}`);
    XLSX.writeFile(wb, `Arqueo_${a.numero}.xlsx`);
  };

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Conteos físicos del inventario. El cuadre final exige el PIN de autorización de gerencia.
        </p>
        <Button onClick={() => { setFormNuevo({ categoria: "", ubicacion_id: 0, observaciones: "" }); setDialogNuevo(true); }}>
          <Plus className="size-4" /> Nuevo Arqueo
        </Button>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[500px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Alcance</TableHead>
                  <TableHead className="text-right">Referencias</TableHead>
                  <TableHead className="text-right">Diferencia valorizada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arqueos.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin arqueos. Crea el primero con &quot;Nuevo Arqueo&quot;.</TableCell></TableRow>
                )}
                {arqueos.map(a => {
                  const dets = detalles[a.id] || [];
                  const valorDif = dets.reduce((s, d) => s + (d.diferencia != null ? Number(d.diferencia) * Number(d.costo_unitario) : 0), 0);
                  const alcance = [a.categoria, a.ubicacion_id ? ubicaciones.find(u => u.id === a.ubicacion_id)?.nombre : null].filter(Boolean).join(" · ") || "Total";
                  return (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => abrirConteo(a)}>
                      <TableCell className="font-semibold">#{a.numero}</TableCell>
                      <TableCell className="text-xs">{new Date(a.fecha_inicio).toLocaleString("es-CO")}</TableCell>
                      <TableCell>{alcance}</TableCell>
                      <TableCell className="text-right">{dets.length}</TableCell>
                      <TableCell className={`text-right font-medium ${valorDif < 0 ? "text-destructive" : ""}`}>{formatoPesos(valorDif)}</TableCell>
                      <TableCell><Badge variant={BADGE_ESTADO[a.estado] || "outline"}>{a.estado}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" title="Exportar" onClick={e => { e.stopPropagation(); exportarArqueo(a); }}>
                          <FileDown className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG NUEVO ARQUEO */}
      <Dialog open={dialogNuevo} onOpenChange={setDialogNuevo}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Arqueo (conteo físico)</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Puedes contar todo el inventario, o solo una categoría/ubicación (conteo cíclico) sin detener la operación.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Categoría (opcional)</Label>
                <Select value={formNuevo.categoria || "todas"} onValueChange={v => setFormNuevo({ ...formNuevo, categoria: !v || v === "todas" ? "" : v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Ubicación (opcional)</Label>
                <Select value={formNuevo.ubicacion_id ? String(formNuevo.ubicacion_id) : "todas"} onValueChange={v => setFormNuevo({ ...formNuevo, ubicacion_id: !v || v === "todas" ? 0 : Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {ubicaciones.filter(u => u.activa).map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Observaciones</Label><Textarea rows={2} value={formNuevo.observaciones} onChange={e => setFormNuevo({ ...formNuevo, observaciones: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNuevo(false)}>Cancelar</Button>
            <Button
              disabled={pendiente}
              onClick={() => correr(
                () => abrirArqueo({ ...formNuevo, ubicacion_id: formNuevo.ubicacion_id || undefined }),
                "Arqueo abierto — registra las cantidades físicas",
                () => setDialogNuevo(false),
              )}
            >
              <ClipboardCheck className="size-4" /> Abrir Arqueo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG CONTEO / DETALLE */}
      <Dialog open={!!arqueoSel} onOpenChange={o => !o && setArqueoSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Arqueo #{arqueoSel?.numero} · <Badge variant={BADGE_ESTADO[arqueoSel?.estado || ""] || "outline"}>{arqueoSel?.estado}</Badge>
            </DialogTitle>
          </DialogHeader>
          {arqueoSel && (
            <div className="grid gap-3">
              {resumenSel && (
                <div className="flex flex-wrap gap-4 rounded-md border bg-muted/40 p-3 text-sm">
                  <span>Referencias: <span className="font-bold">{resumenSel.total}</span></span>
                  <span>Contadas: <span className="font-bold">{resumenSel.contados}</span></span>
                  <span>Con diferencia: <span className="font-bold">{resumenSel.diferencias}</span></span>
                  <span>Diferencia valorizada: <span className={`font-bold ${resumenSel.valor < 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(resumenSel.valor)}</span></span>
                </div>
              )}
              <Input placeholder="Buscar producto..." value={busquedaConteo} onChange={e => setBusquedaConteo(e.target.value)} />
              <div className="max-h-[45vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead className="text-right">Sistema</TableHead>
                      <TableHead className="text-right">Física</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detallesSel.map(d => {
                      const valor = conteos[d.id] ?? (d.cantidad_fisica != null ? String(d.cantidad_fisica) : "");
                      const dif = valor !== "" && !isNaN(Number(valor)) ? Number(valor) - Number(d.cantidad_sistema) : null;
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="max-w-52 truncate">{d.producto}</TableCell>
                          <TableCell>{d.ubicacion || "-"}</TableCell>
                          <TableCell className="text-right">{d.cantidad_sistema}</TableCell>
                          <TableCell className="text-right">
                            {arqueoSel.estado === "Abierto" ? (
                              <Input
                                type="number" min={0} className="ml-auto h-8 w-24 text-right"
                                value={valor}
                                onChange={e => setConteos(prev => ({ ...prev, [d.id]: e.target.value }))}
                              />
                            ) : (d.cantidad_fisica ?? "-")}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${dif == null || dif === 0 ? "" : dif > 0 ? "text-primary" : "text-destructive"}`}>
                            {dif == null ? "-" : dif > 0 ? `+${dif}` : dif}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {arqueoSel.estado === "Abierto" && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldAlert className="size-3.5" /> Cerrar y cuadrar aplica los ajustes al inventario y requiere el PIN de gerencia.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <div className="flex flex-wrap gap-2">
              {arqueoSel?.estado === "Abierto" && (
                <>
                  <Button variant="outline" onClick={guardarConteos} disabled={pendiente}>Guardar Conteos</Button>
                  <Button variant="outline" className="text-destructive" onClick={() => { setPin(""); setDialogPin("anular"); }} disabled={pendiente}>Anular</Button>
                  <Button onClick={() => { setPin(""); setDialogPin("cerrar"); }} disabled={pendiente}>Cerrar y Cuadrar</Button>
                </>
              )}
              {arqueoSel?.estado !== "Abierto" && (
                <Button variant="outline" onClick={() => setArqueoSel(null)}>Cerrar</Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG PIN */}
      <Dialog open={!!dialogPin} onOpenChange={o => !o && setDialogPin(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogPin === "cerrar" ? "Autorizar cuadre de inventario" : "Anular arqueo"}</DialogTitle>
          </DialogHeader>
          {dialogPin === "cerrar" && resumenSel && (
            <p className="text-sm text-muted-foreground">
              Se aplicarán {resumenSel.diferencias} ajuste(s) con diferencia valorizada de {formatoPesos(resumenSel.valor)}. Esta acción es definitiva.
            </p>
          )}
          <div className="grid gap-1.5">
            <Label>PIN de autorización (gerencia)</Label>
            <Input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmarPin()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPin(null)}>Cancelar</Button>
            <Button variant={dialogPin === "anular" ? "destructive" : "default"} onClick={confirmarPin} disabled={pendiente || !pin.trim()}>
              {pendiente ? "Procesando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
