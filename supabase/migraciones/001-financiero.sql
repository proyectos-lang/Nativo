-- ============================================================
-- Migración 001: Módulo Financiero
-- Cuentas bancarias, movimientos, gastos/costos y pagos de gastos
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- CUENTAS BANCARIAS
-- El saldo actual NO se almacena: saldo_inicial + ingresos - egresos
-- ------------------------------------------------------------
create table nativo.cuentas_bancarias (
  id bigint generated always as identity primary key,
  nombre text not null,
  banco text,
  numero_cuenta text,
  saldo_inicial numeric not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- GASTOS Y COSTOS (causación; admite abonos parciales)
-- ------------------------------------------------------------
create table nativo.gastos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('Gasto', 'Costo')),
  categoria text,
  proveedor text,
  descripcion text,
  monto numeric not null default 0,
  abonado numeric not null default 0,
  saldo numeric not null default 0,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Abonado', 'Pagado')),
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_gastos_estado on nativo.gastos (estado);
create index idx_gastos_fecha on nativo.gastos (fecha);

-- ------------------------------------------------------------
-- PAGOS DE GASTOS (cada abono a un gasto sale de una cuenta)
-- ------------------------------------------------------------
create table nativo.pagos_gastos (
  id bigint generated always as identity primary key,
  gasto_id bigint not null references nativo.gastos (id) on delete cascade,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  monto numeric not null default 0,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_pagos_gastos_gasto on nativo.pagos_gastos (gasto_id);

-- ------------------------------------------------------------
-- MOVIMIENTOS BANCARIOS (libro de cada cuenta)
-- ------------------------------------------------------------
create table nativo.movimientos_bancarios (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  origen text not null default 'manual' check (origen in ('manual', 'pago_venta', 'pago_gasto', 'transferencia')),
  monto numeric not null check (monto > 0),
  concepto text,
  pago_id bigint references nativo.pagos (id) on delete set null,
  pago_gasto_id bigint references nativo.pagos_gastos (id) on delete set null,
  movimiento_relacionado_id bigint references nativo.movimientos_bancarios (id),
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_movimientos_cuenta on nativo.movimientos_bancarios (cuenta_id);
create index idx_movimientos_fecha on nativo.movimientos_bancarios (fecha);

-- ------------------------------------------------------------
-- PAGOS DE VENTAS: cuenta destino del abono
-- ------------------------------------------------------------
alter table nativo.pagos add column cuenta_id bigint references nativo.cuentas_bancarias (id);

-- ------------------------------------------------------------
-- USUARIOS: permiso nuevo "financiero" (apagado por defecto)
-- Los usuarios existentes no tienen la clave -> no ven el módulo.
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "configuracion": false, "financiero": false}'::jsonb;

-- ------------------------------------------------------------
-- RPC registrar_pago: ahora recibe la cuenta destino y genera
-- el movimiento bancario de ingreso por el abono.
-- ------------------------------------------------------------
drop function if exists nativo.registrar_pago(bigint, numeric, numeric, date, text, text);

create or replace function nativo.registrar_pago(
  p_venta_id bigint,
  p_abono numeric,
  p_retencion numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text,
  p_cuenta_id bigint default null
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_pago_id bigint;
  v_ticket integer;
begin
  insert into nativo.pagos (venta_id, fecha, abono, retencion, comentario, usuario, cuenta_id)
  values (p_venta_id, coalesce(p_fecha, current_date), coalesce(p_abono, 0), coalesce(p_retencion, 0), p_comentario, p_usuario, p_cuenta_id)
  returning id into v_pago_id;

  update nativo.ventas
  set abono = abono + coalesce(p_abono, 0),
      retencion = retencion + coalesce(p_retencion, 0),
      total_a_pagar = total_compra - (retencion + coalesce(p_retencion, 0)),
      saldo = (total_compra - (retencion + coalesce(p_retencion, 0))) - (abono + coalesce(p_abono, 0)),
      fecha_pago = coalesce(p_fecha, fecha_pago),
      estado_pago = case
        when (total_compra - (retencion + coalesce(p_retencion, 0))) - (abono + coalesce(p_abono, 0)) <= 0 then 'Pagado Total'
        else 'Abonado'
      end
  where id = p_venta_id
  returning * into v;

  if v.id is null then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  -- Asiento bancario: solo el abono entra a caja (la retención no es efectivo)
  if p_cuenta_id is not null and coalesce(p_abono, 0) > 0 then
    select ticket into v_ticket from nativo.ventas where id = p_venta_id;
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_id, usuario)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'ingreso', 'pago_venta', p_abono,
            'Pago venta ticket #' || v_ticket, v_pago_id, p_usuario);
  end if;

  return v;
