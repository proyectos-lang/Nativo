-- ============================================================
-- Migración 028: borrado de movimientos financieros.
-- Hasta ahora nada en Financiero se podía deshacer: un pago mal
-- registrado, un gasto causado por error o una transferencia
-- equivocada quedaban para siempre descuadrando el banco.
--
-- Todo se hace por RPC porque son operaciones de varias tablas que
-- deben ser atómicas: el asiento bancario debe morir junto con el
-- pago, o el saldo de la cuenta queda mal. Ojo con
-- `movimientos_bancarios.pago_gasto_id/pago_ingreso_id`, que son
-- `on delete set null`: borrar el pago sin borrar el movimiento
-- deja un asiento huérfano que sigue sumando en la cuenta.
--
-- El borrado es real; la trazabilidad la da `bitacora`, que guarda
-- copia completa de lo borrado (lo escribe la server action).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- Anular un PAGO de gasto: borra el asiento bancario y el pago, y
-- recalcula el gasto desde los pagos que queden.
-- ------------------------------------------------------------
create or replace function nativo.anular_pago_gasto(
  p_pago_id bigint,
  p_usuario text default null
) returns nativo.gastos
language plpgsql
as $$
declare
  v_gasto_id bigint;
  g nativo.gastos;
  v_abonado numeric;
  v_saldo numeric;
begin
  select gasto_id into v_gasto_id from nativo.pagos_gastos where id = p_pago_id;
  if v_gasto_id is null then
    raise exception 'El pago % no existe', p_pago_id;
  end if;

  -- Lock del gasto: serializa contra otros pagos/anulaciones del mismo gasto
  select * into g from nativo.gastos where id = v_gasto_id for update;

  -- Primero el asiento bancario (la FK es set null: si se borrara el pago
  -- antes, el movimiento quedaría huérfano sumando en la cuenta)
  delete from nativo.movimientos_bancarios where pago_gasto_id = p_pago_id;
  delete from nativo.pagos_gastos where id = p_pago_id;

  select coalesce(sum(monto), 0) into v_abonado
  from nativo.pagos_gastos where gasto_id = v_gasto_id;
  v_saldo := g.monto - v_abonado;

  update nativo.gastos
  set abonado = v_abonado,
      saldo = v_saldo,
      estado = case when v_saldo <= 0 and g.monto > 0 then 'Pagado'
                    when v_abonado > 0 then 'Abonado'
                    else 'Pendiente' end
  where id = v_gasto_id
  returning * into g;

  return g;
end;
$$;

-- ------------------------------------------------------------
-- Anular un COBRO de ingreso (espejo exacto del anterior).
-- ------------------------------------------------------------
create or replace function nativo.anular_cobro_ingreso(
  p_pago_id bigint,
  p_usuario text default null
) returns nativo.ingresos
language plpgsql
as $$
declare
  v_ingreso_id bigint;
  i nativo.ingresos;
  v_cobrado numeric;
  v_saldo numeric;
begin
  select ingreso_id into v_ingreso_id from nativo.pagos_ingresos where id = p_pago_id;
  if v_ingreso_id is null then
    raise exception 'El cobro % no existe', p_pago_id;
  end if;

  select * into i from nativo.ingresos where id = v_ingreso_id for update;

  delete from nativo.movimientos_bancarios where pago_ingreso_id = p_pago_id;
  delete from nativo.pagos_ingresos where id = p_pago_id;

  select coalesce(sum(monto), 0) into v_cobrado
  from nativo.pagos_ingresos where ingreso_id = v_ingreso_id;
  v_saldo := i.monto - v_cobrado;

  update nativo.ingresos
  set cobrado = v_cobrado,
      saldo = v_saldo,
      estado = case when v_saldo <= 0 and i.monto > 0 then 'Cobrado'
                    when v_cobrado > 0 then 'Abonado'
                    else 'Pendiente' end
  where id = v_ingreso_id
  returning * into i;

  return i;
end;
$$;

-- ------------------------------------------------------------
-- Eliminar un GASTO completo con sus pagos, asientos y detalle.
-- Se BLOQUEA si el gasto nació de recibir una orden de compra: ese
-- gasto es la cuenta por pagar de mercancía que YA entró al
-- inventario, y borrarlo haría aparecer el inventario como gratis.
-- ------------------------------------------------------------
create or replace function nativo.eliminar_gasto(
  p_gasto_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  g nativo.gastos;
  v_oc text;
begin
  select * into g from nativo.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'El gasto % no existe', p_gasto_id;
  end if;

  select string_agg('OC #' || numero::text, ', ') into v_oc
  from nativo.ordenes_compra where gasto_id = p_gasto_id;
  if v_oc is not null then
    raise exception 'Este gasto es la cuenta por pagar de % y no se puede eliminar: la mercancía ya entró al inventario. Reversa la recepción de la orden.', v_oc;
  end if;

  -- Los asientos bancarios primero (FK set null hacia pagos_gastos)
  delete from nativo.movimientos_bancarios
  where pago_gasto_id in (select id from nativo.pagos_gastos where gasto_id = p_gasto_id);

  -- pagos_gastos y gastos_detalle caen por cascade
  delete from nativo.gastos where id = p_gasto_id;
end;
$$;

-- ------------------------------------------------------------
-- Eliminar un INGRESO completo (espejo del anterior).
-- ------------------------------------------------------------
create or replace function nativo.eliminar_ingreso(
  p_ingreso_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  i nativo.ingresos;
begin
  select * into i from nativo.ingresos where id = p_ingreso_id for update;
  if not found then
    raise exception 'El ingreso % no existe', p_ingreso_id;
  end if;

  delete from nativo.movimientos_bancarios
  where pago_ingreso_id in (select id from nativo.pagos_ingresos where ingreso_id = p_ingreso_id);

  delete from nativo.ingresos where id = p_ingreso_id;
end;
$$;

-- ------------------------------------------------------------
-- Eliminar un movimiento bancario MANUAL o una TRANSFERENCIA.
-- Los movimientos que nacen de un pago no se borran por aquí: hay
-- que anular el pago, para que el gasto/ingreso/venta se recalcule.
-- En una transferencia se borran los DOS asientos: dejar uno solo
-- descuadraría las dos cuentas a la vez.
-- ------------------------------------------------------------
create or replace function nativo.eliminar_movimiento_manual(
  p_movimiento_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  m nativo.movimientos_bancarios;
  v_pareja bigint;
begin
  select * into m from nativo.movimientos_bancarios where id = p_movimiento_id for update;
  if not found then
    raise exception 'El movimiento % no existe', p_movimiento_id;
  end if;

  if m.origen not in ('manual', 'transferencia') then
    raise exception 'Este movimiento viene de un % y no se borra directamente: anula el pago correspondiente.', m.origen;
  end if;

  v_pareja := m.movimiento_relacionado_id;

  -- `movimiento_relacionado_id` no tiene cascade: hay que romper el enlace en
  -- ambos sentidos antes de borrar, o la FK bloquea el delete.
  update nativo.movimientos_bancarios set movimiento_relacionado_id = null
  where id in (p_movimiento_id, coalesce(v_pareja, -1))
     or movimiento_relacionado_id in (p_movimiento_id, coalesce(v_pareja, -1));

  delete from nativo.movimientos_bancarios where id = p_movimiento_id;
  if v_pareja is not null then
    delete from nativo.movimientos_bancarios where id = v_pareja;
  end if;
end;
$$;

grant execute on all functions in schema nativo to service_role;
