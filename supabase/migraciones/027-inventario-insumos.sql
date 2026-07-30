-- ============================================================
-- Migración 027: Inventario de Insumos (parte del módulo Costos y Recetas).
-- Los insumos (telas, hilos, botones, empaque, mano de obra) NO son
-- productos de venta: viven en su propia tabla para no aparecer en los
-- selectores de Ventas, que listan todo el catálogo de `productos`.
-- Llevan existencia y movimientos propios; la entrada recalcula el
-- costo promedio ponderado, y ese costo es el que alimenta las recetas.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- Maestro de insumos (ficha de costo + saldo)
-- ------------------------------------------------------------
create table if not exists nativo.insumos (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  codigo text,
  categoria text,
  unidad_medida text not null default 'Unidad',
  -- Costo promedio ponderado: lo recalcula mover_insumo en cada entrada.
  -- Es el costo que usan las recetas.
  costo_unitario numeric not null default 0,
  ultimo_costo numeric not null default 0,
  existencia numeric not null default 0 check (existencia >= 0),
  stock_minimo numeric not null default 0,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  proveedor text,
  notas text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists idx_insumos_codigo on nativo.insumos (codigo) where codigo is not null;
create index if not exists idx_insumos_categoria on nativo.insumos (categoria);
create index if not exists idx_insumos_activo on nativo.insumos (activo);

-- ------------------------------------------------------------
-- Movimientos de insumos. Nunca se borran (mismo criterio que el kardex
-- de productos): FK blanda + nombre copiado para que el historial
-- sobreviva a la eliminación del insumo.
-- ------------------------------------------------------------
create table if not exists nativo.insumos_movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  insumo_id bigint references nativo.insumos (id) on delete set null,
  insumo text not null,
  -- Siempre con signo (+entra / −sale); en 'ajuste' es la diferencia
  cantidad numeric not null,
  costo_unitario numeric,
  costo_total numeric,
  saldo_despues numeric not null,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  proveedor text,
  numero_factura text,
  referencia text,
  motivo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_insumos_mov_insumo on nativo.insumos_movimientos (insumo_id, fecha desc);
create index if not exists idx_insumos_mov_tipo on nativo.insumos_movimientos (tipo);
create index if not exists idx_insumos_mov_fecha on nativo.insumos_movimientos (fecha desc);

-- ------------------------------------------------------------
-- Las líneas de receta pueden apuntar a un insumo (además de poder
-- apuntar a un producto del catálogo, cuando el material sí es algo
-- que se compra terminado — una camiseta en blanco que luego se estampa).
-- ------------------------------------------------------------
alter table nativo.recetas_materiales
  add column if not exists insumo_id bigint references nativo.insumos (id) on delete set null;
create index if not exists idx_recetas_materiales_insumo on nativo.recetas_materiales (insumo_id);

-- ------------------------------------------------------------
-- RPC: movimiento de insumo atómico (existencia + costo promedio + kardex)
-- ------------------------------------------------------------
create or replace function nativo.mover_insumo(
  p_insumo_id bigint,
  p_tipo text,
  p_cantidad numeric,
  p_costo_unitario numeric default null,
  p_fecha timestamptz default now(),
  p_proveedor_id bigint default null,
  p_numero_factura text default null,
  p_referencia text default null,
  p_motivo text default null,
  p_usuario text default null
) returns nativo.insumos
language plpgsql
as $$
declare
  ins nativo.insumos;
  v_proveedor text;
  v_costo numeric;
  v_nuevo_costo numeric;
  v_delta numeric;      -- cambio de existencia, con signo
  v_saldo numeric;
begin
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;

  -- Lock del insumo: serializa los movimientos del mismo insumo
  select * into ins from nativo.insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo % no encontrado', p_insumo_id;
  end if;

  select nombre into v_proveedor from nativo.proveedores where id = p_proveedor_id;

  if p_tipo = 'entrada' then
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'La cantidad de la entrada debe ser mayor a cero';
    end if;
    v_delta := p_cantidad;
    -- Costo promedio ponderado. Sin costo explícito la mercancía entra al
    -- costo promedio actual sin alterarlo.
    v_costo := coalesce(p_costo_unitario, ins.costo_unitario);
    if ins.existencia + p_cantidad > 0 then
      v_nuevo_costo := round(
        (ins.existencia * ins.costo_unitario + p_cantidad * v_costo)
        / (ins.existencia + p_cantidad), 4);
    else
      v_nuevo_costo := v_costo;
    end if;

  elsif p_tipo = 'salida' then
    if coalesce(p_cantidad, 0) <= 0 then
      raise exception 'La cantidad de la salida debe ser mayor a cero';
    end if;
    if p_cantidad > ins.existencia then
      raise exception 'Existencia insuficiente de "%": hay % % y se intentan sacar %',
        ins.nombre, ins.existencia, ins.unidad_medida, p_cantidad;
    end if;
    v_delta := -p_cantidad;
    v_costo := ins.costo_unitario;   -- la salida se valoriza al costo actual
    v_nuevo_costo := ins.costo_unitario;

  else -- ajuste: p_cantidad es la existencia FÍSICA contada
    if coalesce(p_cantidad, -1) < 0 then
      raise exception 'La existencia física no puede ser negativa';
    end if;
    v_delta := p_cantidad - ins.existencia;
    if v_delta = 0 then
      raise exception 'La existencia ya es %: no hay diferencia por ajustar', p_cantidad;
    end if;
    v_costo := ins.costo_unitario;
    v_nuevo_costo := ins.costo_unitario;  -- un ajuste de conteo no cambia el costo
  end if;

  v_saldo := ins.existencia + v_delta;

  update nativo.insumos
  set existencia = v_saldo,
      costo_unitario = v_nuevo_costo,
      ultimo_costo = case when p_tipo = 'entrada' and p_costo_unitario is not null
                          then p_costo_unitario else ultimo_costo end,
      proveedor_id = coalesce(p_proveedor_id, proveedor_id),
      proveedor = coalesce(v_proveedor, proveedor),
      actualizado_en = now()
  where id = p_insumo_id
  returning * into ins;

  insert into nativo.insumos_movimientos
    (fecha, tipo, insumo_id, insumo, cantidad, costo_unitario, costo_total, saldo_despues,
     proveedor_id, proveedor, numero_factura, referencia, motivo, usuario)
  values (coalesce(p_fecha, now()), p_tipo, ins.id, ins.nombre, v_delta, v_costo,
          round(abs(v_delta) * coalesce(v_costo, 0), 2), v_saldo,
          p_proveedor_id, v_proveedor, p_numero_factura, p_referencia, p_motivo, p_usuario);

  return ins;
end;
$$;

-- ------------------------------------------------------------
-- Semillas: categorías de insumo
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_insumo', 'Telas'),
  ('categoria_insumo', 'Hilos'),
  ('categoria_insumo', 'Botones y cierres'),
  ('categoria_insumo', 'Etiquetas y marquillas'),
  ('categoria_insumo', 'Empaque'),
  ('categoria_insumo', 'Estampado'),
  ('categoria_insumo', 'Bordado'),
  ('categoria_insumo', 'Mano de obra'),
  ('categoria_insumo', 'Otros')
on conflict do nothing;

grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant execute on all functions in schema nativo to service_role;
