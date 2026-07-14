-- ============================================================
-- Migración 006: Control por producto en Entregas. Permite marcar
-- cada línea de un pedido como lista/pendiente independientemente
-- del estado general de la entrega (útil cuando un pedido tiene
-- varios productos y algunos terminan antes que otros).
-- Idempotente (mismo criterio que 004/005).
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.ventas_detalle add column if not exists listo boolean not null default false;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
