-- ============================================================
-- Migración 017: Módulo Activos Fijos — mobiliario y equipos de
-- la empresa (NO mercancía para vender). A diferencia del kardex
-- inmutable de Inventario, aquí SÍ se edita para actualizar precio
-- o información. La baja no borra: cambia estado a 'Vendido' o
-- 'Dado de Baja' y el registro sigue consultable en historial.
-- La compra de un activo nuevo puede generar automáticamente un
-- Gasto en Financiero (mismo espíritu que recibir_orden_compra).
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

create table if not exists nativo.activos (
  id bigint generated always as identity primary key,
  codigo text,
  nombre text not null,
  categoria text,
  descripcion text,
  cantidad numeric not null default 1 check (cantidad > 0),
  costo_unitario numeric not null default 0 check (costo_unitario >= 0),
  valor_total numeric not null default 0,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  proveedor text,
  numero_factura text,
  fecha_compra date not null default current_date,
  ubicacion text,
  estado text not null default 'Activo'
    check (estado in ('Activo', 'Vendido', 'Dado de Baja')),
  fecha_baja date,
  motivo_baja text,
  valor_baja numeric,
  observaciones_baja text,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  usuario text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_activos_estado on nativo.activos (estado);
create index if not exists idx_activos_categoria on nativo.activos (categoria);
create index if not exists idx_activos_proveedor on nativo.activos (proveedor_id);

-- ------------------------------------------------------------
-- USUARIOS: nuevo permiso "activos" en el default de permisos
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false, "compras": false, "activos": false}'::jsonb;

-- ------------------------------------------------------------
-- Semillas de listas maestras nuevas + categoría de gasto
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_activo', 'Mobiliario'),
  ('categoria_activo', 'Equipos de Cómputo'),
  ('categoria_activo', 'Equipos de Oficina'),
  ('categoria_activo', 'Herramientas'),
  ('categoria_activo', 'Electrodomésticos'),
  ('categoria_activo', 'Vehículos'),
  ('categoria_activo', 'Otros'),
  ('ubicacion_activo', 'Oficina Principal'),
  ('ubicacion_activo', 'Bodega'),
  ('ubicacion_activo', 'Taller'),
  ('ubicacion_activo', 'Local/Punto de Venta'),
  ('motivo_baja_activo', 'Vendido'),
  ('motivo_baja_activo', 'Dañado/Obsoleto'),
  ('motivo_baja_activo', 'Donado'),
  ('motivo_baja_activo', 'Perdido/Robado'),
  ('motivo_baja_activo', 'Otro'),
  ('categoria_gasto', 'Compra de Activo Fijo')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
