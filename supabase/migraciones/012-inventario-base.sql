-- ============================================================
-- Migración 012: Sistema de Inventarios — Fase 1 (base).
-- Catálogo completo de productos (SKU, variantes, precios/IVA,
-- costo promedio, servicios), ubicaciones, existencias, kardex,
-- reservas y RPCs núcleo (ingreso con costo promedio ponderado,
-- traslados, ajustes, salidas manuales).
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- PRODUCTOS: de catálogo plano de nombres a catálogo completo.
-- Un producto = una referencia/variante (la talla/color hacen
-- parte de la identidad de la fila; el SKU es la clave real).
-- Los productos creados automáticamente desde Ventas quedan con
-- controla_inventario = false hasta enrolarse desde Inventario.
-- ------------------------------------------------------------
alter table nativo.productos add column if not exists sku text;
alter table nativo.productos add column if not exists codigo_barras text;
alter table nativo.productos add column if not exists categoria text;
alter table nativo.productos add column if not exists subcategoria text;
alter table nativo.productos add column if not exists sexo text;
alter table nativo.productos add column if not exists talla text;
alter table nativo.productos add column if not exists color text;
alter table nativo.productos add column if not exists manga text;
alter table nativo.productos add column if not exists unidad_medida text not null default 'Unidad';
alter table nativo.productos add column if not exists precio_compra numeric not null default 0;
alter table nativo.productos add column if not exists precio_venta_antes_iva numeric not null default 0;
alter table nativo.productos add column if not exists iva_porcentaje numeric not null default 0;
alter table nativo.productos add column if not exists precio_venta numeric not null default 0;
alter table nativo.productos add column if not exists costo_promedio numeric not null default 0;
alter table nativo.productos add column if not exists es_servicio boolean not null default false;
alter table nativo.productos add column if not exists controla_inventario boolean not null default false;
alter table nativo.productos add column if not exists estado text not null default 'Activo';
alter table nativo.productos add column if not exists fecha_vencimiento date;
alter table nativo.productos add column if not exists stock_minimo numeric not null default 0;
alter table nativo.productos add column if not exists stock_maximo numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_estado_check') then
    alter table nativo.productos add constraint productos_estado_check
      check (estado in ('Activo', 'Descontinuado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_servicio_sin_inventario') then
    alter table nativo.productos add constraint chk_servicio_sin_inventario
      check (not (es_servicio and controla_inventario));
  end if;
end
$$;

create unique index if not exists idx_productos_sku on nativo.productos (sku) where sku is not null;
create index if not exists idx_productos_categoria on nativo.productos (categoria);
create index if not exists idx_productos_estado on nativo.productos (estado);

-- ------------------------------------------------------------
-- UBICACIONES (Bodega / Exhibición; ampliable)
-- ------------------------------------------------------------
create table if not exists nativo.inventario_ubicaciones (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
insert into nativo.inventario_ubicaciones (nombre) values ('Bodega'), ('Exhibición')
on conflict do nothing;

-- ------------------------------------------------------------
-- EXISTENCIAS físicas (una fila por producto + ubicación).
-- Nunca negativas (decisión de negocio: sin inventario negativo).
-- ------------------------------------------------------------
create table if not exists nativo.inventario_existencias (
  id bigint generated always as identity primary key,
  producto_id bigint not null references nativo.productos (id) on delete cascade,
  ubicacion_id bigint not null references nativo.inventario_ubicaciones (id),
  cantidad numeric not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  unique (producto_id, ubicacion_id)
);
create index if not exists idx_existencias_producto on nativo.inventario_existencias (producto_id);

-- ------------------------------------------------------------
-- KARDEX (inventario_movimientos): nunca se borra. FKs blandas
-- + texto copiado (mismo criterio que devoluciones_detalle).
-- cantidad SIEMPRE con signo (+entra / −sale); en 'ajuste' es la
-- diferencia. saldo_despues = stock TOTAL del producto (todas las
-- ubicaciones) tras el movimiento.
-- ------------------------------------------------------------
create table if not exists nativo.inventario_movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in (
    'inventario_inicial', 'entrada', 'devolucion', 'salida', 'venta',
    'traslado_salida', 'traslado_entrada', 'ajuste')),
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  ubicacion text,
  cantidad numeric not null,
  costo_unitario numeric,
  saldo_despues numeric not null,
  referencia text,
  venta_id bigint references nativo.ventas (id) on delete set null,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  numero_factura text,
  lote text,
  motivo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_inv_mov_producto on nativo.inventario_movimientos (producto_id, fecha);
create index if not exists idx_inv_mov_tipo on nativo.inventario_movimientos (tipo);
create index if not exists idx_inv_mov_fecha on nativo.inventario_movimientos (fecha);
create index if not exists idx_inv_mov_venta on nativo.inventario_movimientos (venta_id);

-- ------------------------------------------------------------
-- RESERVAS (stock comprometido por ventas; usadas desde Fase 4).
-- NO dependen de ventas_detalle.id (esos ids cambian en cada
-- edición de venta). cantidad_pendiente = parte sin respaldo
-- físico ("pendiente por surtir" de venta sin inventario).
-- Disponible(producto) = Σ existencias − Σ (cantidad − pendiente)
-- de reservas Activas.
-- ------------------------------------------------------------
create table if not exists nativo.inventario_reservas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  ticket integer not null,
  producto_id bigint not null references nativo.productos (id),
  producto text not null,
  cantidad numeric not null check (cantidad > 0),
  cantidad_pendiente numeric not null default 0 check (cantidad_pendiente >= 0),
  estado text not null default 'Activa' check (estado in ('Activa', 'Despachada', 'Cancelada')),
  fecha_surtido timestamptz,
  fecha_despacho timestamptz,
  usuario text,
  creado_en timestamptz not null default now(),
  check (cantidad_pendiente <= cantidad)
);
create index if not exists idx_reservas_venta on nativo.inventario_reservas (venta_id);
create index if not exists idx_reservas_producto_estado on nativo.inventario_reservas (producto_id, estado);
create index if not exists idx_reservas_pendientes on nativo.inventario_reservas (producto_id, creado_en)
  where estado = 'Activa' and cantidad_pendiente > 0;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: ingresar inventario (entrada / inventario inicial /
-- devolución) con recálculo de costo promedio ponderado, atómico.
-- p_costo_unitario null = entra al costo promedio actual sin
-- alterarlo (ej. devoluciones).
-- ------------------------------------------------------------
create or replace function nativo.ingresar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_costo_unitario numeric default null,
  p_tipo text default 'entrada',
  p_referencia text default null,
  p_proveedor_id bigint default null,
  p_numero_factura text default null,
  p_lote text default null,
  p_motivo text default null,
  p_usuario text default null,
  p_venta_id bigint default null,
  p_fecha timestamptz default now()
) returns nativo.productos
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_stock_total numeric;
  v_costo numeric;
  v_nuevo_costo numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_tipo not in ('entrada', 'inventario_inicial', 'devolucion') then
    raise exception 'Tipo de ingreso inválido: %', p_tipo;
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;
  if prod.es_servicio then
    raise exception 'El producto "%" es un servicio: no maneja inventario', prod.nombre;
  end if;
  if not prod.controla_inventario then
    raise exception 'El producto "%" no controla inventario; actívalo en el catálogo primero', prod.nombre;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  -- Costo promedio ponderado
  v_costo := coalesce(p_costo_unitario, prod.costo_promedio);
  if v_stock_total + p_cantidad > 0 then
    v_nuevo_costo := round(
      (v_stock_total * prod.costo_promedio + p_cantidad * v_costo)
      / (v_stock_total + p_cantidad), 4);
  else
    v_nuevo_costo := v_costo;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  update nativo.productos
  set costo_promedio = v_nuevo_costo,
      precio_compra = case when p_costo_unitario is not null and p_tipo in ('entrada', 'inventario_inicial')
                           then p_costo_unitario else precio_compra end
  where id = p_producto_id
  returning * into prod;

  insert into nativo.inventario_movimientos
    (fecha, tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
     saldo_despues, referencia, venta_id, proveedor_id, numero_factura, lote, motivo, usuario)
  values (coalesce(p_fecha, now()), p_tipo, prod.id,
          coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, p_cantidad, v_costo,
          v_stock_total + p_cantidad, p_referencia, p_venta_id, p_proveedor_id,
          p_numero_factura, p_lote, p_motivo, p_usuario);

  return prod;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: traslado entre ubicaciones (dos asientos kardex).
