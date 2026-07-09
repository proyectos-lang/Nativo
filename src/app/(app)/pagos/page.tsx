import { requiereSesion } from "@/lib/sesion";
import { ventasConCliente, pagosPorVenta } from "@/lib/consultas";
import { PagosCliente } from "./pagos-cliente";
import type { Venta, Pago } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaPagos() {
  await requiereSesion();
  const [ventas, pagos] = await Promise.all([ventasConCliente(), pagosPorVenta()]);
  return <PagosCliente ventas={ventas as Venta[]} pagos={pagos as Record<number, Pago[]>} />;
}
