import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  productosCatalogo, ubicacionesInventario, existenciasInventario,
  reservasInventarioActivas, movimientosInventario, listasMaestras, proveedoresTodos,
} from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExistenciasTab } from "./existencias-tab";
import { ProductosTab } from "./productos-tab";
import { OperacionesTab } from "./operaciones-tab";
import { KardexTab } from "./kardex-tab";
import type { Producto, InventarioUbicacion, InventarioExistencia, InventarioReserva, InventarioMovimiento, Proveedor } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaInventario() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.inventario) redirect("/");

  const [productos, ubicaciones, existencias, reservas, movimientos, maestros, proveedores] = await Promise.all([
    productosCatalogo(),
    ubicacionesInventario(),
    existenciasInventario(),
    reservasInventarioActivas(),
    movimientosInventario(500),
    listasMaestras(),
    proveedoresTodos(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="mb-4 text-xl font-bold">Inventario</h2>
      <Tabs defaultValue="existencias">
        <TabsList>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
        </TabsList>
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
        <TabsContent value="kardex">
          <KardexTab
            movimientos={movimientos as InventarioMovimiento[]}
            ubicaciones={ubicaciones as InventarioUbicacion[]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