end;
$$;

-- ------------------------------------------------------------
-- RPC pagar_gasto: abono a un gasto + egreso bancario, atómico
-- ------------------------------------------------------------
create or replace function nativo.pagar_gasto(
  p_gasto_id bigint,
  p_cuenta_id bigint,
  p_monto numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text
) returns nativo.gastos
language plpgsql
as $$
declare
  g nativo.gastos;
  v_pago_gasto_id bigint;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;
  if p_cuenta_id is null then
    raise exception 'Debe indicar la cuenta desde donde se paga';
  end if;

  insert into nativo.pagos_gastos (gasto_id, cuenta_id, fecha, monto, comentario, usuario)
  values (p_gasto_id, p_cuenta_id, coalesce(p_fecha, current_date), p_monto, p_comentario, p_usuario)
  returning id into v_pago_gasto_id;

  update nativo.gastos
  set abonado = abonado + p_monto,
      saldo = monto - (abonado + p_monto),
      estado = case when monto - (abonado + p_monto) <= 0 then 'Pagado' else 'Abonado' end
  where id = p_gasto_id
  returning * into g;

  if g.id is null then
    raise exception 'Gasto % no encontrado', p_gasto_id;
  end if;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_gasto_id, usuario)
  values (p_cuenta_id, coalesce(p_fecha, current_date), 'egreso', 'pago_gasto', p_monto,
          'Pago ' || lower(g.tipo) || ': ' || coalesce(g.descripcion, g.categoria, 'sin descripción'), v_pago_gasto_id, p_usuario);

  return g;
end;
$$;

-- ------------------------------------------------------------
-- RPC transferir_cuentas: dos asientos enlazados, atómico
-- ------------------------------------------------------------
create or replace function nativo.transferir_cuentas(
  p_origen bigint,
  p_destino bigint,
  p_monto numeric,
  p_fecha date,
  p_concepto text,
  p_usuario text
) returns void
language plpgsql
as $$
declare
  v_egreso_id bigint;
  v_ingreso_id bigint;
  v_nombre_origen text;
  v_nombre_destino text;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_origen = p_destino then
    raise exception 'La cuenta origen y destino deben ser distintas';
  end if;

  select nombre into v_nombre_origen from nativo.cuentas_bancarias where id = p_origen;
  select nombre into v_nombre_destino from nativo.cuentas_bancarias where id = p_destino;
  if v_nombre_origen is null or v_nombre_destino is null then
    raise exception 'Cuenta origen o destino no encontrada';
  end if;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, usuario)
  values (p_origen, coalesce(p_fecha, current_date), 'egreso', 'transferencia', p_monto,
          coalesce(p_concepto, '') || ' → ' || v_nombre_destino, p_usuario)
  returning id into v_egreso_id;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, movimiento_relacionado_id, usuario)
  values (p_destino, coalesce(p_fecha, current_date), 'ingreso', 'transferencia', p_monto,
          coalesce(p_concepto, '') || ' ← ' || v_nombre_origen, v_egreso_id, p_usuario)
  returning id into v_ingreso_id;

  update nativo.movimientos_bancarios set movimiento_relacionado_id = v_ingreso_id where id = v_egreso_id;
end;
$$;

-- ------------------------------------------------------------
-- Semillas: categorías de gastos
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Arriendo'),
  ('categoria_gasto', 'Nómina'),
  ('categoria_gasto', 'Servicios'),
  ('categoria_gasto', 'Materia Prima'),
  ('categoria_gasto', 'Transporte'),
  ('categoria_gasto', 'Publicidad'),
  ('categoria_gasto', 'Otros')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API (mismo criterio del esquema base)
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
