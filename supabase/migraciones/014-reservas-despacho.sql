-- ============================================================
-- Migración 014: Integración Inventario ↔ Ventas/Entregas.
-- Reservas al vender (con "venta sin inventario" = pendiente por
-- surtir), despacho físico al entregar, y surtido automático FIFO
-- al ingresar mercancía.
-- Idempotente. Ejecutar completo en: Supabase SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- FUNCIÓN RPC: reservar inventario para una venta. Idempotente:
-- cancela las reservas Activas anteriores de la venta y crea las
-- nuevas (compatible con el delete+reinsert de líneas al editar).
-- permitir_faltante=true (venta sin inventario) deja la parte sin
-- respaldo como cantidad_pendiente (pendiente por surtir).
-- ------------------------------------------------------------
create or replace function nativo.reservar_venta(
  p_venta_id bigint,
  p_lineas jsonb,   -- [{"producto_id":7,"cantidad":3,"permitir_faltante":true}, ...]
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  v_ticket integer;
  l record;
  prod nativo.productos;
  v_fisico numeric; v_reservado numeric; v_disponible numeric; v_pendiente numeric;
begin
  select ticket into v_ticket from nativo.ventas where id = p_venta_id;
  if v_ticket is null then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  if exists (select 1 from nativo.inventario_reservas
             where venta_id = p_venta_id and estado = 'Despachada') then
    raise exception 'La venta #% ya tiene mercancía despachada del inventario; usa Ajustes o Devoluciones para corregir', v_ticket;
  end if;

  -- Libera las reservas activas anteriores de esta venta
  update nativo.inventario_reservas set estado = 'Cancelada'
  where venta_id = p_venta_id and estado = 'Activa';

  for l in select (e->>'producto_id')::bigint producto_id,
                  (e->>'cantidad')::numeric cantidad,
                  coalesce((e->>'permitir_faltante')::boolean, false) permitir_faltante
           from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e
  loop
    if coalesce(l.cantidad, 0) <= 0 then continue; end if;

    select * into prod from nativo.productos where id = l.producto_id for update;
    if not found or not prod.controla_inventario or prod.es_servicio then continue; end if;

    select coalesce(sum(cantidad), 0) into v_fisico
      from nativo.inventario_existencias where producto_id = l.producto_id;
    select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_reservado
      from nativo.inventario_reservas where producto_id = l.producto_id and estado = 'Activa';
    v_disponible := greatest(v_fisico - v_reservado, 0);

    if l.cantidad > v_disponible and not l.permitir_faltante then
      raise exception 'Stock insuficiente de "%": disponible %, pedido %. Marca "Venta sin inventario" en esa línea para continuar.',
        prod.nombre, v_disponible, l.cantidad;
    end if;
    v_pendiente := greatest(l.cantidad - v_disponible, 0);

    insert into nativo.inventario_reservas
      (venta_id, ticket, producto_id, producto, cantidad, cantidad_pendiente, estado, usuario, fecha_surtido)
    values (p_venta_id, v_ticket, prod.id,
            coalesce(prod.sku || ' — ', '') || prod.nombre,
            l.cantidad, v_pendiente, 'Activa', p_usuario,
            case when v_pendiente = 0 then now() else null end);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: despachar una venta (descuento físico al entregar).
-- Por cada reserva Activa saca lo respaldado (primero de Bodega),
-- registra kardex tipo 'venta' al costo promedio del momento, y
-- marca la reserva Despachada (o la reduce a lo pendiente si hubo
-- entrega parcial). Idempotente: sin reservas respaldadas no hace
-- nada.
-- ------------------------------------------------------------
create or replace function nativo.despachar_venta(
  p_venta_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  r record; ub record;
  v_por_sacar numeric; v_toma numeric; v_saldo numeric; v_costo numeric;
begin
  for r in select * from nativo.inventario_reservas
           where venta_id = p_venta_id and estado = 'Activa'
           order by id
           for update
  loop
    perform 1 from nativo.productos where id = r.producto_id for update;
    v_por_sacar := r.cantidad - r.cantidad_pendiente;
    if v_por_sacar <= 0 then continue; end if;

    select costo_promedio into v_costo from nativo.productos where id = r.producto_id;

    for ub in select e.id, e.ubicacion_id, e.cantidad, u.nombre
              from nativo.inventario_existencias e
              join nativo.inventario_ubicaciones u on u.id = e.ubicacion_id
              where e.producto_id = r.producto_id and e.cantidad > 0
              order by case when u.nombre = 'Bodega' then 0 else 1 end, e.id
    loop
      exit when v_por_sacar <= 0;
      v_toma := least(ub.cantidad, v_por_sacar);
      update nativo.inventario_existencias
      set cantidad = cantidad - v_toma, actualizado_en = now()
      where id = ub.id;
      select coalesce(sum(cantidad), 0) into v_saldo
        from nativo.inventario_existencias where producto_id = r.producto_id;
      insert into nativo.inventario_movimientos
        (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
         saldo_despues, referencia, venta_id, usuario)
      values ('venta', r.producto_id, r.producto, ub.ubicacion_id, ub.nombre, -v_toma,
              v_costo, v_saldo, 'Ticket #' || r.ticket, p_venta_id, p_usuario);
      v_por_sacar := v_por_sacar - v_toma;
    end loop;

    if v_por_sacar > 0 then
      raise exception 'Inconsistencia de inventario: la reserva de "%" no tiene respaldo físico suficiente', r.producto;
    end if;

    if r.cantidad_pendiente > 0 then
      -- Entrega parcial: lo respaldado salió; queda viva solo la parte pendiente por surtir
      update nativo.inventario_reservas
      set cantidad = cantidad_pendiente, fecha_despacho = now()
      where id = r.id;
    else
      update nativo.inventario_reservas
      set estado = 'Despachada', fecha_despacho = now()
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: surtir pendientes por surtir (FIFO) con el stock
-- libre de un producto. Si la venta ya está Entregada, lo surtido
-- se despacha de inmediato. La llama ingresar_inventario.
-- ------------------------------------------------------------
create or replace function nativo.surtir_pendientes(
  p_producto_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  r record; v_fisico numeric; v_respaldado numeric; v_libre numeric; v_asigna numeric;
  v_entregada boolean;
begin
  select coalesce(sum(cantidad), 0) into v_fisico
    from nativo.inventario_existencias where producto_id = p_producto_id;
  select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_respaldado
    from nativo.inventario_reservas where producto_id = p_producto_id and estado = 'Activa';
  v_libre := v_fisico - v_respaldado;

  for r in select * from nativo.inventario_reservas
           where producto_id = p_producto_id and estado = 'Activa' and cantidad_pendiente > 0
           order by creado_en, id          -- FIFO: los pendientes más antiguos primero
           for update
  loop
    exit when v_libre <= 0;
    v_asigna := least(r.cantidad_pendiente, v_libre);
    update nativo.inventario_reservas
    set cantidad_pendiente = cantidad_pendiente - v_asigna,
        fecha_surtido = case when cantidad_pendiente - v_asigna = 0 then now() else fecha_surtido end
    where id = r.id;
    v_libre := v_libre - v_asigna;

    select lower(trim(coalesce(estado_entrega, ''))) = 'entregado' into v_entregada
      from nativo.ventas where id = r.venta_id;
    if coalesce(v_entregada, false) then
      perform nativo.despachar_venta(r.venta_id, p_usuario);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- ingresar_inventario: se re-crea agregando el surtido automático
-- de pendientes al final (misma lógica que la migración 012 + la
-- llamada a surtir_pendientes antes del return).
-- ------------------------------------------------------------
create or replace function nativo.ingresar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_costo_unitario numeric default null,
  p_tipo text default 'entrada',
  p_referencia text default null,
  p_proveedor_id bigint default null,
  p_numero_factura text default null,
  p_lote text default null,
  p_motivo text default null,
  p_usuario text default null,
  p_venta_id bigint default null,
  p_fecha timestamptz default now()
) returns nativo.productos
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_stock_total numeric;
  v_costo numeric;
  v_nuevo_costo numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_tipo not in ('entrada', 'inventario_inicial', 'devolucion') then
    raise exception 'Tipo de ingreso inválido: %', p_tipo;
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;
  if prod.es_servicio then
    raise exception 'El producto "%" es un servicio: no maneja inventario', prod.nombre;
  end if;
  if not prod.controla_inventario then
    raise exception 'El producto "%" no controla inventario; actívalo en el catálogo primero', prod.nombre;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  v_costo := coalesce(p_costo_unitario, prod.costo_promedio);
  if v_stock_total + p_cantidad > 0 then
    v_nuevo_costo := round(
      (v_stock_total * prod.costo_promedio + p_cantidad * v_costo)
      / (v_stock_total + p_cantidad), 4);
  else
    v_nuevo_costo := v_costo;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  update nativo.productos
  set costo_promedio = v_nuevo_costo,
      precio_compra = case when p_costo_unitario is not null and p_tipo in ('entrada', 'inventario_inicial')
                           then p_costo_unitario else precio_compra end
  where id = p_producto_id
  returning * into prod;

  insert into nativo.inventario_movimientos
    (fecha, tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
     saldo_despues, referencia, venta_id, proveedor_id, numero_factura, lote, motivo, usuario)
  values (coalesce(p_fecha, now()), p_tipo, prod.id,
          coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, p_cantidad, v_costo,
          v_stock_total + p_cantidad, p_referencia, p_venta_id, p_proveedor_id,
          p_numero_factura, p_lote, p_motivo, p_usuario);

  -- Surtido automático FIFO de pendientes por surtir
  perform nativo.surtir_pendientes(p_producto_id, p_usuario);

  return prod;
end;
$$;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
