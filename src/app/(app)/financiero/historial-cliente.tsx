"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { anularPagoGasto, anularCobroIngreso, eliminarMovimientoManual } from "./acciones";
import { DialogoBorrado } from "./dialogo-borrado";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Trash2 } from "lucide-react";
import { formatoPesos, formatoFecha, NOMBRE_ORIGEN_MOVIMIENTO, type CuentaBancaria, type MovimientoBancario } from "@/lib/tipos";

type Props = { cuentas: CuentaBancaria[]; movimientos: MovimientoBancario[] };

type FilaHistorial = {
  id: string;
  /** id real del movimiento; null en las filas sintéticas de saldo inicial. */
  movimiento_id: number | null;
  cuenta_id: number;
  fecha: string;
  tipo: "ingreso" | "egreso";
  origen: string;
  monto: number;
  concepto: string | null;
  tercero: string | null;
  factura: string | null;
  /** Pago del que nace el movimiento: anularlo es lo que lo borra. */
  pago_gasto_id: number | null;
  pago_ingreso_id: number | null;
};

const NOMBRES_ORIGEN_EXTENDIDO: Record<string, string> = { ...NOMBRE_ORIGEN_MOVIMIENTO, saldo_inicial: "Saldo Inicial" };

export function HistorialCliente({ cuentas, movimientos }: Props) {
  const router = useRouter();
  const [filaBorrar, setFilaBorrar] = useState<FilaHistorial | null>(null);
  const [cuentaId, setCuentaId] = useState("todas");
  const [origen, setOrigen] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const nombreCuenta = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cuentas) m.set(c.id, c.nombre);
    return m;
  }, [cuentas]);

  const todasLasFilas = useMemo((): FilaHistorial[] => {
    const filasSaldoInicial: FilaHistorial[] = cuentas.map(c => ({
      id: `saldo-${c.id}`,
      movimiento_id: null,
      cuenta_id: c.id,
      fecha: c.creado_en.slice(0, 10),
      tipo: Number(c.saldo_inicial) >= 0 ? "ingreso" : "egreso",
      origen: "saldo_inicial",
      monto: Math.abs(Number(c.saldo_inicial)),
      concepto: "Saldo inicial de la cuenta",
      tercero: null,
      factura: null,
      pago_gasto_id: null,
      pago_ingreso_id: null,
    }));
    const filasMovimientos: FilaHistorial[] = movimientos.map(m => ({
      id: String(m.id), movimiento_id: m.id, cuenta_id: m.cuenta_id, fecha: m.fecha, tipo: m.tipo, origen: m.origen, monto: Number(m.monto), concepto: m.concepto,
      tercero: m.tercero ?? null,
      factura: m.factura ?? null,
      pago_gasto_id: m.pago_gasto_id ?? null,
      pago_ingreso_id: m.pago_ingreso_id ?? null,
    }));
    return [...filasSaldoInicial, ...filasMovimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [cuentas, movimientos]);

  const filtrados = useMemo(() => {
    return todasLasFilas.filter(m => {
      if (cuentaId !== "todas" && m.cuenta_id !== Number(cuentaId)) return false;
      if (origen !== "todas" && m.origen !== origen) return false;
      if (desde && m.fecha < desde) return false;
      if (hasta && m.fecha > hasta) return false;
      return true;
    });
  }, [todasLasFilas, cuentaId, origen, desde, hasta]);

  const totalIngresos = filtrados.filter(m => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = filtrados.filter(m => m.tipo === "egreso").reduce((s, m) => s + Number(m.monto), 0);

  const limpiar = () => { setCuentaId("todas"); setOrigen("todas"); setDesde(""); setHasta(""); };
  const hayFiltros = cuentaId !== "todas" || origen !== "todas" || !!desde || !!hasta;

  /**
   * Qué se puede deshacer desde aquí. Un movimiento manual o una transferencia
   * se borran directamente; uno que nace de un pago se deshace anulando el pago
   * (si no, el gasto/ingreso seguiría diciendo "Pagado" con plata que ya no
   * salió de ninguna cuenta). Los pagos de venta y los reembolsos por devolución
   * se manejan en sus propios módulos, y el saldo inicial se edita en la cuenta.
   */
  const borrable = (m: FilaHistorial) =>
    m.origen === "manual" || m.origen === "transferencia"
    || m.pago_gasto_id != null || m.pago_ingreso_id != null;

  const descripcionBorrado = (m: FilaHistorial) => {
    if (m.origen === "transferencia") {
      return `Se eliminan los DOS asientos de la transferencia de ${formatoPesos(m.monto)}: el egreso de la cuenta origen y el ingreso de la destino. Ambos saldos vuelven a como estaban.`;
    }
    if (m.pago_gasto_id != null) {
      return `Se anula el pago de ${formatoPesos(m.monto)}: desaparece este movimiento, el dinero vuelve al saldo de la cuenta y el gasto queda otra vez pendiente por ese valor. El gasto NO se borra.`;
    }
    if (m.pago_ingreso_id != null) {
      return `Se anula el cobro de ${formatoPesos(m.monto)}: desaparece este movimiento, el dinero sale del saldo de la cuenta y el ingreso queda otra vez pendiente por ese valor. El ingreso NO se borra.`;
    }
    return `Se elimina el ${m.tipo} de ${formatoPesos(m.monto)} y el saldo de la cuenta se corrige en ese valor.`;
  };

  const ejecutarBorrado = async (m: FilaHistorial, clave: string, motivo: string) => {
    if (m.pago_gasto_id != null) {
      const r = await anularPagoGasto({ pago_id: m.pago_gasto_id, clave_contadora: clave, motivo });
      return `Pago anulado — el gasto queda ${r.estado} con saldo ${formatoPesos(r.saldo)}`;
    }
    if (m.pago_ingreso_id != null) {
      const r = await anularCobroIngreso({ pago_id: m.pago_ingreso_id, clave_contadora: clave, motivo });
      return `Cobro anulado — el ingreso queda ${r.estado} con saldo ${formatoPesos(r.saldo)}`;
    }
    const r = await eliminarMovimientoManual({ movimiento_id: m.movimiento_id!, clave_contadora: clave, motivo });
    return r.transferencia ? "Transferencia eliminada (los dos asientos)" : "Movimiento eliminado";
  };

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={v => v && setCuentaId(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuentas</SelectItem>
                {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo de movimiento</Label>
            <Select value={origen} onValueChange={v => v && setOrigen(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos</SelectItem>
                {Object.entries(NOMBRES_ORIGEN_EXTENDIDO).map(([valor, etiqueta]) => (
                  <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Desde</Label>
            <Input type="date" className="w-40" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Hasta</Label>
            <Input type="date" className="w-40" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          {hayFiltros && (
            <Button variant="ghost" onClick={limpiar}><X className="size-4" /> Limpiar filtros</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente / Proveedor</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Egreso</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sin movimientos para los filtros seleccionados.</TableCell></TableRow>
                )}
                {filtrados.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{formatoFecha(m.fecha)}</TableCell>
                    <TableCell>{nombreCuenta.get(m.cuenta_id) || "-"}</TableCell>
                    <TableCell><Badge variant="secondary">{NOMBRES_ORIGEN_EXTENDIDO[m.origen] || m.origen}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate text-sm font-medium">{m.tercero || "-"}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm">{m.factura || "-"}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">{m.concepto || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{m.tipo === "ingreso" ? formatoPesos(m.monto) : ""}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{m.tipo === "egreso" ? formatoPesos(m.monto) : ""}</TableCell>
                    <TableCell>
                      {borrable(m) && (
                        <Button
                          variant="ghost" size="icon" className="size-7 text-destructive"
                          title={m.origen === "manual" || m.origen === "transferencia" ? "Eliminar movimiento" : "Anular el pago que lo generó"}
                          onClick={() => setFilaBorrar(m)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-6 border-t pt-3 text-sm">
            <span>Ingresos: <span className="font-bold text-primary">{formatoPesos(totalIngresos)}</span></span>
            <span>Egresos: <span className="font-bold text-destructive">{formatoPesos(totalEgresos)}</span></span>
            <span>Neto: <span className={`font-bold ${totalIngresos - totalEgresos >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(totalIngresos - totalEgresos)}</span></span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Los movimientos manuales y las transferencias se eliminan; los que vienen de un pago de gasto o
            cobro de ingreso se deshacen anulando ese pago desde aquí mismo. Los pagos de ventas se anulan
            en el módulo Pagos, los reembolsos en Devoluciones, y el saldo inicial se corrige editando la cuenta.
          </p>
        </CardContent>
      </Card>

      <DialogoBorrado
        abierto={!!filaBorrar}
        onCerrar={() => setFilaBorrar(null)}
        titulo={filaBorrar
          ? filaBorrar.origen === "transferencia" ? "Eliminar transferencia"
            : filaBorrar.pago_gasto_id != null ? "Anular pago de gasto"
            : filaBorrar.pago_ingreso_id != null ? "Anular cobro de ingreso"
            : "Eliminar movimiento manual"
          : ""}
        etiquetaBoton={filaBorrar && (filaBorrar.pago_gasto_id != null || filaBorrar.pago_ingreso_id != null) ? "Anular" : "Eliminar"}
        advertencia={filaBorrar ? descripcionBorrado(filaBorrar) : ""}
        onConfirmar={async (clave, motivo) => {
          const mensaje = await ejecutarBorrado(filaBorrar!, clave, motivo);
          router.refresh();
          return mensaje;
        }}
      />
    </div>
  );
}
