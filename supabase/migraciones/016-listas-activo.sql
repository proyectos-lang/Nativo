-- ============================================================
-- Migración 016: Listas Maestras administrables por línea —
-- cada valor se puede editar, activar o inactivar. Un valor
-- inactivo desaparece de los selectores de la app pero los
-- registros históricos (que guardan el texto copiado) no cambian.
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.listas_maestras add column if not exists activo boolean not null default true;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
