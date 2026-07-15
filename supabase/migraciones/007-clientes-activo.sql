-- ============================================================
-- Migración 007: Activar/desactivar clientes. Un cliente
-- desactivado deja de aparecer en el selector de clientes de
-- Ventas (registrar/editar), pero sigue visible en el módulo
-- Clientes para poder reactivarlo o consultarlo.
-- Idempotente (mismo criterio que migraciones anteriores).
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.clientes add column if not exists activo boolean not null default true;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
