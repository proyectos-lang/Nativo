"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo de Nativo (public/logo.png). Si el archivo no existe todavía,
 * muestra un ícono de respaldo con el mismo estilo.
 */
export function LogoNativo({ className }: { className?: string }) {
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <div className={cn("flex items-center justify-center rounded-full bg-primary text-primary-foreground", className)}>
        <Package className="size-[55%]" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Nativo"
      className={cn("rounded-full object-contain", className)}
      onError={() => setFallo(true)}
    />
  );
}
