import { requiereSesion } from "@/lib/sesion";
import { salir } from "@/app/login/acciones";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await requiereSesion();

  return (
    <SidebarProvider>
      <AppSidebar sesion={sesion} accionSalir={salir} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-5" />
          <h1 className="truncate text-sm font-semibold sm:text-base">
            Sistema de Control de Pedidos y Despachos Nativo
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
