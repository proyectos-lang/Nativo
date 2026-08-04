-- ============================================================
-- Migración 030: soportes de pago (comprobantes de los abonos).
-- Cada abono puede llevar uno o varios archivos: el comprobante de
-- la transferencia, la consignación, el recibo de caja. Tabla aparte
-- y no una columna en `pagos` para poder adjuntar varios, agregar uno
-- después de registrado el abono y borrar uno sin tocar los demás.
--
-- Los archivos van al bucket público `guias` bajo el prefijo
-- `soportes/` (mismo criterio que las guías de estampado/bordado).
-- Se guarda la URL, igual que en `ventas_detalle.imagen_*_url`.
--
-- `on delete cascade`: anular un abono se lleva sus soportes, que sin
-- el pago no significan nada.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

create table if not exists nativo.pagos_soportes (
  id bigint generated always as identity primary key,
  pago_id bigint not null references nativo.pagos (id) on delete cascade,
  url text not null,
  nombre_archivo text,
  tipo_archivo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_pagos_soportes_pago on nativo.pagos_soportes (pago_id);

grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
