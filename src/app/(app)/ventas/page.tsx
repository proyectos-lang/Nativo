import { requiereSesion } from "@/lib/sesion";
import { listasMaestras, clientesActivos, productosTodos, ventasConCliente, detallesPorVenta, cuentasConSaldo, pagosPorVenta, catalogoVentaInventario } from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistrarVentaForm } from "./registrar-form";
import { HistorialVentas } from "./historial";
import type { Cliente, Venta, VentaDetalle, CuentaBancaria, Pago, InfoInventarioVenta } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaVentas() {
  await requiereSesion();
  const [maestros, clientes, productos, ventas, detalles, cuentas, pagos, inventario] = await Promise.all([
    listasMaestras(), clientesActivos(), productosTodos(), ventasConCliente(), detallesPorVenta(), cuentasConSaldo(), pagosPorVenta(), catalogoVentaInventario(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Tabs defaultValue="registrar">
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
