import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteNativo = SupabaseClient<any, any, "nativo">;

let cliente: ClienteNativo | null = null;

/** Cliente Supabase de servidor (service role, esquema nativo). Nunca usar en el navegador. */
export function db(): ClienteNativo {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    cliente = createClient(url, key, {
      db: { schema: "nativo" },
      auth: { persistSession: false },
    });
  }
  return cliente;
}
