import { requiereSesion } from "@/lib/sesion";
import { listasMaestras, clientesTodos, productosTodos, ventasConCliente, detallesPorVenta } from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistrarVentaForm } from "./registrar-form";
import { HistorialVentas } from "./historial";
import type { Cliente, Venta, VentaDetalle } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaVentas() {
  await requiereSesion();
  const [maestros, clientes, productos, ventas, detalles] = await Promise.all([
    listasMaestras(), clientesTodos(), productosTodos(), ventasConCliente(), detallesPorVenta(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Tabs defaultValue="registrar">
        <TabsList>
          <TabsTrigger value="registrar">Registrar Venta</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="registrar">
          <RegistrarVentaForm maestros={maestros} clientes={clientes as Cliente[]} productos={productos} />
        </TabsContent>
        <TabsContent value="historial">
          <HistorialVentas
            ventas={ventas as Venta[]}
            detalles={detalles as Record<number, VentaDetalle[]>}
            maestros={maestros}
            productos={productos}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
