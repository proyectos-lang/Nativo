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
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { SubidaImagen } from "@/components/subida-imagen";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserPlus, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatoPesos, type Cliente, type CuentaBancaria } from "@/lib/tipos";

type Props = {
  maestros: Record<string, string[]>;
  clientes: Cliente[];
  productos: string[];
  cuentas: CuentaBancaria[];
};

const LINEA_VACIA: LineaVenta = { producto: "", cantidad: 1, valor_unitario: 0 };

export function RegistrarVentaForm({ maestros, clientes: clientesIniciales, productos, cuentas }: Props) {
  const [pendiente, startTransition] = useTransition();
  const [clientes, setClientes] = useState(clientesIniciales);

  // Datos generales
  const [canal, setCanal] = useState("");
  const [campana, setCampana] = useState("");
  const [vendedora, setVendedora] = useState("");
  const [profesional, setProfesional] = useState("");
  const [motivo, setMotivo] = useState("");

  // Cliente
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [dialogCliente, setDialogCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "", departamento: "", direccion: "", rut: "" });

  // Líneas
  const [lineas, setLineas] = useState<LineaVenta[]>([{ ...LINEA_VACIA }]);

  // Pago y entrega
  const [abono, setAbono] = useState(0);
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [cuentaId, setCuentaId] = useState(0);
  const [estadoPago, setEstadoPago] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [tipoPago, setTipoPago] = useState("0 DIAS");
  const [fechaPago, setFechaPago] = useState("");
  const [estadoEntrega, setEstadoEntrega] = useState("En Proceso");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const totalProductos = useMemo(
    () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0),
    [lineas]
  );
  const total = totalProductos + (Number(costoEnvio) || 0);

  const setLinea = (i: number, campo: keyof LineaVenta, valor: string | number | null) => {
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
          lineas, abono, cuenta_id: cuentaId || null, costo_envio: costoEnvio,
          estado_pago: estadoPago, medio_pago: medioPago, tipo_pago: tipoPago,
          fecha_pago: fechaPago, estado_entrega: estadoEntrega, fecha_entrega: fechaEntrega,
          observaciones_pago: observaciones,
        });
        toast.success(`Venta #${r.ticket} registrada correctamente`);
        setCanal(""); setCampana(""); setVendedora(""); setProfesional(""); setMotivo("");
        setClienteSel(null); setBusquedaCliente("");
        setLineas([{ ...LINEA_VACIA }]);
        setAbono(0); setCostoEnvio(0); setCuentaId(0); setEstadoPago(""); setMedioPago(""); setTipoPago("0 DIAS");
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
            <DialogContent className="sm:max-w-2xl">
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
          <Combobox
            items={clientes}
            itemToStringLabel={(c: Cliente | null) => c?.nombre ?? ""}
            value={clienteSel}
            onValueChange={v => setClienteSel((v as Cliente) ?? null)}
            inputValue={busquedaCliente}
            onInputValueChange={v => setBusquedaCliente(v ?? "")}
            openOnInputClick
          >
            <ComboboxInput placeholder="Buscar por nombre, cédula/NIT o empresa..." className="w-full" showClear />
            <ComboboxContent>
              <ComboboxEmpty>No se encontró. Usa &quot;Nuevo Cliente&quot;.</ComboboxEmpty>
              <ComboboxList>
                {(c: Cliente) => (
                  <ComboboxItem key={c.id} value={c}>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {c.nombre} {c.cedula_nit && <span className="text-primary">· {c.cedula_nit}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.empresa || "Sin empresa"}{c.ciudad ? ` | ${c.ciudad}` : ""}</span>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
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
                  <Combo opciones={productos} value={l.producto} onChange={v => setLinea(i, "producto", v)} />
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
                  <Combo opciones={maestros["talla"] || []} value={l.talla || ""} onChange={v => setLinea(i, "talla", v)} placeholder="N/A" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Color</Label>
                  <Combo opciones={maestros["color"] || []} value={l.color || ""} onChange={v => setLinea(i, "color", v)} placeholder="N/A" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Sexo</Label>
                  <Combo opciones={maestros["sexo"] || ["Hombre", "Mujer", "Unisex", "Niño/a"]} value={l.sexo || ""} onChange={v => setLinea(i, "sexo", v)} placeholder="N/A" />
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
                {l.estampado?.trim() && (
                  <SubidaImagen label="Imagen de referencia — Estampado" url={l.imagen_estampado_url} onChange={url => setLinea(i, "imagen_estampado_url", url)} />
                )}
                {l.bordado?.trim() && (
                  <SubidaImagen label="Imagen de referencia — Bordado" url={l.imagen_bordado_url} onChange={url => setLinea(i, "imagen_bordado_url", url)} />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* DATOS GENERALES */}
      <Card>
        <CardHeader><CardTitle>3. Datos de la Venta</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-1.5"><Label>Canal de Venta</Label><Combo opciones={maestros["canal_venta"] || []} value={canal} onChange={setCanal} /></div>
          <div className="grid gap-1.5"><Label>Campaña</Label><Combo opciones={maestros["campana"] || []} value={campana} onChange={setCampana} /></div>
          <div className="grid gap-1.5"><Label>Vendedora</Label><Combo opciones={maestros["vendedora"] || []} value={vendedora} onChange={setVendedora} /></div>
          <div className="grid gap-1.5"><Label>Profesional / Asesor</Label><Combo opciones={maestros["profesional"] || []} value={profesional} onChange={setProfesional} /></div>
          <div className="grid gap-1.5"><Label>Motivo de Compra</Label><Combo opciones={maestros["motivo_compra"] || []} value={motivo} onChange={setMotivo} /></div>
        </CardContent>
      </Card>

      {/* PAGO Y ENTREGA */}
      <Card>
        <CardHeader><CardTitle>4. Pago y Entrega</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="grid content-start gap-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Costo de Envío (+)</Label>
              <Input type="number" min={0} className="w-40 text-right" value={costoEnvio || ""} onChange={e => setCostoEnvio(Number(e.target.value))} placeholder="0" />
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <Label>TOTAL COMPRA</Label>
              <span className="text-lg font-bold text-primary">{formatoPesos(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label>Abono (+)</Label>
              <Input type="number" min={0} className="w-40 text-right" value={abono || ""} onChange={e => setAbono(Number(e.target.value))} placeholder="0" />
            </div>
            {abono > 0 && (
              <div className="grid gap-1.5">
                <Label>Cuenta destino del abono</Label>
                <Select value={cuentaId ? String(cuentaId) : ""} onValueChange={v => setCuentaId(v ? Number(v) : 0)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sin cuenta (no genera movimiento)" /></SelectTrigger>
                  <SelectContent>
                    {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-2">
              <Label>SALDO</Label>
              <span className={`text-lg font-bold ${total - abono > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(total - abono)}</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5"><Label>Estado de Pago</Label><Combo opciones={maestros["estado_pago"] || []} value={estadoPago} onChange={v => { setEstadoPago(v); if (v === "Pagado Total") setAbono(total); }} /></div>
            <div className="grid gap-1.5"><Label>Medio de Pago</Label><Combo opciones={maestros["medio_pago"] || []} value={medioPago} onChange={setMedioPago} /></div>
            <div className="grid gap-1.5"><Label>Tipo de Pago</Label><Combo opciones={maestros["tipo_pago"] || []} value={tipoPago} onChange={setTipoPago} /></div>
            <div className="grid gap-1.5"><Label>Fecha Pago</Label><Input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Estado Pedido / Entrega</Label><Combo opciones={maestros["estado_entrega"] || []} value={estadoEntrega} onChange={setEstadoEntrega} /></div>
            <div className="grid gap-1.5"><Label>Fecha Programada de Entrega</Label><Input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} /></div>
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
