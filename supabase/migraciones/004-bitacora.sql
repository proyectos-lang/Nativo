-- ============================================================
-- Migración 004: Bitácora general de trazabilidad. Generaliza
-- auditoria_ediciones (antes exclusiva de ediciones de gastos e
-- ingresos) a todas las mutaciones del sistema: ventas, pagos,
-- entregas, financiero, clientes, proveedores, usuarios,
-- catálogos y prospectos. Módulo visible solo para administradores.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.auditoria_ediciones rename to bitacora;
alter index nativo.idx_auditoria_tabla_registro rename to idx_bitacora_entidad;
alter index nativo.idx_auditoria_fecha rename to idx_bitacora_fecha;

-- Columnas nuevas con default que preserva el significado de las
-- filas existentes (todas eran ediciones financieras registradas
-- manualmente por editarGasto/editarIngreso).
alter table nativo.bitacora add column modulo text not null default 'financiero';
alter table nativo.bitacora add column accion text not null default 'editar';
alter table nativo.bitacora add column descripcion text not null default '';

create index idx_bitacora_usuario on nativo.bitacora (usuario);
create index idx_bitacora_modulo on nativo.bitacora (modulo);
create index idx_bitacora_accion on nativo.bitacora (accion);

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
