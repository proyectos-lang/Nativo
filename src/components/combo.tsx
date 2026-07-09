"use client";

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
  return (
    <Combobox
      items={opciones}
      inputValue={value}
      onInputValueChange={v => onChange(v ?? "")}
      value={opciones.includes(value) ? value : null}
      onValueChange={v => { if (v !== null && v !== undefined) onChange(String(v)); }}
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
