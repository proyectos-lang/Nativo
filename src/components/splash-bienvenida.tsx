"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoNativo } from "@/components/logo-nativo";

/** Pantalla de bienvenida que aparece una vez tras iniciar sesión y se desvanece sola. */
export function SplashBienvenida({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    router.replace("/", { scroll: false }); // limpia ?bienvenida=1 de la URL
    const t = setTimeout(() => setVisible(false), 2900);
    return () => clearTimeout(t);
  }, [router]);

  if (!visible) return null;

  return (
    <div className="splash-nativo pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-950">
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-green-400/15 blur-3xl" />
      <div className="splash-nativo-contenido flex flex-col items-center gap-4 px-6 text-center text-white">
        <LogoNativo className="size-24 shadow-2xl ring-4 ring-white/20" />
        <div>
          <p className="text-sm font-medium tracking-widest text-emerald-200/80 uppercase">Bienvenido{nombre ? `, ${nombre.split(" ")[0]}` : ""} a</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">NATIVO LATAM</h1>
          <p className="mt-2 text-base text-emerald-100/80 sm:text-lg">— Sistema Integrado de Datos —</p>
        </div>
      </div>
    </div>
  );
}
