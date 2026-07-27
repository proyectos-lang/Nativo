-- ============================================================
-- Migración 020: tipo/categoría de proveedor (Telas, Diseñadores
-- gráficos, etc.). Columna libre alimentada por la lista maestra
-- tipo_proveedor (administrable en Configuración).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.proveedores add column if not exists tipo text;

insert into nativo.listas_maestras (tipo, valor) values
  ('tipo_proveedor', 'Telas'),
  ('tipo_proveedor', 'Insumos'),
  ('tipo_proveedor', 'Diseñadores gráficos'),
  ('tipo_proveedor', 'Bordado'),
  ('tipo_proveedor', 'Estampado'),
  ('tipo_proveedor', 'Publicidad'),
  ('tipo_proveedor', 'Servicios'),
  ('tipo_proveedor', 'Transportadora'),
  ('tipo_proveedor', 'Otros')
on conflict do nothing;

grant all on all tables in schema nativo to service_role;
