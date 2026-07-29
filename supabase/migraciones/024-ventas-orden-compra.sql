-- ============================================================
-- Migración 024: orden de compra / pedido del CLIENTE en la venta.
-- Algunos clientes envían su propio número de orden de compra u
-- orden de pedido y hace falta guardarlo para relacionarlo después
-- al facturar o cobrar.
-- Se llama `orden_compra_cliente` (y no `orden_compra`) para no
-- confundirla con el módulo `ordenes_compra`, que son las órdenes
-- que Nativo emite a SUS proveedores.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.ventas add column if not exists orden_compra_cliente text;
create index if not exists idx_ventas_orden_compra on nativo.ventas (orden_compra_cliente);

grant all on all tables in schema nativo to service_role;
