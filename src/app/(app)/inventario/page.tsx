import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  productosCatalogo, ubicacionesInventario, existenciasInventario,
  reservasInventarioActivas, movimientosInventario, listasMaestras, proveedoresTodos,
  arqueosTodos, arqueosDetallePorArqueo, movimientosInventarioResumen, reservasInventarioTodas,
} from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "./dashboard-tab";
import { ExistenciasTab } from "./existencias-tab";
import { ProductosTab } from "./productos-tab";
import { OperacionesTab } from "./operaciones-tab";
import { PendientesTab } from "./pendientes-tab";
import { ArqueosTab } from "./arqueos-tab";
import { KardexTab } from "./kardex-tab";
import { ReportesTab } from "./reportes-tab";
import type { Producto, InventarioUbicacion, InventarioExistencia, InventarioReserva, InventarioMovimiento, Proveedor, Arqueo, ArqueoDetalle } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaInventario() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.inventario) redirect("/");

  const [productos, ubicaciones, existencias, reservas, movimientos, maestros, proveedores, arqueos, arqueosDetalle, movResumen, reservasTodas] = await Promise.all([
    productosCatalogo(),
    ubicacionesInventario(),
    existenciasInventario(),
    reservasInventarioActivas(),
    movimientosInventario(500),
    listasMaestras(),
    proveedoresTodos(),
    arqueosTodos(),
    arqueosDetallePorArqueo(),
    movimientosInventarioResumen(12),
    reservasInventarioTodas(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="mb-4 text-xl font-bold">Inventario</h2>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="arqueos">Arqueos</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardTab
            productos={productos as Producto[]}
            existencias={existencias as InventarioExistencia[]}
            reservas={reservas as InventarioReserva[]}
            movimientosResumen={movResumen as never[]}
          />
        </TabsContent>
        <TabsContent value="existencias">
          <ExistenciasTab
            productos={productos as Producto[]}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
            existencias={existencias as InventarioExistencia[]}
            reservas={reservas as InventarioReserva[]}
          />
        </TabsContent>
        <TabsContent value="productos">
          <ProductosTab
            productos={productos as Producto[]}
            maestros={maestros}
          />
        </TabsContent>
        <TabsContent value="operaciones">
          <OperacionesTab
            productos={productos as Producto[]}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
            existencias={existencias as InventarioExistencia[]}
            proveedores={proveedores as Proveedor[]}
            maestros={maestros}
          />
        </TabsContent>
        <TabsContent value="pendientes">
          <PendientesTab reservas={reservas as InventarioReserva[]} />
        </TabsContent>
        <TabsContent value="arqueos">
          <ArqueosTab
            arqueos={arqueos as Arqueo[]}
            detalles={arqueosDetalle as Record<number, ArqueoDetalle[]>}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
            categorias={maestros["categoria_producto"] || []}
          />
        </TabsContent>
        <TabsContent value="kardex">
          <KardexTab
            movimientos={movimientos as InventarioMovimiento[]}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
          />
        </TabsContent>
        <TabsContent value="reportes">
          <ReportesTab
            productos={productos as Producto[]}
            existencias={existencias as InventarioExistencia[]}
            reservas={reservasTodas as InventarioReserva[]}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
            movimientosResumen={movResumen as never[]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
