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
  Users, Contact, Settings, LogOut, Landmark, Package, ScrollText, RotateCcw, Boxes,
} from "lucide-react";
import { LogoNativo } from "@/components/logo-nativo";
import type { Sesion, Modulo } from "@/lib/tipos";

const ITEMS: { clave: Modulo; titulo: string; url: string; icono: React.ElementType }[] = [
  { clave: "dashboard", titulo: "Dashboard", url: "/", icono: LayoutDashboard },
  { clave: "ventas", titulo: "Ventas", url: "/ventas", icono: ShoppingCart },
  { clave: "pagos", titulo: "Pagos", url: "/pagos", icono: DollarSign },
  { clave: "entregas", titulo: "Entregas", url: "/entregas", icono: Truck },
  { clave: "devoluciones", titulo: "Devoluciones", url: "/devoluciones", icono: RotateCcw },
  { clave: "seguimiento", titulo: "Seguimiento", url: "/seguimiento", icono: Hourglass },
  { clave: "prospectos", titulo: "Prospectos", url: "/prospectos", icono: Contact },
  { clave: "clientes", titulo: "Clientes", url: "/clientes", icono: Users },
  { clave: "proveedores", titulo: "Proveedores", url: "/proveedores", icono: Package },
  { clave: "inventario", titulo: "Inventario", url: "/inventario", icono: Boxes },
  { clave: "financiero", titulo: "Financiero", url: "/financiero", icono: Landmark },
  { clave: "configuracion", titulo: "Configuración", url: "/configuracion", icono: Settings },
];

export function AppSidebar({ sesion, accionSalir }: { sesion: Sesion; accionSalir: () => Promise<void> }) {
  const ruta = usePathname();
  const visibles = ITEMS.filter(i => sesion.rol === "admin" || sesion.permisos?.[i.clave]);

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <LogoNativo className="size-10 shrink-0 shadow-md ring-2 ring-white/20" />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">Nativo</p>
            <p className="text-xs opacity-70">Pedidos y Despachos</p>
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
        {sesion.rol === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={ruta.startsWith("/trazabilidad")}
                    render={<Link href="/trazabilidad" />}
                  >
                    <ScrollText />
                    <span>Trazabilidad</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold uppercase">
              {sesion.nombre.charAt(0)}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{sesion.nombre}</p>
              <p className="truncate text-xs opacity-70">{sesion.rol === "admin" ? "Administrador" : "Usuario"}</p>
            </div>
          </div>
          <form action={accionSalir}>
            <Button type="submit" variant="ghost" size="icon" title="Cerrar sesión" className="text-sidebar-foreground hover:bg-white/15 hover:text-white">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
