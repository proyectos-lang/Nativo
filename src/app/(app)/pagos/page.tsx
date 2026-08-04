import { requiereSesion } from "@/lib/sesion";
import { ventasConCliente, pagosPorVenta, cuentasConSaldo, soportesPorPago } from "@/lib/consultas";
import { PagosCliente } from "./pagos-cliente";
import type { Venta, Pago, CuentaBancaria, SoportePago } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaPagos() {
  await requiereSesion();
  const [ventas, pagos, cuentas, soportes] = await Promise.all([
    ventasConCliente(), pagosPorVenta(), cuentasConSaldo(), soportesPorPago(),
  ]);
  return (
    <PagosCliente
      ventas={ventas as Venta[]}
      pagos={pagos as Record<number, Pago[]>}
      cuentas={(cuentas as CuentaBancaria[]).filter(c => c.activa)}
      soportes={soportes as Record<number, SoportePago[]>}
    />
  );
}
