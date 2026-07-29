-- ============================================================
-- Migración 023: editar y anular abonos de facturas.
-- Ambas operaciones son atómicas: corrigen la cabecera de la venta
-- (abono, retención, total a pagar, saldo y estado) y rehacen o
-- eliminan el asiento bancario del pago. En la app quedan
-- protegidas con la clave de autorización (gerencia).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- editar_pago: reemplaza los valores de un abono ya registrado.
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

  -- Se descuenta lo que aportaba el pago anterior y se suma lo nuevo
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

  -- El asiento bancario se rehace con los datos nuevos (la retención no es efectivo)
  delete from nativo.movimientos_bancarios where pago_id = p_pago_id;
  if p_cuenta_id is not null and coalesce(p_abono, 0) > 0 then
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_id, usuario)
    values (p_cuenta_id, coalesce(p_fecha, pg.fecha), 'ingreso', 'pago_venta', p_abono,
            'Pago venta ticket #' || v.ticket || ' (editado)', p_pago_id, p_usuario);
  end if;

  return v;
end;
$$;

-- ------------------------------------------------------------
-- anular_pago: elimina el abono y revierte su efecto en la venta.
-- El asiento bancario se borra en cascada (movimientos_bancarios
-- .pago_id tiene on delete cascade).
-- ------------------------------------------------------------
create or replace function nativo.anular_pago(
  p_pago_id bigint,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  pg nativo.pagos;
  v nativo.ventas;
  v_abono_total numeric;
  v_ret_total numeric;
  v_saldo numeric;
begin
  select * into pg from nativo.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago % no encontrado', p_pago_id;
  end if;

  select * into v from nativo.ventas where id = pg.venta_id for update;
  if not found then
    raise exception 'La venta del pago % no existe', p_pago_id;
  end if;

  v_abono_total := greatest(v.abono - pg.abono, 0);
  v_ret_total := greatest(v.retencion - pg.retencion, 0);
  v_saldo := (v.total_compra - v_ret_total) - v_abono_total;

  delete from nativo.pagos where id = p_pago_id;

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

  return v;
end;
$$;

grant all on all functions in schema nativo to service_role;
