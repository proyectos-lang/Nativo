"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  crearSolicitud, agregarComentario, cambiarEstadoSolicitud, finalizarSolicitud,
  reasignarSolicitud, cancelarSolicitud, subirAdjuntoSolicitud, guardarAdjunto, quitarAdjunto,
} from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Plus, Paperclip, X, Send, CheckCircle2, UserCog } from "lucide-react";
import type { Solicitud, SolicitudHistorial, SolicitudAdjunto } from "@/lib/tipos";

type Usuario = { id: number; nombre: string };
type SesionUI = { id: number; nombre: string; rol: "admin" | "usuario" };

const ESTADOS = ["Pendiente", "En proceso", "Esperando información", "Esperando aprobación", "Finalizada", "Cancelada"] as const;
const ESTADOS_CAMBIABLES = ["Pendiente", "En proceso", "Esperando información", "Esperando aprobación"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const ACTIVOS = ["Pendiente", "En proceso", "Esperando información", "Esperando aprobación"];

function claseEstado(e: string): string {
  switch (e) {
    case "Pendiente": return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "En proceso": return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "Esperando información": return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300";
    case "Esperando aprobación": return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
    case "Finalizada": return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
    case "Cancelada": return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
}
function clasePrioridad(p: string): string {
  switch (p) {
    case "Urgente": return "bg-red-600 text-white";
    case "Alta": return "bg-orange-500 text-white";
    case "Media": return "bg-blue-500 text-white";
    default: return "bg-slate-400 text-white";
  }
}
function hoy() { return new Date().toISOString().slice(0, 10); }
function fechaHora(f: string) { return new Date(f).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); }
function estaVencida(s: Solicitud) { return !!s.fecha_limite && ACTIVOS.includes(s.estado) && s.fecha_limite < hoy(); }

type NuevoAdjunto = { url: string; nombre?: string; tipo?: string | null };

export function SolicitudesCliente({ solicitudes, historial, adjuntos, usuarios, areas, sesion }: {
  solicitudes: Solicitud[];
  historial: Record<number, SolicitudHistorial[]>;
  adjuntos: Record<number, SolicitudAdjunto[]>;
  usuarios: Usuario[];
  areas: string[];
  sesion: SesionUI;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [fResponsable, setFResponsable] = useState("todos");
  const [fEstado, setFEstado] = useState("activas");
  const [fArea, setFArea] = useState("todas");
  const [fPrioridad, setFPrioridad] = useState("todas");

  // Nueva solicitud
  const [abierto, setAbierto] = useState(false);
  const [respSel, setRespSel] = useState<Usuario | null>(null);
  const [busqResp, setBusqResp] = useState("");
  const [form, setForm] = useState({ area: "", titulo: "", descripcion: "", prioridad: "Media", fecha_limite: "" });
  const [nuevosAdjuntos, setNuevosAdjuntos] = useState<NuevoAdjunto[]>([]);

  // Detalle
  const [detId, setDetId] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [obsFinal, setObsFinal] = useState("");
  const [reasSel, setReasSel] = useState<Usuario | null>(null);
  const [busqReas, setBusqReas] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState("");

  const detalle = detId != null ? solicitudes.find(s => s.id === detId) || null : null;

  const kpis = useMemo(() => {
    const c = { pendientes: 0, enProceso: 0, finalizadas: 0, vencidas: 0 };
    for (const s of solicitudes) {
      if (s.estado === "Pendiente") c.pendientes++;
      else if (s.estado === "En proceso") c.enProceso++;
      else if (s.estado === "Finalizada") c.finalizadas++;
      if (estaVencida(s)) c.vencidas++;
    }
    return c;
  }, [solicitudes]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return solicitudes.filter(s => {
      if (fEstado === "activas" && !ACTIVOS.includes(s.estado)) return false;
      if (fEstado !== "activas" && fEstado !== "todas" && s.estado !== fEstado) return false;
      if (fResponsable !== "todos" && String(s.responsable_id) !== fResponsable) return false;
      if (fArea !== "todas" && (s.area || "") !== fArea) return false;
      if (fPrioridad !== "todas" && s.prioridad !== fPrioridad) return false;
      if (!q) return true;
      return s.titulo.toLowerCase().includes(q) || (s.descripcion || "").toLowerCase().includes(q) ||
        (s.responsable || "").toLowerCase().includes(q) || (s.solicitado_por || "").toLowerCase().includes(q) ||
        String(s.numero) === q;
    });
  }, [solicitudes, busqueda, fEstado, fResponsable, fArea, fPrioridad]);

  const puedeIntervenir = (s: Solicitud) => sesion.rol === "admin" || s.responsable_id === sesion.id || s.solicitado_por_id === sesion.id;
  const puedeFinalizar = (s: Solicitud) => sesion.rol === "admin" || s.responsable_id === sesion.id;

  const correr = (fn: () => Promise<unknown>, exito: string, despues?: () => void) => {
    startTransition(async () => {
      try { await fn(); toast.success(exito); despues?.(); router.refresh(); }
      catch (e) { toast.error((e as Error).message); }
    });
  };

  const subir = async (archivo: File | undefined, onOk: (a: NuevoAdjunto) => void) => {
    if (!archivo) return;
    try {
      const fd = new FormData(); fd.append("archivo", archivo);
      const a = await subirAdjuntoSolicitud(fd);
      onOk(a);
      toast.success("Archivo subido");
    } catch (e) { toast.error((e as Error).message); }
  };

  const abrirNueva = () => {
    setRespSel(null); setBusqResp(""); setNuevosAdjuntos([]);
    setForm({ area: "", titulo: "", descripcion: "", prioridad: "Media", fecha_limite: "" });
    setAbierto(true);
  };

  const guardarNueva = () => {
    if (!respSel) { toast.error("Elige a quién va dirigida."); return; }
    if (!form.titulo.trim()) { toast.error("El título es obligatorio."); return; }
    startTransition(async () => {
      try {
        const r = await crearSolicitud({
          responsable_id: respSel.id, area: form.area, titulo: form.titulo,
          descripcion: form.descripcion, prioridad: form.prioridad, fecha_limite: form.fecha_limite || undefined,
        });
        for (const a of nuevosAdjuntos) await guardarAdjunto(r.id, a);
        toast.success(`Solicitud #${r.numero} creada`);
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirDetalle = (s: Solicitud) => {
    setDetId(s.id); setComentario(""); setObsFinal(""); setReasSel(null); setBusqReas(""); setNuevoEstado("");
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Inbox className="size-5" /> Solicitudes Internas</h2>
          <p className="text-sm text-muted-foreground">Peticiones y tareas entre el equipo, con seguimiento y trazabilidad.</p>
        </div>
        <Button onClick={abrirNueva}><Plus className="size-4" /> Nueva Solicitud</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { t: "Pendientes", v: kpis.pendientes },
          { t: "En proceso", v: kpis.enProceso },
          { t: "Finalizadas", v: kpis.finalizadas },
          { t: "Vencidas", v: kpis.vencidas, alerta: true },
        ].map(k => (
          <Card key={k.t}><CardContent className="pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">{k.t}</p>
            <p className={`text-2xl font-bold ${k.alerta && k.v > 0 ? "text-destructive" : ""}`}>{k.v}</p>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Solicitudes</TabsTrigger>
          <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardContent className="grid gap-3 pt-2">
              <div className="flex flex-wrap items-end gap-2">
                <Input className="w-56" placeholder="Buscar por título, persona, #..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <Select value={fEstado} onValueChange={v => v && setFEstado(v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activas">Activas</SelectItem>
                    <SelectItem value="todas">Todos los estados</SelectItem>
                    {ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fResponsable} onValueChange={v => v && setFResponsable(v)}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Responsable" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los responsables</SelectItem>
                    {usuarios.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fArea} onValueChange={v => v && setFArea(v)}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Área" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las áreas</SelectItem>
                    {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fPrioridad} onValueChange={v => v && setFPrioridad(v)}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Prioridad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Toda prioridad</SelectItem>
                    {PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="ml-auto text-sm text-muted-foreground">{lista.length} de {solicitudes.length}</p>
              </div>

              <div className="max-h-[560px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Solicitud</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha límite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin solicitudes.</TableCell></TableRow>
                    )}
                    {lista.map(s => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => abrirDetalle(s)}>
                        <TableCell className="font-semibold">#{s.numero}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fechaHora(s.fecha_creacion)}</TableCell>
                        <TableCell>{s.solicitado_por || "-"}</TableCell>
                        <TableCell>{s.responsable || "-"}</TableCell>
                        <TableCell className="max-w-64">
                          <span className="block truncate font-medium">{s.titulo}</span>
                          {s.area && <span className="block text-xs text-muted-foreground">{s.area}</span>}
                        </TableCell>
                        <TableCell><span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${clasePrioridad(s.prioridad)}`}>{s.prioridad}</span></TableCell>
                        <TableCell><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${claseEstado(s.estado)}`}>{s.estado}</span></TableCell>
                        <TableCell className={`whitespace-nowrap text-xs ${estaVencida(s) ? "font-bold text-destructive" : ""}`}>{s.fecha_limite || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indicadores">
          <Indicadores solicitudes={solicitudes} historial={historial} usuarios={usuarios} />
        </TabsContent>
      </Tabs>

      {/* DIALOG NUEVA SOLICITUD */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nueva Solicitud</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Dirigido a *</Label>
              <Combobox
                items={usuarios} itemToStringLabel={(u: Usuario | null) => u?.nombre ?? ""}
                value={respSel} onValueChange={v => setRespSel((v as Usuario) ?? null)}
                inputValue={busqResp} onInputValueChange={v => setBusqResp(v ?? "")} openOnInputClick
              >
                <ComboboxInput placeholder="Elige una persona responsable..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>Sin coincidencias.</ComboboxEmpty>
                  <ComboboxList>{(u: Usuario) => <ComboboxItem key={u.id} value={u}>{u.nombre}</ComboboxItem>}</ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Área (opcional)</Label><Combo opciones={areas} value={form.area} onChange={v => setForm({ ...form, area: v })} placeholder="Escriba o elija..." /></div>
              <div className="grid gap-1.5">
                <Label>Prioridad</Label>
                <Select value={form.prioridad} onValueChange={v => v && setForm({ ...form, prioridad: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5"><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Comprar bolsas kraft" /></div>
            <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={3} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Explica exactamente qué necesitas..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Fecha límite (opcional)</Label><Input type="date" value={form.fecha_limite} onChange={e => setForm({ ...form, fecha_limite: e.target.value })} /></div>
              <div className="grid gap-1.5">
                <Label>Adjuntos</Label>
                <Input type="file" accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx" onChange={e => subir(e.target.files?.[0], a => setNuevosAdjuntos(prev => [...prev, a]))} />
              </div>
            </div>
            {nuevosAdjuntos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {nuevosAdjuntos.map((a, i) => (
                  <span key={i} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">
                    <Paperclip className="size-3" />{a.nombre || "archivo"}
                    <button type="button" onClick={() => setNuevosAdjuntos(prev => prev.filter((_, j) => j !== i))}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardarNueva} disabled={pendiente || !form.titulo.trim() || !respSel}>Crear Solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DETALLE / CONVERSACIÓN */}
      <Dialog open={detId !== null} onOpenChange={o => !o && setDetId(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  #{detalle.numero} · {detalle.titulo}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${claseEstado(detalle.estado)}`}>{detalle.estado}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                  <div><p className="text-muted-foreground">Solicitó</p><p className="font-medium">{detalle.solicitado_por || "-"}</p></div>
                  <div><p className="text-muted-foreground">Responsable</p><p className="font-medium">{detalle.responsable || "-"}</p></div>
                  <div><p className="text-muted-foreground">Prioridad</p><p className="font-medium">{detalle.prioridad}</p></div>
                  <div><p className="text-muted-foreground">Fecha límite</p><p className={`font-medium ${estaVencida(detalle) ? "text-destructive" : ""}`}>{detalle.fecha_limite || "-"}</p></div>
                </div>
                {detalle.descripcion && <p className="whitespace-pre-wrap rounded-md border p-3 text-sm">{detalle.descripcion}</p>}

                {(adjuntos[detalle.id]?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {adjuntos[detalle.id].map(a => (
                      <span key={a.id} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">
                        <Paperclip className="size-3" />
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline">{a.nombre || "archivo"}</a>
                        {puedeIntervenir(detalle) && <button type="button" onClick={() => correr(() => quitarAdjunto(a.id), "Adjunto eliminado")}><X className="size-3" /></button>}
                      </span>
                    ))}
                  </div>
                )}

                {detalle.observaciones_finales && (
                  <div className="rounded-md border border-green-500/40 bg-green-500/5 p-3 text-sm">
                    <p className="font-semibold text-green-700 dark:text-green-400">Observaciones finales</p>
                    <p className="whitespace-pre-wrap">{detalle.observaciones_finales}</p>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <p className="mb-2 text-sm font-semibold">Seguimiento</p>
                  <ol className="relative ml-3 grid gap-3 border-l pl-4 text-sm">
                    {[...(historial[detalle.id] || [])].reverse().map(h => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                        {h.tipo === "comentario" ? (
                          <span className="font-medium">Comentario</span>
                        ) : h.tipo === "reasignacion" ? (
                          <span className="font-medium">Reasignación</span>
                        ) : h.tipo === "creacion" ? (
                          <span className="font-medium">Creación</span>
                        ) : (
                          <span className="font-medium">{h.estado_anterior || "(inicio)"} → {h.estado_nuevo}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">{fechaHora(h.fecha)} {h.usuario ? `· ${h.usuario}` : ""}</span>
                        {h.comentario && <span className="block text-xs">{h.comentario}</span>}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Acciones (si es Finalizada/Cancelada, solo lectura) */}
                {ACTIVOS.includes(detalle.estado) && puedeIntervenir(detalle) && (
                  <div className="grid gap-3 rounded-md border p-3">
                    <div className="grid gap-1.5">
                      <Label>Agregar comentario / avance</Label>
                      <div className="flex gap-2">
                        <Textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej. Ya pedí la cotización..." />
                        <Button size="icon" disabled={pendiente || !comentario.trim()} onClick={() => correr(() => agregarComentario(detalle.id, comentario), "Comentario agregado", () => setComentario(""))}><Send className="size-4" /></Button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label>Cambiar estado</Label>
                        <div className="flex gap-2">
                          <Select value={nuevoEstado} onValueChange={v => setNuevoEstado(v || "")}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Elegir estado..." /></SelectTrigger>
                            <SelectContent>{ESTADOS_CAMBIABLES.filter(e => e !== detalle.estado).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button variant="outline" disabled={pendiente || !nuevoEstado} onClick={() => correr(() => cambiarEstadoSolicitud(detalle.id, nuevoEstado), "Estado actualizado", () => setNuevoEstado(""))}>Aplicar</Button>
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Reasignar</Label>
                        <div className="flex gap-2">
                          <Combobox
                            items={usuarios} itemToStringLabel={(u: Usuario | null) => u?.nombre ?? ""}
                            value={reasSel} onValueChange={v => setReasSel((v as Usuario) ?? null)}
                            inputValue={busqReas} onInputValueChange={v => setBusqReas(v ?? "")} openOnInputClick
                          >
                            <ComboboxInput placeholder="Nuevo responsable..." className="w-full" showClear />
                            <ComboboxContent>
                              <ComboboxEmpty>Sin coincidencias.</ComboboxEmpty>
                              <ComboboxList>{(u: Usuario) => <ComboboxItem key={u.id} value={u}>{u.nombre}</ComboboxItem>}</ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                          <Button variant="outline" size="icon" disabled={pendiente || !reasSel} title="Reasignar" onClick={() => reasSel && correr(() => reasignarSolicitud(detalle.id, reasSel.id), "Solicitud reasignada", () => setReasSel(null))}><UserCog className="size-4" /></Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label>Adjuntar archivo</Label>
                      <Input type="file" accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx" onChange={e => subir(e.target.files?.[0], a => correr(() => guardarAdjunto(detalle.id, a), "Adjunto agregado"))} />
                    </div>

                    {puedeFinalizar(detalle) && (
                      <div className="grid gap-1.5 rounded-md border border-green-500/40 p-2">
                        <Label>Finalizar (observaciones finales)</Label>
                        <Textarea rows={2} value={obsFinal} onChange={e => setObsFinal(e.target.value)} placeholder="Ej. Se compraron las bolsas y quedaron en bodega." />
                        <Button className="bg-green-600 hover:bg-green-700" disabled={pendiente} onClick={() => correr(() => finalizarSolicitud(detalle.id, obsFinal), "Solicitud finalizada", () => setDetId(null))}><CheckCircle2 className="size-4" /> Finalizar</Button>
                      </div>
                    )}

                    <Button variant="ghost" className="text-destructive" disabled={pendiente} onClick={() => { const m = prompt("Motivo de la cancelación:"); if (m !== null) correr(() => cancelarSolicitud(detalle.id, m), "Solicitud cancelada", () => setDetId(null)); }}>Cancelar solicitud</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function diffHoras(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}
function formatoDuracion(horas: number): string {
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} días`;
}

function Indicadores({ solicitudes, historial, usuarios }: {
  solicitudes: Solicitud[];
  historial: Record<number, SolicitudHistorial[]>;
  usuarios: Usuario[];
}) {
  const datos = useMemo(() => {
    let sumaRespuesta = 0, nRespuesta = 0, sumaEjecucion = 0, nEjecucion = 0;
    for (const s of solicitudes) {
      const hist = historial[s.id] || [];
      const primerProceso = hist.find(h => h.tipo === "cambio_estado" && h.estado_nuevo === "En proceso");
      if (primerProceso) { sumaRespuesta += diffHoras(s.fecha_creacion, primerProceso.fecha); nRespuesta++; }
      if (s.estado === "Finalizada" && s.fecha_finalizacion) { sumaEjecucion += diffHoras(s.fecha_creacion, s.fecha_finalizacion); nEjecucion++; }
    }
    const porColab = usuarios.map(u => ({
      nombre: u.nombre,
      creadas: solicitudes.filter(s => s.solicitado_por_id === u.id).length,
      asignadas: solicitudes.filter(s => s.responsable_id === u.id).length,
      finalizadas: solicitudes.filter(s => s.responsable_id === u.id && s.estado === "Finalizada").length,
    })).filter(x => x.creadas > 0 || x.asignadas > 0);
    return {
      respuesta: nRespuesta ? sumaRespuesta / nRespuesta : null,
      ejecucion: nEjecucion ? sumaEjecucion / nEjecucion : null,
      porColab,
    };
  }, [solicitudes, historial, usuarios]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Tiempo promedio de respuesta</p>
          <p className="text-2xl font-bold">{datos.respuesta != null ? formatoDuracion(datos.respuesta) : "—"}</p>
          <p className="text-xs text-muted-foreground">Desde la creación hasta pasar a &quot;En proceso&quot;.</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Tiempo promedio de ejecución</p>
          <p className="text-2xl font-bold">{datos.ejecucion != null ? formatoDuracion(datos.ejecucion) : "—"}</p>
          <p className="text-xs text-muted-foreground">Desde la creación hasta la finalización.</p>
        </CardContent></Card>
      </div>
      <Card>
        <CardContent className="pt-2">
          <p className="mb-2 text-sm font-semibold">Por colaborador</p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Creadas</TableHead>
                  <TableHead className="text-right">Asignadas</TableHead>
                  <TableHead className="text-right">Finalizadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.porColab.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Sin datos.</TableCell></TableRow>
                )}
                {datos.porColab.map(c => (
                  <TableRow key={c.nombre}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="text-right">{c.creadas}</TableCell>
                    <TableCell className="text-right">{c.asignadas}</TableCell>
                    <TableCell className="text-right">{c.finalizadas}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
