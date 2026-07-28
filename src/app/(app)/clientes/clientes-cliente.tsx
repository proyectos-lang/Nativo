"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarCliente, eliminarCliente, cambiarActivoCliente } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, UserPlus, Trash2, UserCheck, UserX } from "lucide-react";
import type { Cliente } from "@/lib/tipos";

const VACIO: Partial<Cliente> & { nombre: string } = { nombre: "" };

export function ClientesCliente({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Partial<Cliente> & { nombre: string }>(VACIO);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return clientes.filter(c => {
      if (filtroEstado === "activos" && !c.activo) return false;
      if (filtroEstado === "inactivos" && c.activo) return false;
      if (!q) return true;
      return c.nombre.toLowerCase().includes(q) ||
        (c.empresa || "").toLowerCase().includes(q) ||
        (c.cedula_nit || "").toLowerCase().includes(q) ||
        (c.ciudad || "").toLowerCase().includes(q);
    });
  }, [clientes, busqueda, filtroEstado]);

  const abrir = (c?: Cliente) => {
    setForm(c ? { ...c } : VACIO);
    setAbierto(true);
  };

  const guardar = () => {
    startTransition(async () => {
      try {
        await guardarCliente(form);
        toast.success(form.id ? "Cliente actualizado" : "Cliente creado");
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const eliminar = (c: Cliente) => {
    if (!confirm(`¿Eliminar a "${c.nombre}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        await eliminarCliente(c.id);
        toast.success("Cliente eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const alternarActivo = (c: Cliente) => {
    const nuevoValor = !c.activo;
    if (!nuevoValor && !confirm(`¿Desactivar a "${c.nombre}"? Dejará de aparecer para seleccionar en Ventas.`)) return;
    startTransition(async () => {
      try {
        await cambiarActivoCliente(c.id, nuevoValor);
        toast.success(nuevoValor ? "Cliente activado" : "Cliente desactivado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const campo = (k: keyof Cliente, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={(form[k] as string) || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-sm text-muted-foreground">{clientes.length} clientes registrados.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-64" placeholder="Buscar por nombre, cédula, empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "activos")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => abrir()}><UserPlus className="size-4" /> Nuevo Cliente</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cédula / NIT</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(c => (
                  <TableRow key={c.id} className={!c.activo ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.cedula_nit || "-"}</TableCell>
                    <TableCell>{c.empresa || "-"}</TableCell>
                    <TableCell>{c.contacto || "-"}</TableCell>
                    <TableCell>{c.ciudad || "-"}{c.departamento ? `, ${c.departamento}` : ""}</TableCell>
                    <TableCell className="text-sm">{c.correo || "-"}</TableCell>
                    <TableCell><Badge variant={c.activo ? "default" : "secondary"}>{c.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrir(c)} title="Editar"><Pencil className="size-4" /></Button>
                      <Button
                        variant="ghost" size="icon" disabled={pendiente} onClick={() => alternarActivo(c)}
                        title={c.activo ? "Desactivar" : "Activar"}
                      >
                        {c.activo ? <UserX className="size-4" /> : <UserCheck className="size-4 text-primary" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => eliminar(c)} disabled={pendiente} title="Eliminar"><Trash2 className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 text-xs font-semibold uppercase text-muted-foreground">Representante Legal</p>
            {campo("nombre", "Nombre *")}
            {campo("cedula_nit", "Cédula")}

            <p className="col-span-2 mt-1 text-xs font-semibold uppercase text-muted-foreground">Empresa</p>
            <div className="col-span-2 grid grid-cols-5 gap-3">
              <div className="col-span-2">{campo("empresa", "Nombre de la Empresa")}</div>
              <div className="col-span-2">{campo("rut", "RUT / NIT")}</div>
              {campo("digito_verificacion", "Dígito Verif.")}
            </div>
            {campo("correo", "Correo")}
            {campo("contacto", "Contacto")}

            <p className="col-span-2 mt-1 text-xs font-semibold uppercase text-muted-foreground">Ubicación</p>
            {campo("ciudad", "Ciudad")}
            {campo("departamento", "Departamento")}
            <div className="col-span-2">{campo("direccion", "Dirección")}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente || !form.nombre?.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
