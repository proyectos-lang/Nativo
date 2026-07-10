<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas del proyecto Nativo

- **Esquema de base de datos**: `supabase/schema.sql` es la fuente de verdad y `supabase/ESQUEMA.md` es su documentación legible. Cualquier cambio de esquema (tablas, columnas, índices, funciones RPC) debe actualizar **ambos archivos en el mismo commit**.
- Tablas en español, ids `bigint identity` (no UUID), esquema `nativo`.
- Todo acceso a datos es server-side (service role); el navegador nunca llama a Supabase directamente.
