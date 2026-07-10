"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearGasto, pagarGasto } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combo } from "@/components/combo";
import { HandCoins } from "lucide-react";
import { formatoPesos, formatoFecha, type Gasto, type PagoGasto, type CuentaBancaria } from "@/lib/tipos";

type Props = {
  gastos: Gasto[];
  pagosGastos: Record<number, PagoGasto[]>;
  cuentas: CuentaBancaria[];
  categorias: string[];
};

const HOY = () => new Date().toISOString().slice(0, 10);

export function GastosCliente({ gastos, pagosGastos, cuentas, categorias }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  // Causación
  const [nuevo, setNuevo] = useState({
    fecha: HOY(), tipo: "Gasto" as "Gasto" | "Costo", categoria: "", proveedor: "",
    descripcion: "", monto: 0, pagarAhora: false, cuenta_id: 0,
  });

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  // Pago
  const [sel, setSel] = useState<Gasto | null>(null);
  const [pago, setPago] = useState({ monto: 0, cuenta_id: 0, fecha: HOY(), comentario: "" });

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return gastos.filter(g => {
      if (filtroEstado === "pendientes" && g.saldo <= 0) return false;
      if (filtroEstado === "pagados" && g.saldo > 0) return false;
      if (filtroTipo !== "todos" && g.tipo !== filtroTipo) return false;
      if (!q) return true;
      return (g.descripcion || "").toLowerCase().includes(q) ||
        (g.proveedor || "").toLowerCase().includes(q) ||
        (g.categoria || "").toLowerCase().includes(q);
    });
  }, [gastos, filtroEstado, filtroTipo, busqueda]);

  const totalPendiente = useMemo(() => gastos.reduce((s, g) => s + (g.saldo > 0 ? Number(g.saldo) : 0), 0), [gastos]);

  const guardarNuevo = () => {
    startTransition(async () => {
      try {
        await crearGasto({ ...nuevo, cuenta_id: nuevo.cuenta_id || undefined });
        toast.success(nuevo.pagarAhora ? "Gasto registrado y pagado" : "Gasto causado (pendiente por pagar)");
        setNuevo({ fecha: HOY(), tipo: "Gasto", categoria: "", proveedor: "", descripcion: "", monto: 0, pagarAhora: false, cuenta_id: 0 });
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirPago = (g: Gasto) => {
    setSel(g);
    setPago({ monto: Number(g.saldo), cuenta_id: 0, fecha: HOY(), comentario: "" });
  };

  const procesarPago = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await pagarGasto({ gasto_id: sel.id, ...pago });
        toast.success("Pago registrado");
        setSel(null);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const SelectorCuenta = ({ valor, onCambio }: { valor: number; onCambio: (id: number) => void }) => (
    <Select value={valor ? String(valor) : ""} onValueChange={v => v && onCambio(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione cuenta..." /></SelectTrigger>
      <SelectContent>
        {cuentas.map(c => (
          <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[340px_1fr]">
      {/* CAUSAR GASTO */}
      <Card className="h-fit">
        <CardHeader><CardTitle>Registrar Gasto / Costo</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={nuevo.tipo} onValueChange={v => v && setNuevo({ ...nuevo, tipo: v as "Gasto" | "Costo" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gasto">Gasto</SelectItem>
                  <SelectItem value="Costo">Costo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Categoría</Label><Combo opciones={categorias} value={nuevo.categoria} onChange={v => setNuevo({ ...nuevo, categoria: v })} /></div>
          <div className="grid gap-1.5"><Label>Proveedor</Label><Input value={nuevo.proveedor} onChange={e => setNuevo({ ...nuevo, proveedor: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={2} value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" min={0} value={nuevo.monto || ""} onChange={e => setNuevo({ ...nuevo, monto: Number(e.target.value) })} placeholder="0" /></div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={nuevo.pagarAhora} onCheckedChange={v => setNuevo({ ...nuevo, pagarAhora: v })} />
            Pagar ahora (salida inmediata de la cuenta)
          </label>
          {nuevo.pagarAhora && (
            <div className="grid gap-1.5"><Label>Cuenta desde donde se paga *</Label><SelectorCuenta valor={nuevo.cuenta_id} onCambio={id => setNuevo({ ...nuevo, cuenta_id: id })} /></div>
          )}
          <Button onClick={guardarNuevo} disabled={pendiente || nuevo.monto <= 0 || (nuevo.pagarAhora && !nuevo.cuenta_id)}>
            {nuevo.pagarAhora ? "Registrar y Pagar" : "Causar (pendiente por pagar)"}
          </Button>
        </CardContent>
      </Card>

      {/* LISTA */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Gastos y Costos</CardTitle>
            <p className="text-sm text-muted-foreground">Pendiente por pagar: <span className="font-bold text-destructive">{formatoPesos(totalPendiente)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-44" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v || "todos")}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Gasto">Gastos</SelectItem>
                <SelectItem value="Costo">Costos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "pendientes")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="pagados">Pagados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Abonado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(g => (
                  <TableRow key={g.id}>
                    <TableCell>{formatoFecha(g.fecha)}</TableCell>
                    <TableCell><Badge variant={g.tipo === "Costo" ? "default" : "secondary"}>{g.tipo}</Badge></TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">{g.descripcion || g.categoria || "-"}</span>
                      <span className="block text-xs text-muted-foreground">{[g.categoria, g.proveedor].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatoPesos(g.monto)}</TableCell>
                    <TableCell className="text-right">{formatoPesos(g.abonado)}</TableCell>
                    <TableCell className={`text-right font-bold ${g.saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(g.saldo)}</TableCell>
                    <TableCell><Badge variant={g.estado === "Pagado" ? "default" : g.estado === "Abonado" ? "secondary" : "outline"}>{g.estado}</Badge></TableCell>
                    <TableCell>
                      {g.saldo > 0 && (
                        <Button variant="outline" size="sm" onClick={() => abrirPago(g)}><HandCoins className="size-4" /> Pagar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG PAGO */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pagar {sel?.tipo} — {sel?.descripcion || sel?.categoria}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Monto</p><p className="font-bold">{formatoPesos(sel.monto)}</p></div>
                <div><p className="text-muted-foreground">Abonado</p><p className="font-bold">{formatoPesos(sel.abonado)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(sel.saldo)}</p></div>
              </div>

              {(pagosGastos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Pagos anteriores</p>
                  <div className="max-h-32 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Fecha</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Cuenta</TableHead><TableHead>Comentario</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagosGastos[sel.id].map(p => (
                          <TableRow key={p.id}>
                            <TableCell>{formatoFecha(p.fecha)}</TableCell>
                            <TableCell className="text-right">{formatoPesos(p.monto)}</TableCell>
                            <TableCell>{cuentas.find(c => c.id === p.cuenta_id)?.nombre || `#${p.cuenta_id}`}</TableCell>
                            <TableCell className="max-w-40 truncate text-xs">{p.comentario || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto a pagar *</Label><Input type="number" min={0} value={pago.monto || ""} onChange={e => setPago({ ...pago, monto: Number(e.target.value) })} /></div>
                <div className="grid gap-1.5"><Label>Cuenta *</Label><SelectorCuenta valor={pago.cuenta_id} onCambio={id => setPago({ ...pago, cuenta_id: id })} /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Comentario</Label><Input value={pago.comentario} onChange={e => setPago({ ...pago, comentario: e.target.value })} /></div>
              </div>
              <p className="text-sm">
                Saldo después del pago:{" "}
                <span className={`font-bold ${sel.saldo - pago.monto > 0 ? "text-destructive" : "text-primary"}`}>
                  {formatoPesos(sel.saldo - pago.monto)}
                </span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
            <Button onClick={procesarPago} disabled={pendiente || pago.monto <= 0 || !pago.cuenta_id}>
              {pendiente ? "Procesando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
