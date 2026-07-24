-- ============================================================
-- Migración 018: campos adicionales de Activos Fijos (ficha
-- completa de la contadora). Depreciación MANUAL: se captura el
-- valor actual depreciado y su fecha de valoración. AREA y
-- ESTADO ACTUAL (condición física) son listas maestras nuevas;
-- ESTADO ACTUAL es la condición física, distinta del `estado`
-- de ciclo de vida (Activo/Vendido/Dado de Baja).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.activos add column if not exists fecha_ingreso date;
alter table nativo.activos add column if not exists area text;
alter table nativo.activos add column if not exists marca text;
alter table nativo.activos add column if not exists color text;
alter table nativo.activos add column if not exists dimensiones text;
alter table nativo.activos add column if not exists modelo text;
alter table nativo.activos add column if not exists numero_serie text;
alter table nativo.activos add column if not exists estado_actual text;
alter table nativo.activos add column if not exists garantia_vida_util text;
alter table nativo.activos add column if not exists fecha_valuacion date;
alter table nativo.activos add column if not exists valor_actual_depreciacion numeric;

-- ------------------------------------------------------------
-- Listas maestras nuevas: área y estado (condición física)
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('area_activo', 'Administración'),
  ('area_activo', 'Producción'),
  ('area_activo', 'Ventas'),
  ('area_activo', 'Diseño'),
  ('area_activo', 'Bodega'),
  ('estado_activo', 'Nuevo'),
  ('estado_activo', 'Bueno'),
  ('estado_activo', 'Regular'),
  ('estado_activo', 'Malo'),
  ('estado_activo', 'Fuera de servicio')
on conflict do nothing;

grant all on all tables in schema nativo to service_role;
