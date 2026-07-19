import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsuariosCliente } from "./usuarios-cliente";
import { MaestrasCliente } from "./maestras-cliente";
import { ProductosCliente } from "./productos-cliente";
import { SeguridadCliente } from "./seguridad-cliente";
import type { Usuario } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracion() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.configuracion) redirect("/");

  const [{ data: usuarios, error: e1 }, { data: maestras, error: e2 }, { data: productos, error: e3 }, { data: config }] = await Promise.all([
    db().from("usuarios").select("id, nombre, usuario, correo, rol, permisos, activo").order("nombre"),
    db().from("listas_maestras").select("*").order("tipo").order("valor"),
    db().from("productos").select("*").order("nombre"),
    db().from("configuracion_sistema").select("frecuencia_conteo").limit(1).maybeSingle(),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-4 text-xl font-bold">Configuración</h2>
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios y Permisos</TabsTrigger>
          <TabsTrigger value="maestras">Listas Maestras</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          {sesion.rol === "admin" && <TabsTrigger value="seguridad">Seguridad</TabsTrigger>}
        </TabsList>
        <TabsContent value="usuarios">
          <UsuariosCliente usuarios={(usuarios || []) as Usuario[]} sesionId={sesion.id} />
        </TabsContent>
        <TabsContent value="maestras">
          <MaestrasCliente valores={(maestras || []) as { id: number; tipo: string; valor: string; activo: boolean }[]} />
        </TabsContent>
        <TabsContent value="productos">
          <ProductosCliente productos={(productos || []) as { id: number; nombre: string }[]} />
        </TabsContent>
        {sesion.rol === "admin" && (
          <TabsContent value="seguridad">
            <SeguridadCliente frecuenciaConteo={(config?.frecuencia_conteo as string) || ""} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
