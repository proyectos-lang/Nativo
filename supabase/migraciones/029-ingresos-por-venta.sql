-- ============================================================
-- Migración 029: Ingresos por Venta y conciliación por categorías.
--
-- La contadora concilia contra el extracto y no puede cuadrar línea
-- a línea: un cliente abona $1.000.000 para dos facturas, se
-- registran DOS pagos de $500.000, y el banco muestra UNA línea de
-- $1.000.000. La solución es cuadrar por TOTALES.
--
-- Para eso el libro de bancos debe tener una sola fuente. Se decide
-- que sea la contadora (Ingresos/Gastos), y que los pagos de ventas
-- dejen de generar asiento: son el registro operativo de la venta.
-- De hecho ya funcionaba así por omisión — 49 de 52 pagos se
-- registraron sin cuenta y nunca tocaron el banco.
--
-- `pagos.cuenta_id` SE CONSERVA: saber a qué cuenta entró la plata
-- es justo lo que la contadora necesita para saber qué extracto
-- mirar. Simplemente ya no crea movimiento.
--
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- Categoría del movimiento bancario. Sin ella, los movimientos
-- manuales quedaban fuera de la sumatoria por categoría y la
-- conciliación tendría huecos.
-- ------------------------------------------------------------
alter table nativo.movimientos_bancarios add column if not exists categoria text;
create index if not exists idx_movimientos_categoria on nativo.movimientos_bancarios (categoria);

-- ------------------------------------------------------------
-- registrar_pago SIN asiento bancario.
-- Firma idéntica a la de la migración 019 (p_cuenta_id se sigue
-- recibiendo y guardando en pagos.cuenta_id).
-- ------------------------------------------------------------
create or replace function nativo.registrar_pago(
  p_venta_id bigint,
  p_abono numeric,
  p_retencion numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text,
  p_cuenta_id bigint default null,
  p_retefuente numeric default 0,
  p_reteiva numeric default 0,
  p_reteica numeric default 0
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_pago_id bigint;
  v_ret_total numeric;
begin
  v_ret_total := coalesce(p_retencion, 0) + coalesce(p_retefuente, 0) + coalesce(p_reteiva, 0) + coalesce(p_reteica, 0);

  insert into nativo.pagos (venta_id, fecha, abono, retencion, retefuente, reteiva, reteica, comentario, usuario, cuenta_id)
  values (p_venta_id, coalesce(p_fecha, current_date), coalesce(p_abono, 0), v_ret_total,
          coalesce(p_retefuente, 0), coalesce(p_reteiva, 0), coalesce(p_reteica, 0), p_comentario, p_usuario, p_cuenta_id)
  returning id into v_pago_id;

  update nativo.ventas
  set abono = abono + coalesce(p_abono, 0),
      retencion = retencion + v_ret_total,
      total_a_pagar = total_compra - (retencion + v_ret_total),
      saldo = (total_compra - (retencion + v_ret_total)) - (abono + coalesce(p_abono, 0)),
      fecha_pago = coalesce(p_fecha, fecha_pago),
      estado_pago = case
        when (total_compra - (retencion + v_ret_total)) - (abono + coalesce(p_abono, 0)) <= 0 then 'Pagado Total'
        else 'Abonado'
      end
  where id = p_venta_id
  returning * into v;

  if v.id is null then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  -- Sin asiento bancario a propósito (migración 029): el banco lo lleva
  -- la contadora desde Ingresos, y duplicarlo aquí inflaría el saldo.
  -- El dinero recibido por ventas se consulta en Financiero → Ingresos por Venta.

  return v;
end;
$$;

-- ------------------------------------------------------------
-- editar_pago SIN re-crear el asiento. Se conserva el delete, así
-- editar un pago antiguo retira su asiento heredado en vez de
-- rehacerlo.
-- ------------------------------------------------------------
create or replace function nativo.editar_pago(
  p_pago_id bigint,
  p_abono numeric,
  p_retefuente numeric default 0,
  p_reteiva numeric default 0,
  p_reteica numeric default 0,
  p_fecha date default null,
  p_comentario text default null,
  p_cuenta_id bigint default null,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  pg nativo.pagos;
  v nativo.ventas;
  v_ret_nueva numeric;
  v_abono_total numeric;
  v_ret_total numeric;
  v_saldo numeric;
begin
  select * into pg from nativo.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago % no encontrado', p_pago_id;
  end if;

  v_ret_nueva := coalesce(p_retefuente, 0) + coalesce(p_reteiva, 0) + coalesce(p_reteica, 0);
  if coalesce(p_abono, 0) < 0 or v_ret_nueva < 0 then
    raise exception 'Los valores del pago no pueden ser negativos';
  end if;
  if coalesce(p_abono, 0) <= 0 and v_ret_nueva <= 0 then
    raise exception 'El pago debe tener un abono o alguna retención mayor a cero. Si deseas eliminarlo, usa Anular.';
  end if;

  select * into v from nativo.ventas where id = pg.venta_id for update;
  if not found then
    raise exception 'La venta del pago % no existe', p_pago_id;
  end if;

  v_abono_total := v.abono - pg.abono + coalesce(p_abono, 0);
  v_ret_total := v.retencion - pg.retencion + v_ret_nueva;
  if v_abono_total < 0 or v_ret_total < 0 then
    raise exception 'El cambio deja la venta con valores negativos; revisa el monto';
  end if;
  v_saldo := (v.total_compra - v_ret_total) - v_abono_total;

  update nativo.pagos
  set abono = coalesce(p_abono, 0),
      retencion = v_ret_nueva,
      retefuente = coalesce(p_retefuente, 0),
      reteiva = coalesce(p_reteiva, 0),
      reteica = coalesce(p_reteica, 0),
      fecha = coalesce(p_fecha, pg.fecha),
      comentario = coalesce(p_comentario, pg.comentario),
      cuenta_id = p_cuenta_id
  where id = p_pago_id;

  update nativo.ventas
  set abono = v_abono_total,
      retencion = v_ret_total,
      total_a_pagar = v.total_compra - v_ret_total,
      saldo = v_saldo,
      estado_pago = case
        when v_saldo <= 0 then 'Pagado Total'
        when v_abono_total > 0 or v_ret_total > 0 then 'Abonado'
        else 'Pendiente'
      end
  where id = v.id
  returning * into v;

  -- Retira el asiento heredado (anterior a la migración 029) y NO lo
  -- vuelve a crear: los pagos de ventas ya no tocan el banco.
  delete from nativo.movimientos_bancarios where pago_id = p_pago_id;

  return v;
end;
$$;

grant execute on all functions in schema nativo to service_role;
