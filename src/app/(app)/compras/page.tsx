import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  ordenesCompra, ordenesCompraDetallePorOrden, proveedoresTodos,
  productosCatalogo, ubicacionesInventario,
} from "@/lib/consultas";
import { ComprasCliente } from "./compras-cliente";
import type { OrdenCompra, OrdenCompraDetalle, Proveedor, Producto, InventarioUbicacion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaCompras() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.compras) redirect("/");

  const [ordenes, detalles, proveedores, productos, ubicaciones] = await Promise.all([
    ordenesCompra(),
    ordenesCompraDetallePorOrden(),
    proveedoresTodos(),
    productosCatalogo(),
    ubicacionesInventario(),
  ]);

  return (
    <ComprasCliente
      ordenes={ordenes as OrdenCompra[]}
      detalles={detalles as Record<number, OrdenCompraDetalle[]>}
      proveedores={proveedores as Proveedor[]}
      productos={productos as Producto[]}
      ubicaciones={ubicaciones as InventarioUbicacion[]}
    />
  );
}
