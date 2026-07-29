"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { novedadesDe, marcarNotificacionesLeidas, guardarSuscripcionPush } from "@/app/(app)/notificaciones/acciones";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, BellRing, Check, Inbox } from "lucide-react";
import type { Notificacion } from "@/lib/tipos";

const INTERVALO_MS = 30_000;

function haceCuanto(fecha: string): string {
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

/** Convierte la clave VAPID en el formato que exige pushManager.subscribe. */
function claveAUint8(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal);
  const salida = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

export function CampanaNotificaciones({ noLeidas: inicialNoLeidas, items: inicialItems }: {
  noLeidas: number;
  items: Notificacion[];
}) {
  const router = useRouter();
  const [noLeidas, setNoLeidas] = useState(inicialNoLeidas);
  const [items, setItems] = useState<Notificacion[]>(inicialItems);
  const [abierto, setAbierto] = useState(false);
  const [pushEstado, setPushEstado] = useState<"desconocido" | "activo" | "disponible" | "no-soportado">("desconocido");
  const ultimoConteo = useRef(inicialNoLeidas);

  // Refresco automático: consulta las novedades cada 30 s y avisa si llegó algo nuevo.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await novedadesDe();
        if (!vivo) return;
        setItems(r.items);
        setNoLeidas(r.noLeidas);
        if (r.noLeidas > ultimoConteo.current) {
          const nueva = r.items.find(n => !n.leida);
          toast.info(nueva?.titulo || "Tienes una solicitud nueva", { description: nueva?.cuerpo || undefined, duration: 8000 });
          router.refresh(); // actualiza también el contador del menú lateral
        }
        ultimoConteo.current = r.noLeidas;
      } catch {
        /* silencioso: es un sondeo de fondo */
      }
    };
    const id = setInterval(consultar, INTERVALO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [router]);

  // Estado del permiso de notificaciones del navegador.
  useEffect(() => {
    const revisar = () => {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
        setPushEstado("no-soportado");
        return;
      }
      setPushEstado(Notification.permission === "granted" ? "activo" : "disponible");
    };
    const id = setTimeout(revisar, 0);
    return () => clearTimeout(id);
  }, []);

  const activarPush = async () => {
    try {
      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!clave) { toast.error("Las notificaciones push no están configuradas en el servidor."); return; }

      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { toast.error("No se concedió el permiso de notificaciones."); return; }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existente = await reg.pushManager.getSubscription();
      const sub = existente ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveAUint8(clave) as BufferSource,
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const r = await guardarSuscripcionPush({
        endpoint: json.endpoint || "",
        p256dh: json.keys?.p256dh || "",
        auth: json.keys?.auth || "",
        agente: navigator.userAgent,
      });
      if (!r.ok) { toast.error(r.error || "No se pudo guardar la suscripción."); return; }

      setPushEstado("activo");
      toast.success("Notificaciones activadas en este dispositivo");
    } catch (e) {
      toast.error("No se pudieron activar: " + (e as Error).message);
    }
  };

  const marcarLeidas = async () => {
    await marcarNotificacionesLeidas();
    setNoLeidas(0);
    ultimoConteo.current = 0;
    setItems(prev => prev.map(n => ({ ...n, leida: true })));
    router.refresh();
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones">
            {noLeidas > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
            {noLeidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {noLeidas > 9 ? "9+" : noLeidas}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notificaciones</p>
          {noLeidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={marcarLeidas}>
              <Check className="size-3.5" /> Marcar leídas
            </Button>
          )}
        </div>

        <div className="tabla-scroll max-h-72 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No tienes notificaciones.</p>
          )}
          {items.map(n => (
            <Link
              key={n.id}
              href={n.url || "/solicitudes"}
              onClick={() => setAbierto(false)}
              className={`block border-b px-3 py-2 last:border-b-0 hover:bg-muted/60 ${n.leida ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-2">
                {!n.leida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.titulo}</p>
                  {n.cuerpo && <p className="truncate text-xs text-muted-foreground">{n.cuerpo}</p>}
                  <p className="text-[11px] text-muted-foreground">{haceCuanto(n.creado_en)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="border-t p-2">
          {pushEstado === "disponible" && (
            <Button variant="outline" size="sm" className="w-full" onClick={activarPush}>
              <BellRing className="size-4" /> Activar notificaciones en este dispositivo
            </Button>
          )}
          {pushEstado === "activo" && (
            <p className="px-1 py-0.5 text-center text-xs text-muted-foreground">
              Notificaciones activadas en este dispositivo.
            </p>
          )}
          <Link href="/solicitudes" onClick={() => setAbierto(false)} className="mt-1 block">
            <Button variant="ghost" size="sm" className="w-full text-xs">
              <Inbox className="size-3.5" /> Ver todas las solicitudes
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
