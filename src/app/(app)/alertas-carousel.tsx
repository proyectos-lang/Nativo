"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Clock, Truck, DollarSign, Contact, TrendingUp, Landmark, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import type { Insight } from "./insights";

const ICONOS: Record<Insight["icono"], typeof Clock> = {
  reloj: Clock,
  camion: Truck,
  dinero: DollarSign,
  usuario: Contact,
  tendencia: TrendingUp,
  banco: Landmark,
  chispa: Sparkles,
};

const ESTILOS_TARJETA: Record<Insight["severidad"], string> = {
  danger: "border-destructive/40 bg-destructive/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  info: "border-primary/30 bg-primary/5",
  success: "border-primary/40 bg-primary/5",
};

const ESTILOS_ICONO: Record<Insight["severidad"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-600",
  info: "bg-primary/10 text-primary",
  success: "bg-primary/10 text-primary",
};

const INTERVALO_MS = 6000;

export function AlertasCarousel({ insights }: { insights: Insight[] }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (insights.length <= 1 || pausado) return;
    const t = setInterval(() => setI(prev => (prev + 1) % insights.length), INTERVALO_MS);
    return () => clearInterval(t);
  }, [insights.length, pausado]);

  if (insights.length === 0) return null;

  const indiceActual = i % insights.length;
  const actual = insights[indiceActual];
  const Icono = ICONOS[actual.icono];

  return (
    <Card
      className={`overflow-hidden border p-0 transition-colors ${ESTILOS_TARJETA[actual.severidad]}`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div className="flex items-center gap-3 p-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${ESTILOS_ICONO[actual.severidad]}`}>
          <Icono className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{actual.titulo}</p>
          <p className="line-clamp-1 text-sm text-muted-foreground">{actual.descripcion}</p>
        </div>
        {actual.href && (
          <Link href={actual.href} className="shrink-0 text-sm font-medium text-primary hover:underline">Ver →</Link>
        )}
        {insights.length > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button" title="Anterior"
              onClick={() => setI(prev => (prev - 1 + insights.length) % insights.length)}
              className="rounded-full p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button" title="Siguiente"
              onClick={() => setI(prev => (prev + 1) % insights.length)}
              className="rounded-full p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      {insights.length > 1 && (
        <div className="flex gap-1 px-4 pb-3">
          {insights.map((insight, idx) => (
            <button
              key={insight.id} type="button" title={insight.titulo}
              onClick={() => setI(idx)}
              className={`h-1 flex-1 rounded-full transition-colors ${idx === indiceActual ? "bg-foreground/60" : "bg-foreground/15"}`}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
