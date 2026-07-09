"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, DollarSign, Truck, Hourglass,
  Users, Contact, Settings, Package, LogOut,
} from "lucide-react";
import type { Sesion, Modulo } from "@/lib/tipos";

const ITEMS: { clave: Modulo; titulo: string; url: string; icono: React.ElementType }[] = [
  { clave: "dashboard", titulo: "Dashboard", url: "/", icono: LayoutDashboard },
  { clave: "ventas", titulo: "Ventas", url: "/ventas", icono: ShoppingCart },
  { clave: "pagos", titulo: "Pagos", url: "/pagos", icono: DollarSign },
  { clave: "entregas", titulo: "Entregas", url: "/entregas", icono: Truck },
  { clave: "seguimiento", titulo: "Seguimiento", url: "/seguimiento", icono: Hourglass },
  { clave: "prospectos", titulo: "Prospectos", url: "/prospectos", icono: Contact },
  { clave: "clientes", titulo: "Clientes", url: "/clientes", icono: Users },
  { clave: "configuracion", titulo: "Configuración", url: "/configuracion", icono: Settings },
];

export function AppSidebar({ sesion, accionSalir }: { sesion: Sesion; accionSalir: () => Promise<void> }) {
  const ruta = usePathname();
  const visibles = ITEMS.filter(i => sesion.rol === "admin" || sesion.permisos?.[i.clave]);

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Nativo</p>
            <p className="text-xs text-muted-foreground">Pedidos y Despachos</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibles.map(item => (
                <SidebarMenuItem key={item.clave}>
                  <SidebarMenuButton
                    isActive={ruta === item.url || (item.url !== "/" && ruta.startsWith(item.url))}
                    render={<Link href={item.url} />}
                  >
                    <item.icono />
                    <span>{item.titulo}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{sesion.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{sesion.rol === "admin" ? "Administrador" : "Usuario"}</p>
          </div>
          <form action={accionSalir}>
            <Button type="submit" variant="ghost" size="icon" title="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
