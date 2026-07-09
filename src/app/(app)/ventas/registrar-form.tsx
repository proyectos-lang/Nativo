"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarVenta, crearCliente, type LineaVenta } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserPlus, CheckCircle2 } from "lucide-react";
import { formatoPesos, type Cliente } from "@/lib/tipos";

type Props = {
  maestros: Record<string, string[]>;
  clientes: Cliente[];
  productos: string[];
};

const LINEA_VACIA: LineaVenta = { producto: "", cantidad: 1, valor_unitario: 0 };

function CampoLista({ id, label, opciones, value, onChange }: {
  id: string; label: string; opciones: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} list={`dl-${id}`} value={value} onChange={e => onChange(e.target.value)} placeholder="Seleccione..." />
      <datalist id={`dl-${id}`}>
        {opciones.map(o => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}

export function RegistrarVentaForm({ maestros, clientes: clientesIniciales, productos }: Props) {
  const [pendiente, startTransition] = useTransition();
  const [clientes, setClientes] = useState(clientesIniciales);

  // Datos generales
  const [canal, setCanal] = useState("");
  const [campana, setCampana] = useState("");
  const [vendedora, setVendedora] = useState("");
  const [profesional, setProfesional] = useState("");
  const [motivo, setMotivo] = useState("");

  // Cliente
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [dialogCliente, setDialogCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "", departamento: "", direccion: "", rut: "" });

  // Líneas
  const [lineas, setLineas] = useState<LineaVenta[]>([{ ...LINEA_VACIA }]);

  // Pago y entrega
  const [abono, setAbono] = useState(0);
  const [estadoPago, setEstadoPago] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [tipoPago, setTipoPago] = useState("0 DIAS");
  const [fechaPago, setFechaPago] = useState("");
  const [estadoEntrega, setEstadoEntrega] = useState("En Proceso");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const total = useMemo(
    () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0),
    [lineas]
  );

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.toLowerCase().trim();
    if (q.length < 2) return [];
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.cedula_nit || "").toLowerCase().includes(q) ||
      (c.empresa || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [busquedaCliente, clientes]);

  const setLinea = (i: number, campo: keyof LineaVenta, valor: string | number) => {
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const guardarNuevoCliente = () => {
    startTransition(async () => {
      try {
        const c = await crearCliente(nuevoCliente);
        setClientes(prev => [...prev, c as Cliente]);
        setClienteSel(c as Cliente);
        setBusquedaCliente((c as Cliente).nombre);
        setDialogCliente(false);
        setNuevoCliente({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "", departamento: "", direccion: "", rut: "" });
        toast.success("Cliente registrado y seleccionado");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const enviar = () => {
    if (!clienteSel) return toast.error("Selecciona un cliente.");
    if (!lineas.some(l => l.producto.trim())) return toast.error("Agrega al menos un producto.");
    startTransition(async () => {
      try {
        const r = await registrarVenta({
          cliente_id: clienteSel.id,
          canal_venta: canal, campana, vendedora, profesional, motivo_compra: motivo,
          lineas, abono,
          estado_pago: estadoPago, medio_pago: medioPago, tipo_pago: tipoPago,
          fecha_pago: fechaPago, estado_entrega: estadoEntrega, fecha_entrega: fechaEntrega,
          observaciones_pago: observaciones,
        });
        toast.success(`Venta #${r.ticket} registrada correctamente`);
        // Reiniciar formulario
        setCanal(""); setCampana(""); setVendedora(""); setProfesional(""); setMotivo("");
        setClienteSel(null); setBusquedaCliente("");
        setLineas([{ ...LINEA_VACIA }]);
        setAbono(0); setEstadoPago(""); setMedioPago(""); setTipoPago("0 DIAS");
        setFechaPago(""); setEstadoEntrega("En Proceso"); setFechaEntrega(""); setObservaciones("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div className="grid gap-4 pt-2">
      {/* CLIENTE */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>1. Cliente</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setDialogCliente(true)}>
            <UserPlus className="size-4" /> Nuevo Cliente
          </Button>
          <Dialog open={dialogCliente} onOpenChange={setDialogCliente}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Nuevo Cliente</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Cédula / NIT</Label><Input value={nuevoCliente.cedula_nit} onChange={e => setNuevoCliente({ ...nuevoCliente, cedula_nit: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Empresa</Label><Input value={nuevoCliente.empresa} onChange={e => setNuevoCliente({ ...nuevoCliente, empresa: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Contacto</Label><Input value={nuevoCliente.contacto} onChange={e => setNuevoCliente({ ...nuevoCliente, contacto: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Correo</Label><Input value={nuevoCliente.correo} onChange={e => setNuevoCliente({ ...nuevoCliente, correo: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Ciudad</Label><Input value={nuevoCliente.ciudad} onChange={e => setNuevoCliente({ ...nuevoCliente, ciudad: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Departamento</Label><Input value={nuevoCliente.departamento} onChange={e => setNuevoCliente({ ...nuevoCliente, departamento: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>RUT</Label><Input value={nuevoCliente.rut} onChange={e => setNuevoCliente({ ...nuevoCliente, rut: e.target.value })} /></div>
                <div className="col-span-2 grid gap-1.5"><Label>Dirección</Label><Input value={nuevoCliente.direccion} onChange={e => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={guardarNuevoCliente} disabled={pendiente}>Guardar y Seleccionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="relative">
            <Input
              placeholder="Buscar por nombre, cédula/NIT o empresa..."
              value={busquedaCliente}
              onChange={e => { setBusquedaCliente(e.target.value); setMostrarLista(true); }}
              onFocus={() => setMostrarLista(true)}
              onBlur={() => setTimeout(() => setMostrarLista(false), 200)}
            />
            {mostrarLista && clientesFiltrados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                {clientesFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={() => { setClienteSel(c); setBusquedaCliente(c.nombre); setMostrarLista(false); }}
                  >
                    <span className="font-medium">{c.nombre} {c.cedula_nit && <span className="text-primary">· {c.cedula_nit}</span>}</span>
                    <span className="text-xs text-muted-foreground">{c.empresa || "Sin empresa"} {c.ciudad ? `| ${c.ciudad}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {clienteSel && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="font-semibold">{clienteSel.nombre}</span>
              {clienteSel.empresa && <Badge variant="secondary">{clienteSel.empresa}</Badge>}
              {clienteSel.cedula_nit && <span className="text-muted-foreground">CC/NIT: {clienteSel.cedula_nit}</span>}
              {clienteSel.contacto && <span className="text-muted-foreground">Tel: {clienteSel.contacto}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PRODUCTOS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>2. Productos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setLineas(p => [...p, { ...LINEA_VACIA }])}>
            <Plus className="size-4" /> Añadir Línea
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <datalist id="dl-productos">{productos.map(p => <option key={p} value={p} />)}</datalist>
          <datalist id="dl-talla">{(maestros["talla"] || []).map(t => <option key={t} value={t} />)}</datalist>
          <datalist id="dl-color">{(maestros["color"] || []).map(c => <option key={c} value={c} />)}</datalist>
          {lineas.map((l, i) => (
            <div key={i} className="relative rounded-lg border border-l-4 border-l-primary p-3">
              {lineas.length > 1 && (
                <Button
                  variant="ghost" size="icon"
                  className="absolute right-1 top-1 size-7 text-destructive"
                  onClick={() => setLineas(prev => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1.5 lg:col-span-2">
                  <Label>Producto *</Label>
                  <Input list="dl-productos" value={l.producto} onChange={e => setLinea(i, "producto", e.target.value)} placeholder="Escriba o elija..." />
                </div>
                <div className="grid gap-1.5">
                  <Label>Cantidad</Label>
                  <Input type="number" min={1} value={l.cantidad} onChange={e => setLinea(i, "cantidad", Number(e.target.value))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Valor Unitario</Label>
                  <Input type="number" min={0} value={l.valor_unitario || ""} onChange={e => setLinea(i, "valor_unitario", Number(e.target.value))} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Talla</Label>
                  <Input list="dl-talla" value={l.talla || ""} onChange={e => setLinea(i, "talla", e.target.value)} placeholder="N/A" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Color</Label>
                  <Input list="dl-color" value={l.color || ""} onChange={e => setLinea(i, "color", e.target.value)} placeholder="N/A" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Sexo</Label>
                  <Input list="dl-sexo" value={l.sexo || ""} onChange={e => setLinea(i, "sexo", e.target.value)} placeholder="N/A" />
                  <datalist id="dl-sexo">{(maestros["sexo"] || ["Hombre", "Mujer", "Unisex", "Niño/a"]).map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div className="grid gap-1.5">
                  <Label>Total Línea</Label>
                  <Input readOnly value={formatoPesos((Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0))} className="bg-muted font-semibold" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Estampado</Label>
                  <Input value={l.estampado || ""} onChange={e => setLinea(i, "estampado", e.target.value)} placeholder="Detalle..." />
                </div>
                <div className="grid gap-1.5">
                  <Label>Guía Estampado</Label>
                  <Input value={l.guia_estampado || ""} onChange={e => setLinea(i, "guia_estampado", e.target.value)} placeholder="Guía #" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Bordado</Label>
                  <Input value={l.bordado || ""} onChange={e => setLinea(i, "bordado", e.target.value)} placeholder="Detalle..." />
                </div>
                <div className="grid gap-1.5">
                  <Label>Guía Bordado</Label>
                  <Input value={l.guia_bordado || ""} onChange={e => setLinea(i, "guia_bordado", e.target.value)} placeholder="Guía #" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* DATOS GENERALES */}
      <Card>
        <CardHeader><CardTitle>3. Datos de la Venta</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CampoLista id="canal" label="Canal de Venta" opciones={maestros["canal_venta"] || []} value={canal} onChange={setCanal} />
          <CampoLista id="campana" label="Campaña" opciones={maestros["campana"] || []} value={campana} onChange={setCampana} />
          <CampoLista id="vendedora" label="Vendedora" opciones={maestros["vendedora"] || []} value={vendedora} onChange={setVendedora} />
          <CampoLista id="profesional" label="Profesional / Asesor" opciones={maestros["profesional"] || []} value={profesional} onChange={setProfesional} />
          <CampoLista id="motivo" label="Motivo de Compra" opciones={maestros["motivo_compra"] || []} value={motivo} onChange={setMotivo} />
        </CardContent>
      </Card>

      {/* PAGO Y ENTREGA */}
      <Card>
        <CardHeader><CardTitle>4. Pago y Entrega</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="grid content-start gap-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <Label>TOTAL COMPRA</Label>
              <span className="text-lg font-bold text-primary">{formatoPesos(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>Abono (+)</Label>
              <Input type="number" min={0} className="w-40 text-right" value={abono || ""} onChange={e => setAbono(Number(e.target.value))} placeholder="0" />
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <Label>SALDO</Label>
              <span className={`text-lg font-bold ${total - abono > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(total - abono)}</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CampoLista id="estadoPago" label="Estado de Pago" opciones={maestros["estado_pago"] || []} value={estadoPago} onChange={v => { setEstadoPago(v); if (v === "Pagado Total") setAbono(total); }} />
            <CampoLista id="medioPago" label="Medio de Pago" opciones={maestros["medio_pago"] || []} value={medioPago} onChange={setMedioPago} />
            <CampoLista id="tipoPago" label="Tipo de Pago" opciones={maestros["tipo_pago"] || []} value={tipoPago} onChange={setTipoPago} />
            <div className="grid gap-1.5"><Label>Fecha Pago</Label><Input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} /></div>
            <CampoLista id="estadoEntrega" label="Estado Pedido / Entrega" opciones={maestros["estado_entrega"] || []} value={estadoEntrega} onChange={setEstadoEntrega} />
            <div className="grid gap-1.5"><Label>Fecha Entrega</Label><Input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} /></div>
            <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
              <Label>Observaciones</Label>
              <Textarea rows={2} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button size="lg" className="px-10" onClick={enviar} disabled={pendiente}>
          {pendiente ? "Registrando..." : "Registrar Venta"}
        </Button>
      </div>
    </div>
  );
}
