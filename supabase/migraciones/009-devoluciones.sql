-- ============================================================
-- Migración 009: Módulo de Devoluciones — control de reprocesos,
-- recuperación/pérdida de prendas, impacto en venta y en Financiero.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- DEVOLUCIONES (cabecera, amarrada al ticket de venta)
-- ------------------------------------------------------------
create table if not exists nativo.devoluciones (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id),
  fecha date not null default current_date,
  usuario text,
  comentario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_devoluciones_venta on nativo.devoluciones (venta_id);

-- ------------------------------------------------------------
-- DEVOLUCIONES_DETALLE (una fila por prenda/línea devuelta).
-- No depende de una FK dura hacia ventas_detalle para sus datos de
-- negocio: copia producto/talla/color/valor_unitario al crearse,
-- porque actualizarVenta() borra y reinserta TODAS las líneas de
-- ventas_detalle al editar una venta (no hace diff). ventas_detalle_id
-- queda como referencia blanda (on delete set null), solo para
-- trazabilidad/navegación en la UI.
-- ------------------------------------------------------------
create table if not exists nativo.devoluciones_detalle (
  id bigint generated always as identity primary key,
  devolucion_id bigint not null references nativo.devoluciones (id) on delete cascade,
  ventas_detalle_id bigint references nativo.ventas_detalle (id) on delete set null,
  producto text not null,
  talla text,
  color text,
  valor_unitario numeric not null default 0,
  cantidad_devuelta numeric not null default 1,
  causal text,
  recuperable boolean not null default true,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En Reproceso', 'Recuperada', 'Perdida')),
  costo_recuperacion numeric,
  valor_perdido numeric,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists idx_devoluciones_detalle_devolucion on nativo.devoluciones_detalle (devolucion_id);
create index if not exists idx_devoluciones_detalle_estado on nativo.devoluciones_detalle (estado);

-- ------------------------------------------------------------
-- DEVOLUCIONES_HISTORIAL (historial de estados / reprocesos,
-- análogo a historial_entregas)
-- ------------------------------------------------------------
create table if not exists nativo.devoluciones_historial (
  id bigint generated always as identity primary key,
  devolucion_detalle_id bigint not null references nativo.devoluciones_detalle (id) on delete cascade,
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  usuario text
);
create index if not exists idx_devoluciones_historial_detalle on nativo.devoluciones_historial (devolucion_detalle_id);

-- ------------------------------------------------------------
-- MOVIMIENTOS_BANCARIOS: nuevo origen 'devolucion_venta'
-- (mismo patrón que la migración 003 con 'pago_ingreso')
-- ------------------------------------------------------------
alter table nativo.movimientos_bancarios drop constraint if exists movimientos_bancarios_origen_check;
alter table nativo.movimientos_bancarios add constraint movimientos_bancarios_origen_check
  check (origen in ('manual', 'pago_venta', 'pago_gasto', 'transferencia', 'pago_ingreso', 'devolucion_venta'));

-- ------------------------------------------------------------
-- FUNCIÓN RPC: registrar la pérdida de una prenda devuelta, de forma
-- atómica. Resta el valor a la venta, recalcula estado_pago con la
-- MISMA regla que actualizarVenta() en ventas/acciones.ts, y si el
-- saldo queda negativo (el cliente ya había pagado de más), genera
-- el reembolso bancario y ajusta el abono para que la contabilidad
-- cuadre. Además actualiza devoluciones_detalle e inserta el
-- historial, todo en la misma transacción (mismo patrón que
-- actualizar_entrega).
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
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, usuario)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'egreso', 'devolucion_venta', v_reembolso,
            'Reembolso por devolución - ticket #' || v_ticket, p_usuario);
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
-- USUARIOS: nuevo permiso "devoluciones" en el default de permisos
-- (no se backfillean filas existentes, mismo criterio de siempre)
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false}'::jsonb;

-- ------------------------------------------------------------
-- Semillas: causales de devolución y categoría de gasto "Reproceso"
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('causal_devolucion', 'Talla incorrecta'),
  ('causal_devolucion', 'Color incorrecto'),
  ('causal_devolucion', 'Defecto de bordado'),
  ('causal_devolucion', 'Defecto de estampado'),
  ('causal_devolucion', 'Producto dañado'),
  ('causal_devolucion', 'Cambio de decisión del cliente'),
  ('causal_devolucion', 'Otro')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Reproceso')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
