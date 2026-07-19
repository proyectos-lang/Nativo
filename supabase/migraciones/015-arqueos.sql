-- ============================================================
-- Migración 015: Arqueos de inventario (conteos físicos) con
-- cuadre automático autorizado por gerencia (PIN).
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- ARQUEOS (sesión de conteo físico; total, por categoría o por
-- ubicación — conteos cíclicos)
-- ------------------------------------------------------------
create table if not exists nativo.arqueos (
  id bigint generated always as identity primary key,
  numero integer not null unique,
  fecha_inicio timestamptz not null default now(),
  fecha_cierre timestamptz,
  estado text not null default 'Abierto' check (estado in ('Abierto', 'Cerrado', 'Anulado')),
  categoria text,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  observaciones text,
  usuario_abre text,
  usuario_cierra text,
  creado_en timestamptz not null default now()
);

create table if not exists nativo.arqueos_detalle (
  id bigint generated always as identity primary key,
  arqueo_id bigint not null references nativo.arqueos (id) on delete cascade,
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  ubicacion text,
  cantidad_sistema numeric not null default 0,
  cantidad_fisica numeric,
  diferencia numeric,
  costo_unitario numeric not null default 0,
  contado_en timestamptz,
  usuario text,
  unique (arqueo_id, producto_id, ubicacion_id)
);
create index if not exists idx_arqueos_detalle_arqueo on nativo.arqueos_detalle (arqueo_id);

alter table nativo.inventario_movimientos
  add column if not exists arqueo_id bigint references nativo.arqueos (id) on delete set null;

alter table nativo.configuracion_sistema
  add column if not exists frecuencia_conteo text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_frecuencia_conteo_check') then
    alter table nativo.configuracion_sistema add constraint configuracion_frecuencia_conteo_check
      check (frecuencia_conteo is null or frecuencia_conteo in ('Mensual', 'Trimestral', 'Semestral', 'Anual'));
  end if;
end
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: cerrar un arqueo aplicando el cuadre masivo, atómico.
-- Aplica el DELTA de cada diferencia (no el absoluto — tolera
-- movimientos ocurridos después del conteo). Si un delta negativo
-- dejaría una existencia bajo cero, TODO el cierre se revierte
-- (el check de existencias lo impide) — nunca se cuadra a ciegas.
-- El PIN de gerencia se valida en la server action antes de llamar.
-- ------------------------------------------------------------
create or replace function nativo.cerrar_arqueo(
  p_arqueo_id bigint,
  p_usuario text default null
) returns table (ajustados integer, valor_diferencia numeric)
language plpgsql
as $$
declare
  a nativo.arqueos;
  d record;
  v_ajustados integer := 0;
  v_valor numeric := 0;
  v_saldo numeric;
begin
  select * into a from nativo.arqueos where id = p_arqueo_id for update;
  if not found then
    raise exception 'Arqueo % no encontrado', p_arqueo_id;
  end if;
  if a.estado <> 'Abierto' then
    raise exception 'El arqueo #% ya está %', a.numero, a.estado;
  end if;

  for d in select ad.* from nativo.arqueos_detalle ad
           where ad.arqueo_id = p_arqueo_id
             and ad.cantidad_fisica is not null
             and ad.diferencia is not null and ad.diferencia <> 0
           order by ad.producto_id
  loop
    if d.producto_id is null or d.ubicacion_id is null then continue; end if;
    perform 1 from nativo.productos where id = d.producto_id for update;

    insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
    values (d.producto_id, d.ubicacion_id, d.diferencia, now())
    on conflict (producto_id, ubicacion_id)
    do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                  actualizado_en = now();

    select coalesce(sum(cantidad), 0) into v_saldo
      from nativo.inventario_existencias where producto_id = d.producto_id;

    insert into nativo.inventario_movimientos
      (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
       saldo_despues, referencia, motivo, usuario, arqueo_id)
    values ('ajuste', d.producto_id, d.producto, d.ubicacion_id, d.ubicacion, d.diferencia,
            d.costo_unitario, v_saldo, 'Arqueo #' || a.numero, 'Cuadre de conteo físico',
            p_usuario, p_arqueo_id);

    v_ajustados := v_ajustados + 1;
    v_valor := v_valor + d.diferencia * d.costo_unitario;
  end loop;

  update nativo.arqueos
  set estado = 'Cerrado', fecha_cierre = now(), usuario_cierra = p_usuario
  where id = p_arqueo_id;

  return query select v_ajustados, v_valor;
end;
$$;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
