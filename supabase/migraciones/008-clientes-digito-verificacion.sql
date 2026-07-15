-- ============================================================
-- Migración 008: Dígito de verificación del NIT como campo
-- separado en Clientes (antes solo existía el campo RUT/NIT
-- de una sola pieza).
-- Idempotente (mismo criterio que migraciones anteriores).
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.clientes add column if not exists digito_verificacion text;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
