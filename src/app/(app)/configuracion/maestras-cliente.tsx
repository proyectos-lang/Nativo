"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { agregarValorMaestro, eliminarValorMaestro } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

const NOMBRES_TIPO: Record<string, string> = {
  vendedora: "Vendedoras",
  talla: "Tallas",
  color: "Colores",
  campana: "Campañas",
  motivo_compra: "Motivos de Compra",
  profesional: "Profesionales / Asesores",
  estado_entrega: "Estados de Entrega",
  canal_venta: "Canales de Venta",
  estado_pago: "Estados de Pago",
  medio_pago: "Medios de Pago",
  tipo_pago: "Tipos de Pago",
  sexo: "Sexo",
  categoria_gasto: "Categorías de Gastos",
  categoria_ingreso: "Categorías de Ingresos",
};

export function MaestrasCliente({ valores }: { valores: { id: number; tipo: string; valor: string }[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [nuevos, setNuevos] = useState<Record<string, string>>({});

  const grupos = useMemo(() => {
    const g: Record<string, { id: number; valor: string }[]> = {};
    for (const v of valores) {
      if (!g[v.tipo]) g[v.tipo] = [];
      g[v.tipo].push({ id: v.id, valor: v.valor });
    }
    return g;
  }, [valores]);

  const agregar = (tipo: string) => {
    const valor = (nuevos[tipo] || "").trim();
    if (!valor) return;
    startTransition(async () => {
      try {
        await agregarValorMaestro(tipo, valor);
        setNuevos(prev => ({ ...prev, [tipo]: "" }));
        toast.success(`"${valor}" agregado`);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const eliminar = (id: number, valor: string) => {
    if (!confirm(`¿Eliminar "${valor}" de la lista?`)) return;
    startTransition(async () => {
      try {
        await eliminarValorMaestro(id);
        toast.success("Valor eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const tipos = Object.keys(NOMBRES_TIPO).filter(t => grupos[t] || ["vendedora", "talla", "color", "campana", "motivo_compra", "profesional", "estado_entrega", "categoria_gasto", "categoria_ingreso"].includes(t));

  return (
    <div className="mt-2 grid gap-4 md:grid-cols-2">
      {tipos.map(tipo => (
        <Card key={tipo}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{NOMBRES_TIPO[tipo] || tipo}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(grupos[tipo] || []).map(v => (
                <Badge key={v.id} variant="secondary" className="gap-1 pr-1">
                  {v.valor}
                  <button className="rounded-full p-0.5 hover:bg-destructive/20" onClick={() => eliminar(v.id, v.valor)} disabled={pendiente}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {!(grupos[tipo] || []).length && <span className="text-sm text-muted-foreground">Sin valores.</span>}
            </div>
            <div className="flex gap-2">
              <Input
                value={nuevos[tipo] || ""}
                onChange={e => setNuevos(prev => ({ ...prev, [tipo]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && agregar(tipo)}
                placeholder="Nuevo valor..."
              />
              <Button variant="outline" size="icon" onClick={() => agregar(tipo)} disabled={pendiente}><Plus className="size-4" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
