-- ============================================================
-- Migración 013: Módulo de Compras — órdenes de compra que
-- alimentan el inventario y generan automáticamente el Gasto
-- (cuenta por pagar) en Financiero al recibirse.
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- ÓRDENES DE COMPRA (cabecera)
-- ------------------------------------------------------------
create table if not exists nativo.ordenes_compra (
  id bigint generated always as identity primary key,
  numero integer not null unique,
  fecha date not null default current_date,
  proveedor_id bigint references nativo.proveedores (id),
  proveedor text,
  estado text not null default 'Borrador'
    check (estado in ('Borrador', 'Enviada', 'Recibida Parcial', 'Recibida', 'Anulada')),
  fecha_esperada date,
  observaciones text,
  total numeric not null default 0,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_oc_estado on nativo.ordenes_compra (estado);
create index if not exists idx_oc_proveedor on nativo.ordenes_compra (proveedor_id);
create index if not exists idx_oc_fecha on nativo.ordenes_compra (fecha);

-- ------------------------------------------------------------
-- ÓRDENES DE COMPRA — DETALLE (líneas de producto)
-- ------------------------------------------------------------
create table if not exists nativo.ordenes_compra_detalle (
  id bigint generated always as identity primary key,
  orden_compra_id bigint not null references nativo.ordenes_compra (id) on delete cascade,
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  cantidad_recibida numeric not null default 0 check (cantidad_recibida >= 0),
  creado_en timestamptz not null default now()
);
create index if not exists idx_ocd_orden on nativo.ordenes_compra_detalle (orden_compra_id);

-- ------------------------------------------------------------
-- FUNCIÓN RPC: recibir orden de compra (total o parcial), atómico.
-- Por cada línea recibida: ingresa el inventario (vía
-- ingresar_inventario, que recalcula el costo promedio) y acumula
-- cantidad_recibida. Recalcula el estado de la orden y, si
-- p_crear_gasto, genera el Gasto en Financiero (tipo Costo,
-- categoría 'Compra Inventario') por lo recibido en ESTA recepción
-- — cada recepción parcial genera su propio gasto (la cuenta por
-- pagar real de esa factura).
-- ------------------------------------------------------------
create or replace function nativo.recibir_orden_compra(
  p_orden_id bigint,
  p_lineas jsonb,           -- [{"detalle_id":1,"cantidad":5,"ubicacion_id":1,"lote":null}, ...]
  p_numero_factura text default null,
  p_fecha date default current_date,
  p_usuario text default null,
  p_crear_gasto boolean default true
) returns nativo.ordenes_compra
language plpgsql
as $$
declare
  oc nativo.ordenes_compra;
  l record;
  det nativo.ordenes_compra_detalle;
  v_monto_recibido numeric := 0;
  v_gasto_id bigint;
  v_ticket integer;
  v_pendientes integer;
begin
  select * into oc from nativo.ordenes_compra where id = p_orden_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_orden_id;
  end if;
  if oc.estado not in ('Enviada', 'Recibida Parcial') then
    raise exception 'La orden #% está en estado "%"; solo se reciben órdenes Enviadas o con recepción parcial', oc.numero, oc.estado;
  end if;

  for l in select (e->>'detalle_id')::bigint detalle_id,
                  (e->>'cantidad')::numeric cantidad,
                  (e->>'ubicacion_id')::bigint ubicacion_id,
                  nullif(e->>'lote', '') lote
           from jsonb_array_elements(p_lineas) e
  loop
    if coalesce(l.cantidad, 0) <= 0 then continue; end if;
    if l.ubicacion_id is null then
      raise exception 'Indica la ubicación de ingreso de cada línea recibida';
    end if;

    select * into det from nativo.ordenes_compra_detalle
    where id = l.detalle_id and orden_compra_id = p_orden_id;
    if not found then
      raise exception 'La línea % no pertenece a esta orden', l.detalle_id;
    end if;
    if l.cantidad > det.cantidad - det.cantidad_recibida then
      raise exception 'La línea "%" solo tiene % pendientes por recibir', det.producto, det.cantidad - det.cantidad_recibida;
    end if;
    if det.producto_id is null then
      raise exception 'La línea "%" no tiene producto de inventario vinculado', det.producto;
    end if;

    perform nativo.ingresar_inventario(
      det.producto_id, l.ubicacion_id, l.cantidad, det.precio_unitario,
      'entrada', 'OC #' || oc.numero, oc.proveedor_id, p_numero_factura, l.lote,
      null, p_usuario, null, coalesce(p_fecha, current_date)::timestamptz);

    update nativo.ordenes_compra_detalle
    set cantidad_recibida = cantidad_recibida + l.cantidad
    where id = l.detalle_id;

    v_monto_recibido := v_monto_recibido + l.cantidad * det.precio_unitario;
  end loop;

  if v_monto_recibido <= 0 then
    raise exception 'No se recibió ninguna cantidad';
  end if;

  if p_crear_gasto then
    select coalesce(max(ticket), 0) + 1 into v_ticket from nativo.gastos;
    insert into nativo.gastos
      (ticket, fecha, tipo, categoria, proveedor, proveedor_id, numero_factura, monto, abonado, saldo, estado, usuario)
    values (v_ticket, coalesce(p_fecha, current_date), 'Costo', 'Compra Inventario',
            oc.proveedor, oc.proveedor_id, p_numero_factura, v_monto_recibido, 0, v_monto_recibido, 'Pendiente', p_usuario)
    returning id into v_gasto_id;

    insert into nativo.gastos_detalle (gasto_id, cantidad, unidad_medida, articulo, precio_unitario, valor_total)
    select v_gasto_id, (e->>'cantidad')::numeric, null,
           'OC #' || oc.numero || ' — ' || d.producto,
           d.precio_unitario, (e->>'cantidad')::numeric * d.precio_unitario
    from jsonb_array_elements(p_lineas) e
    join nativo.ordenes_compra_detalle d on d.id = (e->>'detalle_id')::bigint
    where coalesce((e->>'cantidad')::numeric, 0) > 0;
  end if;

  select count(*) into v_pendientes from nativo.ordenes_compra_detalle
  where orden_compra_id = p_orden_id and cantidad_recibida < cantidad;

  update nativo.ordenes_compra
  set estado = case when v_pendientes = 0 then 'Recibida' else 'Recibida Parcial' end,
      gasto_id = coalesce(v_gasto_id, gasto_id)
  where id = p_orden_id
  returning * into oc;

  return oc;
end;
$$;

-- ------------------------------------------------------------
-- USUARIOS: nuevo permiso "compras" en el default de permisos
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false, "compras": false}'::jsonb;

-- ------------------------------------------------------------
-- Semilla: categoría de gasto para compras de inventario
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Compra Inventario')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
