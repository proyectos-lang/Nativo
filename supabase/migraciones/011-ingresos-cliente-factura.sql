-- ============================================================
-- Migración 011: Ingresos — cliente vinculado, tipo de ingreso,
-- estado de facturación y número de factura.
-- Idempotente (mismo criterio que migraciones anteriores).
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.ingresos add column if not exists cliente_id bigint references nativo.clientes (id);
alter table nativo.ingresos add column if not exists cliente text;

alter table nativo.ingresos add column if not exists tipo_ingreso text
  check (tipo_ingreso is null or tipo_ingreso in ('Abono a Factura', 'Cancela Factura', 'Otro'));

alter table nativo.ingresos add column if not exists estado_facturacion text not null default 'No Aplica'
  check (estado_facturacion in ('Pendiente de Facturar', 'Facturado', 'No Aplica'));

alter table nativo.ingresos add column if not exists numero_factura text;

create index if not exists idx_ingresos_cliente on nativo.ingresos (cliente_id);

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
