-- ============================================================
-- Migración 019: desglose de retenciones en pagos de ventas.
-- El campo genérico `pagos.retencion` se conserva como el TOTAL
-- del pago; se agregan Retefuente, ReteIVA y ReteICA como montos.
-- Las retenciones reducen el saldo de la factura pero NO son
-- efectivo (a la cuenta bancaria solo entra el abono).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.pagos add column if not exists retefuente numeric not null default 0;
alter table nativo.pagos add column if not exists reteiva numeric not null default 0;
alter table nativo.pagos add column if not exists reteica numeric not null default 0;

-- La firma del RPC cambia (params nuevos), así que se elimina la
-- versión anterior y se recrea (evita overloads ambiguos).
drop function if exists nativo.registrar_pago(bigint, numeric, numeric, date, text, text, bigint);

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
  v_ticket integer;
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

  -- Asiento bancario: solo el abono entra a caja (las retenciones no son efectivo)
  if p_cuenta_id is not null and coalesce(p_abono, 0) > 0 then
    select ticket into v_ticket from nativo.ventas where id = p_venta_id;
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_id, usuario)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'ingreso', 'pago_venta', p_abono,
            'Pago venta ticket #' || v_ticket, v_pago_id, p_usuario);
  end if;

  return v;
end;
$$;

grant all on all functions in schema nativo to service_role;
