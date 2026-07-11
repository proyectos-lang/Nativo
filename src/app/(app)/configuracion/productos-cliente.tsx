"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearProducto, eliminarProducto } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

export function ProductosCliente({ productos }: { productos: { id: number; nombre: string }[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState("");

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return productos;
    return productos.filter(p => p.nombre.toLowerCase().includes(q));
  }, [productos, busqueda]);

  const agregar = () => {
    const valor = nuevo.trim();
    if (!valor) return;
    startTransition(async () => {
      try {
        await crearProducto(valor);
        setNuevo("");
        toast.success(`"${valor}" agregado al catálogo`);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const eliminar = (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}" del catálogo de productos? Las ventas ya registradas con este producto no se ven afectadas.`)) return;
    startTransition(async () => {
      try {
        await eliminarProducto(id);
        toast.success("Producto eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle>Catálogo de Productos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Estos nombres aparecen sugeridos al registrar ventas. También se agregan automáticamente al escribir un producto nuevo en una venta.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex gap-2">
          <Input
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && agregar()}
            placeholder="Nuevo producto..."
          />
          <Button onClick={agregar} disabled={pendiente || !nuevo.trim()}><Plus className="size-4" /> Agregar</Button>
        </div>
        <Input className="max-w-xs" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {lista.length === 0 && <p className="text-sm text-muted-foreground">Sin productos.</p>}
          {lista.map(p => (
            <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
              {p.nombre}
              <button className="rounded-full p-0.5 hover:bg-destructive/20" onClick={() => eliminar(p.id, p.nombre)} disabled={pendiente}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{productos.length} producto(s) en total.</p>
      </CardContent>
    </Card>
  );
}
