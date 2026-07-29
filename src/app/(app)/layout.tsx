import { requiereSesion } from "@/lib/sesion";
import { salir } from "@/app/login/acciones";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CampanaNotificaciones } from "@/components/campana-notificaciones";
import { solicitudesPendientesDe, notificacionesDe, notificacionesNoLeidas } from "@/lib/consultas";
import type { Notificacion } from "@/lib/tipos";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await requiereSesion();
  const [pendientesSolicitudes, noLeidas, notificaciones] = await Promise.all([
    solicitudesPendientesDe(sesion.id),
    notificacionesNoLeidas(sesion.id),
    notificacionesDe(sesion.id),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar sesion={sesion} accionSalir={salir} pendientesSolicitudes={pendientesSolicitudes} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-primary/10 bg-white/60 px-4 backdrop-blur-md">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-5" />
          <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Sistema de Control de Pedidos y Despachos Nativo
          </h1>
          <div className="ml-auto">
            <CampanaNotificaciones noLeidas={noLeidas} items={notificaciones as Notificacion[]} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
