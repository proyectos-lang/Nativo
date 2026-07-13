-- ============================================================
-- Migración 004: Bitácora general de trazabilidad. Generaliza
-- auditoria_ediciones (antes exclusiva de ediciones de gastos e
-- ingresos) a todas las mutaciones del sistema: ventas, pagos,
-- entregas, financiero, clientes, proveedores, usuarios,
-- catálogos y prospectos. Módulo visible solo para administradores.
--
-- Idempotente: el SQL Editor de Supabase ejecuta cada statement
-- con auto-commit (no todo el script en una sola transacción), así
-- que si una corrida anterior falló a la mitad, es seguro volver a
-- correr este script completo tal cual — cada paso se salta si ya
-- se aplicó.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'nativo' and table_name = 'auditoria_ediciones') then
    alter table nativo.auditoria_ediciones rename to bitacora;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'nativo' and indexname = 'idx_auditoria_tabla_registro') then
    alter index nativo.idx_auditoria_tabla_registro rename to idx_bitacora_entidad;
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'nativo' and indexname = 'idx_auditoria_fecha') then
    alter index nativo.idx_auditoria_fecha rename to idx_bitacora_fecha;
  end if;
end $$;

-- Columnas nuevas con default que preserva el significado de las
-- filas existentes (todas eran ediciones financieras registradas
-- manualmente por editarGasto/editarIngreso).
alter table nativo.bitacora add column if not exists modulo text not null default 'financiero';
alter table nativo.bitacora add column if not exists accion text not null default 'editar';
alter table nativo.bitacora add column if not exists descripcion text not null default '';

create index if not exists idx_bitacora_usuario on nativo.bitacora (usuario);
create index if not exists idx_bitacora_modulo on nativo.bitacora (modulo);
create index if not exists idx_bitacora_accion on nativo.bitacora (accion);

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
