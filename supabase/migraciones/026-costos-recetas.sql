-- ============================================================
-- Migración 026: Costos y Recetas (explosión de materiales / MRP).
-- Cada producto de venta puede tener su receta: los materiales que
-- lo componen con su consumo, unidad de medida y costo. Con eso se
-- calcula venta − costo = utilidad.
-- El costo se CONGELA en la venta (ventas_detalle.costo_unitario)
-- para que actualizar una receta no altere la utilidad histórica.
-- Permiso propio "costos" (apagado por defecto): los márgenes son
-- información sensible.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

-- Una receta por producto de venta
create table if not exists nativo.recetas (
  id bigint generated always as identity primary key,
  producto_id bigint not null unique references nativo.productos (id) on delete cascade,
  notas text,
  costo_total numeric not null default 0,
  usuario text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_recetas_producto on nativo.recetas (producto_id);

-- Líneas de la receta. `tipo` permite que mano de obra y servicios externos
-- (bordado, estampado) entren como líneas más, sin columnas adicionales.
-- FK blanda + texto copiado, mismo criterio que el kardex.
create table if not exists nativo.recetas_materiales (
  id bigint generated always as identity primary key,
  receta_id bigint not null references nativo.recetas (id) on delete cascade,
  tipo text not null default 'Material'
    check (tipo in ('Material', 'Mano de obra', 'Servicio', 'Otro')),
  material_producto_id bigint references nativo.productos (id) on delete set null,
  material text not null,
  cantidad numeric not null default 1 check (cantidad > 0),
  unidad_medida text,
  costo_unitario numeric not null default 0,
  costo_total numeric not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_recetas_materiales_receta on nativo.recetas_materiales (receta_id);
create index if not exists idx_recetas_materiales_producto on nativo.recetas_materiales (material_producto_id);

-- ------------------------------------------------------------
-- Costo congelado al momento de vender. Nullable a propósito:
-- null = venta anterior a este módulo (se calcula con la receta actual).
-- ------------------------------------------------------------
alter table nativo.ventas_detalle add column if not exists costo_unitario numeric;
alter table nativo.ventas_detalle add column if not exists costo_total numeric;

-- ------------------------------------------------------------
-- USUARIOS: nuevo permiso "costos" (apagado por defecto)
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false, "compras": false, "activos": false, "solicitudes": true, "costos": false}'::jsonb;

update nativo.usuarios
  set permisos = permisos || '{"costos": false}'::jsonb
  where not (permisos ? 'costos');

grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
