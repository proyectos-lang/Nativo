"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function FiltroMes({ mes, anio }: { mes: number; anio: number }) {
  const router = useRouter();
  const anioActual = new Date().getFullYear();
  const anios = [anioActual, anioActual - 1, anioActual - 2];

  const ir = (m: number, a: number) => router.push(`/?mes=${m + 1}&anio=${a}`);

  return (
    <div className="flex gap-2">
      <Select value={String(mes)} onValueChange={v => v !== null && ir(Number(v), anio)}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MESES.map((n, i) => <SelectItem key={i} value={String(i)}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(anio)} onValueChange={v => v !== null && ir(mes, Number(v))}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {anios.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
