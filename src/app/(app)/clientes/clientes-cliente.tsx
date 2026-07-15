"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarCliente, eliminarCliente } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, UserPlus, Trash2 } from "lucide-react";
import type { Cliente } from "@/lib/tipos";

const VACIO: Partial<Cliente> & { nombre: string } = { nombre: "" };

export function ClientesCliente({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Partial<Cliente> & { nombre: string }>(VACIO);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      (c.empresa || "").toLowerCase().includes(q) ||
      (c.cedula_nit || "").toLowerCase().includes(q) ||
      (c.ciudad || "").toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

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
        <div className="flex items-end gap-2">
          <Input className="w-64" placeholder="Buscar por nombre, cédula, empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Button onClick={() => abrir()}><UserPlus className="size-4" /> Nuevo Cliente</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cédula / NIT</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.cedula_nit || "-"}</TableCell>
                    <TableCell>{c.empresa || "-"}</TableCell>
                    <TableCell>{c.contacto || "-"}</TableCell>
                    <TableCell>{c.ciudad || "-"}{c.departamento ? `, ${c.departamento}` : ""}</TableCell>
                    <TableCell className="text-sm">{c.correo || "-"}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrir(c)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => eliminar(c)} disabled={pendiente}><Trash2 className="size-4" /></Button>
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
            {campo("nombre", "Nombre *")}
            {campo("cedula_nit", "Cédula / NIT")}
            {campo("empresa", "Empresa")}
            {campo("contacto", "Contacto")}
            {campo("correo", "Correo")}
            {campo("ciudad", "Ciudad")}
            {campo("departamento", "Departamento")}
            {campo("rut", "RUT")}
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