-- El costo promedio y el stock total no cambian.
-- ------------------------------------------------------------
create or replace function nativo.trasladar_inventario(
  p_producto_id bigint,
  p_origen_id bigint,
  p_destino_id bigint,
  p_cantidad numeric,
  p_motivo text default null,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_origen text; v_destino text;
  v_en_origen numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'La ubicación origen y destino deben ser distintas';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_origen from nativo.inventario_ubicaciones where id = p_origen_id;
  select nombre into v_destino from nativo.inventario_ubicaciones where id = p_destino_id;
  if v_origen is null or v_destino is null then
    raise exception 'Ubicación origen o destino no encontrada';
  end if;

  select coalesce(cantidad, 0) into v_en_origen
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;
  if coalesce(v_en_origen, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas trasladar %', v_origen, coalesce(v_en_origen, 0), p_cantidad;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_destino_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values
    ('traslado_salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_origen_id, v_origen, -p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario),
    ('traslado_entrada', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_destino_id, v_destino, p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: ajuste puntual (conteo físico de un producto en
-- una ubicación). Deja la existencia = cantidad física y registra
-- la DIFERENCIA (con signo) en el kardex. No cambia el costo.
-- ------------------------------------------------------------
create or replace function nativo.ajustar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad_fisica numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns numeric
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_actual numeric;
  v_diferencia numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad_fisica, -1) < 0 then
    raise exception 'La cantidad física no puede ser negativa';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_actual
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  v_actual := coalesce(v_actual, 0);

  v_diferencia := p_cantidad_fisica - v_actual;
  if v_diferencia = 0 then
    raise exception 'No hay diferencia que ajustar: el sistema ya registra % en %', v_actual, v_ubicacion;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad_fisica, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = excluded.cantidad, actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('ajuste', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, v_diferencia, prod.costo_promedio, v_stock_total,
          p_referencia, p_motivo, p_usuario);

  return v_diferencia;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: salida manual (bajas, muestras, obsequios).
-- Valida stock físico en la ubicación y que la salida no rompa
-- las reservas respaldadas por stock.
-- ------------------------------------------------------------
create or replace function nativo.salida_manual_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_en_ubicacion numeric;
  v_stock_total numeric;
  v_respaldado numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_en_ubicacion
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  if coalesce(v_en_ubicacion, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas sacar %', v_ubicacion, coalesce(v_en_ubicacion, 0), p_cantidad;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;
  select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_respaldado
  from nativo.inventario_reservas
  where producto_id = p_producto_id and estado = 'Activa';

  if v_stock_total - p_cantidad < v_respaldado then
    raise exception 'No puedes sacar % unidades: hay % reservadas para ventas pendientes de despacho', p_cantidad, v_respaldado;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, -p_cantidad, prod.costo_promedio, v_stock_total - p_cantidad,
          p_referencia, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- USUARIOS: nuevo permiso "inventario" en el default de permisos
-- (no se backfillean filas existentes, mismo criterio de siempre)
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false}'::jsonb;

-- ------------------------------------------------------------
-- Semillas de listas maestras del inventario
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_producto', 'Camisetas'),
  ('categoria_producto', 'Camisas'),
  ('categoria_producto', 'Jeans'),
  ('categoria_producto', 'Gorras'),
  ('categoria_producto', 'Buff'),
  ('categoria_producto', 'Telas'),
  ('categoria_producto', 'Botones'),
  ('categoria_producto', 'Insumos'),
  ('categoria_producto', 'Empaques'),
  ('categoria_producto', 'Servicios'),
  ('tipo_manga', 'Manga corta'),
  ('tipo_manga', 'Manga larga'),
  ('tipo_manga', 'Sin manga'),
  ('motivo_ajuste', 'Conteo físico'),
  ('motivo_ajuste', 'Producto dañado'),
  ('motivo_ajuste', 'Pérdida/Robo'),
  ('motivo_ajuste', 'Error de registro'),
  ('motivo_ajuste', 'Otro'),
  ('motivo_traslado', 'Reposición exhibición'),
  ('motivo_traslado', 'Reorganización'),
  ('motivo_traslado', 'Otro')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
