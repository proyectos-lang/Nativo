import { requiereSesion } from "@/lib/sesion";
import { listasMaestras, clientesActivos, productosTodos, ventasConCliente, detallesPorVenta, cuentasConSaldo, pagosPorVenta, catalogoVentaInventario, costosPorNombreProducto } from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistrarVentaForm } from "./registrar-form";
import { HistorialVentas } from "./historial";
import type { Cliente, Venta, VentaDetalle, CuentaBancaria, Pago, InfoInventarioVenta } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Ejecuta una consulta de la pantalla tolerando fallos puntuales. Esta página se
 * vuelve a renderizar como parte de la respuesta al registrar una venta: si una
 * consulta fallara ahí, la venta queda guardada pero el usuario ve el error
 * genérico de Next.js (que oculta la causa). Degradando, la pantalla siempre
 * responde y el motivo real queda en los logs del servidor.
 */
async function tolerante<T>(nombre: string, consulta: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await consulta();
  } catch (e) {
    console.error(`[ventas] la consulta "${nombre}" falló; se usa un valor vacío:`, (e as Error).message);
    return respaldo;
  }
}

/**
 * Acepta filtros por URL para que el Dashboard pueda enlazar directo a las
 * ventas de un mes ("Ventas del Mes", "Entregados"). Con cualquier filtro
 * presente se abre la pestaña Historial en vez del formulario.
 */
export default async function PaginaVentas(
  { searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; estado?: string; tab?: string }> },
) {
  await requiereSesion();
  const params = await searchParams;
  const hayFiltro = !!(params.desde || params.hasta || params.estado);
  const [maestros, clientes, productos, ventas, detalles, cuentas, pagos, inventario, costosReceta] = await Promise.all([
    tolerante("listasMaestras", listasMaestras, {} as Record<string, string[]>),
    tolerante("clientesActivos", clientesActivos, [] as unknown[]),
    tolerante("productosTodos", productosTodos, [] as string[]),
    tolerante("ventasConCliente", ventasConCliente, [] as unknown[]),
    tolerante("detallesPorVenta", detallesPorVenta, {} as Record<number, unknown[]>),
    tolerante("cuentasConSaldo", cuentasConSaldo, [] as unknown[]),
    tolerante("pagosPorVenta", pagosPorVenta, {} as Record<number, unknown[]>),
    tolerante("catalogoVentaInventario", catalogoVentaInventario, [] as unknown[]),
    tolerante("costosPorNombreProducto", costosPorNombreProducto, {} as Record<string, number>),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Tabs defaultValue={hayFiltro || params.tab === "historial" ? "historial" : "registrar"}>
        <TabsList>
          <TabsTrigger value="registrar">Registrar Venta</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="registrar">
          <RegistrarVentaForm maestros={maestros} clientes={clientes as Cliente[]} productos={productos} cuentas={(cuentas as CuentaBancaria[]).filter(c => c.activa)} inventario={inventario as InfoInventarioVenta[]} />
        </TabsContent>
        <TabsContent value="historial">
          <HistorialVentas
            ventas={ventas as Venta[]}
            detalles={detalles as Record<number, VentaDetalle[]>}
            pagos={pagos as Record<number, Pago[]>}
            maestros={maestros}
            productos={productos}
            clientes={clientes as Cliente[]}
            inventario={inventario as InfoInventarioVenta[]}
            costosReceta={costosReceta as Record<string, number>}
            filtroInicial={{ desde: params.desde, hasta: params.hasta, estado: params.estado }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
