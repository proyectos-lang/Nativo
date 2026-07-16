-- ============================================================
-- Migración 010: Observación (motivo detallado) por prenda devuelta,
-- independiente del causal (categoría). Idempotente.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.devoluciones_detalle add column if not exists observacion text;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
