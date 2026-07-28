-- ============================================================
-- Migración 022: vincular los movimientos bancarios con la venta.
-- Los reembolsos por devolución solo guardaban el ticket dentro del
-- texto del concepto, así que no se podía mostrar el cliente en el
-- extracto de la cuenta. Ahora se guarda `venta_id` y además se
-- rellena hacia atrás leyendo el ticket del concepto.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.movimientos_bancarios
  add column if not exists venta_id bigint references nativo.ventas (id) on delete set null;
create index if not exists idx_movimientos_venta on nativo.movimientos_bancarios (venta_id);

-- ------------------------------------------------------------
-- RPC registrar_devolucion_perdida: idéntica salvo que el asiento
-- del reembolso ahora guarda venta_id.
-- ------------------------------------------------------------
create or replace function nativo.registrar_devolucion_perdida(
  p_devolucion_detalle_id bigint,
  p_valor_perdido numeric,
  p_cuenta_id bigint default null,
  p_fecha date default current_date,
  p_comentario text default null,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_venta_id bigint;
  v_estado_anterior text;
  v_nuevo_total numeric;
  v_nuevo_total_a_pagar numeric;
  v_nuevo_saldo numeric;
  v_reembolso numeric;
  v_ticket integer;
begin
  if coalesce(p_valor_perdido, 0) <= 0 then
    raise exception 'El valor perdido debe ser mayor a cero';
  end if;

  select d.estado, dv.venta_id into v_estado_anterior, v_venta_id
  from nativo.devoluciones_detalle d
  join nativo.devoluciones dv on dv.id = d.devolucion_id
  where d.id = p_devolucion_detalle_id;

  if v_venta_id is null then
    raise exception 'Detalle de devolución % no encontrado', p_devolucion_detalle_id;
  end if;
  if v_estado_anterior in ('Recuperada', 'Perdida') then
    raise exception 'Esta prenda ya fue resuelta (%)', v_estado_anterior;
  end if;

  select * into v from nativo.ventas where id = v_venta_id;

  v_nuevo_total := greatest(v.total_compra - p_valor_perdido, 0);
  v_nuevo_total_a_pagar := v_nuevo_total - v.retencion;
  v_nuevo_saldo := v_nuevo_total_a_pagar - v.abono;

  if v_nuevo_saldo < 0 then
    v_reembolso := -v_nuevo_saldo;
    if p_cuenta_id is null then
      raise exception 'Esta pérdida deja un saldo a favor del cliente de %; selecciona una cuenta para el reembolso.', v_reembolso;
    end if;

    update nativo.ventas
    set total_compra = v_nuevo_total, total_a_pagar = v_nuevo_total_a_pagar,
        abono = v.abono - v_reembolso, saldo = 0, estado_pago = 'Pagado Total'
    where id = v_venta_id
    returning * into v;

    select ticket into v_ticket from nativo.ventas where id = v_venta_id;
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, usuario, venta_id)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'egreso', 'devolucion_venta', v_reembolso,
            'Reembolso por devolución - ticket #' || v_ticket, p_usuario, v_venta_id);
  else
    update nativo.ventas
    set total_compra = v_nuevo_total, total_a_pagar = v_nuevo_total_a_pagar, saldo = v_nuevo_saldo,
        estado_pago = case
          when v_nuevo_saldo <= 0 and v_nuevo_total > 0 then 'Pagado Total'
          when v.abono > 0 then 'Abonado'
          else 'Pendiente'
        end
    where id = v_venta_id
    returning * into v;
  end if;

  update nativo.devoluciones_detalle set estado = 'Perdida', valor_perdido = p_valor_perdido
  where id = p_devolucion_detalle_id;

  insert into nativo.devoluciones_historial (devolucion_detalle_id, estado_anterior, estado_nuevo, comentario, usuario)
  values (p_devolucion_detalle_id, v_estado_anterior, 'Perdida', p_comentario, p_usuario);

  return v;
end;
$$;

-- ------------------------------------------------------------
-- Backfill: reembolsos ya registrados, tomando el ticket del concepto
-- ('Reembolso por devolución - ticket #123').
-- ------------------------------------------------------------
update nativo.movimientos_bancarios m
set venta_id = v.id
from nativo.ventas v
where m.origen = 'devolucion_venta'
  and m.venta_id is null
  and m.concepto ~ 'ticket #[0-9]+'
  and v.ticket = (substring(m.concepto from 'ticket #([0-9]+)'))::integer;

grant all on all tables in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
