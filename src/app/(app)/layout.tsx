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
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-primary/10 bg-white/60 px-4 backdrop-blur-md">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-5" />
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Sistema de Control de Pedidos y Despachos Nativo
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
