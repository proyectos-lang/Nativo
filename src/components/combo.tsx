"use client";

import { useState } from "react";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

/**
 * Combobox de texto libre: permite desplegar las opciones del catálogo
 * y también escribir un valor nuevo. El valor efectivo es lo escrito/seleccionado.
 */
export function Combo({ opciones, value, onChange, placeholder, className }: {
  opciones: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  /**
   * Texto que tenía el campo al abrir la lista. Como el campo es de texto libre,
   * lo escrito ES el valor, así que al desplegar se filtraba por el valor ya
   * elegido y se escondían las demás opciones: con "En Proceso" solo salían las
   * tres que empiezan así. Mientras el texto no cambie se muestran todas; en
   * cuanto el usuario escribe algo distinto vuelve a filtrar con el criterio
   * por defecto de la librería.
   */
  const [textoAlAbrir, setTextoAlAbrir] = useState<string | null>(null);
  const sinTocar = textoAlAbrir !== null && value === textoAlAbrir;

  return (
    <Combobox
      items={opciones}
      inputValue={value}
      onInputValueChange={v => onChange(v ?? "")}
      value={opciones.includes(value) ? value : null}
      onValueChange={v => { if (v !== null && v !== undefined) onChange(String(v)); }}
      onOpenChange={abierto => setTextoAlAbrir(abierto ? value : null)}
      filter={sinTocar ? null : undefined}
      openOnInputClick
    >
      <ComboboxInput
        placeholder={placeholder || "Escriba o elija..."}
        className={cn("w-full", className)}
      />
      <ComboboxContent>
        <ComboboxEmpty>Sin coincidencias — se usará lo escrito.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
