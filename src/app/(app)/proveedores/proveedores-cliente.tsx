"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarProveedor } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combo } from "@/components/combo";
import { Pencil, Truck } from "lucide-react";
import type { Proveedor } from "@/lib/tipos";

const VACIO: Partial<Proveedor> & { nombre: string } = { nombre: "" };

export function ProveedoresCliente({ proveedores, tipos }: { proveedores: Proveedor[]; tipos: string[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Partial<Proveedor> & { nombre: string }>(VACIO);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return proveedores;
    return proveedores.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.nit || "").toLowerCase().includes(q) ||
      (p.tipo || "").toLowerCase().includes(q) ||
      (p.ciudad || "").toLowerCase().includes(q)
    );
  }, [proveedores, busqueda]);

  const abrir = (p?: Proveedor) => {
    setForm(p ? { ...p } : VACIO);
    setAbierto(true);
  };

  const guardar = () => {
    startTransition(async () => {
      try {
        await guardarProveedor(form);
        toast.success(form.id ? "Proveedor actualizado" : "Proveedor creado");
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const campo = (k: keyof Proveedor, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input value={(form[k] as string) || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Proveedores</h2>
          <p className="text-sm text-muted-foreground">{proveedores.length} proveedores registrados.</p>
        </div>
        <div className="flex items-end gap-2">
          <Input className="w-64" placeholder="Buscar por nombre, NIT, ciudad..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Button onClick={() => abrir()}><Truck className="size-4" /> Nuevo Proveedor</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>{p.tipo || "-"}</TableCell>
                    <TableCell>{p.nit || "-"}</TableCell>
                    <TableCell>{p.contacto || "-"}</TableCell>
                    <TableCell>{p.ciudad || "-"}{p.departamento ? `, ${p.departamento}` : ""}</TableCell>
                    <TableCell className="text-sm">{p.correo || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => abrir(p)}><Pencil className="size-4" /></Button>
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
          <DialogHeader><DialogTitle>{form.id ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {campo("nombre", "Nombre *")}
            <div className="grid gap-1.5">
              <Label>Tipo de proveedor</Label>
              <Combo opciones={tipos} value={form.tipo || ""} onChange={v => setForm({ ...form, tipo: v })} placeholder="Escriba o elija..." />
            </div>
            {campo("nit", "NIT / Identificación")}
            {campo("contacto", "Teléfono")}
            {campo("correo", "Correo")}
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
