-- ============================================================
-- Migración 031: estados de entrega en la lista maestra.
--
-- `ventas.estado_entrega` tiene default 'En Proceso', y ese mismo
-- valor es el respaldo que usan entregas, seguimiento y ventas
-- cuando una venta aún no tiene estado. Pero 'En Proceso' NUNCA
-- estuvo en `listas_maestras`, así que:
--   - el desplegable no lo ofrecía, y
--   - 8 ventas quedaron con un estado que no existía en la lista.
--
-- Además, los estados de entrega nunca se sembraron aquí: se habían
-- creado a mano desde Configuración, de modo que una instalación
-- nueva arrancaba con el desplegable vacío. Se siembran los siete.
--
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

insert into nativo.listas_maestras (tipo, valor) values
  ('estado_entrega', 'Sin Procesar'),
  ('estado_entrega', 'En Proceso'),
  ('estado_entrega', 'En Proceso Confección'),
  ('estado_entrega', 'En Proceso Estampado'),
  ('estado_entrega', 'En Proceso Bordado'),
  ('estado_entrega', 'Despachado'),
  ('estado_entrega', 'Entregado')
on conflict do nothing;
