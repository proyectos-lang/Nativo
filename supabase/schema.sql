-- ============================================================
-- Sistema de Control de Pedidos y Despachos Nativo
-- Esquema: nativo  |  ids: bigint identity  |  tablas en español
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

create schema if not exists nativo;

-- ------------------------------------------------------------
-- USUARIOS
-- ADVERTENCIA: la columna "contrasena" guarda la contraseña en
-- TEXTO PLANO por decisión explícita del propietario del sistema.
-- Cualquiera con acceso a esta tabla ve las contraseñas reales.
-- ------------------------------------------------------------
create table nativo.usuarios (
  id bigint generated always as identity primary key,
  nombre text not null,
  usuario text not null unique,
  correo text,
  contrasena text not null,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  permisos jsonb not null default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false}'::jsonb,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table nativo.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  empresa text,
  contacto text,
  ciudad text,
  departamento text,
  direccion text,
  correo text,
  cedula_nit text,
  rut text,
  digito_verificacion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index idx_clientes_cedula on nativo.clientes (cedula_nit);
create index idx_clientes_nombre on nativo.clientes (nombre);

-- ------------------------------------------------------------
-- PRODUCTOS (catálogo de referencias/variantes del inventario).
-- Un producto = una referencia (la talla/color/manga hacen parte
-- de la identidad de la fila; el SKU es la clave real). Los
-- productos creados automáticamente desde Ventas (texto libre)
-- quedan con controla_inventario = false hasta enrolarse desde
-- el módulo Inventario. es_servicio = se vende como producto pero
-- nunca mueve inventario.
-- ------------------------------------------------------------
create table nativo.productos (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  sku text,
  codigo_barras text,
  categoria text,
  subcategoria text,
  sexo text,
  talla text,
  color text,
  manga text,
  unidad_medida text not null default 'Unidad',
  precio_compra numeric not null default 0,
  precio_venta_antes_iva numeric not null default 0,
  iva_porcentaje numeric not null default 0,
  precio_venta numeric not null default 0,
  costo_promedio numeric not null default 0,
  es_servicio boolean not null default false,
  controla_inventario boolean not null default false,
  estado text not null default 'Activo' check (estado in ('Activo', 'Descontinuado')),
  fecha_vencimiento date,
  stock_minimo numeric not null default 0,
  stock_maximo numeric,
  creado_en timestamptz not null default now(),
  constraint chk_servicio_sin_inventario check (not (es_servicio and controla_inventario))
);
create unique index idx_productos_sku on nativo.productos (sku) where sku is not null;
create index idx_productos_categoria on nativo.productos (categoria);
create index idx_productos_estado on nativo.productos (estado);

-- ------------------------------------------------------------
-- LISTAS MAESTRAS (vendedoras, tallas, colores, estados, etc.)
-- ------------------------------------------------------------
create table nativo.listas_maestras (
  id bigint generated always as identity primary key,
  tipo text not null,
  valor text not null,
  creado_en timestamptz not null default now(),
  unique (tipo, valor)
);
create index idx_listas_tipo on nativo.listas_maestras (tipo);

-- ------------------------------------------------------------
-- VENTAS (cabecera) — trazabilidad, pagos y estados cuelgan de aquí
-- ------------------------------------------------------------
create table nativo.ventas (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null,
  cliente_id bigint references nativo.clientes (id),
  canal_venta text,
  campana text,
  vendedora text,
  profesional text,
  motivo_compra text,
  total_compra numeric not null default 0,
  retencion numeric not null default 0,
  total_a_pagar numeric not null default 0,
  abono numeric not null default 0,
  saldo numeric not null default 0,
  estado_pago text default 'Pendiente',
  fecha_pago date,
  tipo_pago text,
  medio_pago text,
  observaciones_pago text,
  estado_entrega text default 'En Proceso',
  fecha_entrega date,
  fecha_entrega_real date,
  transportadora text,
  numero_guia text,
  comentario_entrega text,
  costo_envio numeric not null default 0,
  ubicacion_actual text,
  creado_en timestamptz not null default now()
);
create index idx_ventas_ticket on nativo.ventas (ticket);
create index idx_ventas_cliente on nativo.ventas (cliente_id);
create index idx_ventas_estado_pago on nativo.ventas (estado_pago);
create index idx_ventas_estado_entrega on nativo.ventas (estado_entrega);
create index idx_ventas_fecha on nativo.ventas (fecha);

-- ------------------------------------------------------------
-- VENTAS DETALLE (una fila por producto de la venta)
-- ------------------------------------------------------------
create table nativo.ventas_detalle (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  producto text not null,
  codigo_producto text,
  cantidad numeric not null default 1,
  talla text,
  color text,
  sexo text,
  estampado text,
  bordado text,
  guia_estampado text,
  guia_bordado text,
  imagen_estampado_url text,
  imagen_bordado_url text,
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  listo boolean not null default false,
  creado_en timestamptz not null default now()
);
create index idx_detalle_venta on nativo.ventas_detalle (venta_id);

-- ------------------------------------------------------------
-- PAGOS (trazabilidad de cada abono/retención aplicada)
-- ------------------------------------------------------------
create table nativo.pagos (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  fecha date not null default current_date,
  abono numeric not null default 0,
  retencion numeric not null default 0,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_pagos_venta on nativo.pagos (venta_id);

-- ------------------------------------------------------------
-- HISTORIAL DE ENTREGAS (cada cambio de estado)
-- ------------------------------------------------------------
create table nativo.historial_entregas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  ubicacion text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_historial_venta on nativo.historial_entregas (venta_id);

-- ------------------------------------------------------------
-- PROSPECTOS (clientes por contactar)
-- ------------------------------------------------------------
create table nativo.prospectos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  referido_por text,
  evento_lugar text,
  nombre text not null,
  telefono text,
  correo text,
  descripcion text,
  estado text not null default 'Pendiente',
  fecha_contacto date,
  proximo_contacto date,
  observaciones text,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CONFIGURACIÓN DEL SISTEMA (fila única): PIN de autorización
-- ADVERTENCIA: igual que las contraseñas de usuarios, se guarda
-- en texto plano por decisión del propietario del sistema.
-- ------------------------------------------------------------
create table nativo.configuracion_sistema (
  id bigint generated always as identity primary key,
  clave_autorizacion text not null default 'CAMBIAR-1234',
  clave_contadora text not null default 'CAMBIAR-5678',
  creado_en timestamptz not null default now()
);
insert into nativo.configuracion_sistema (clave_autorizacion) values ('CAMBIAR-1234');

-- ------------------------------------------------------------
-- AUDITORÍA DE EDICIONES (reutilizable: gastos e ingresos hoy)
-- ------------------------------------------------------------
create table nativo.bitacora (
  id bigint generated always as identity primary key,
  tabla_afectada text not null,
  registro_id bigint not null,
  usuario text,
  fecha timestamptz not null default now(),
  modulo text not null default 'financiero',
  accion text not null default 'editar',
  descripcion text not null default '',
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text
);
create index idx_bitacora_entidad on nativo.bitacora (tabla_afectada, registro_id);
create index idx_bitacora_fecha on nativo.bitacora (fecha);
create index idx_bitacora_usuario on nativo.bitacora (usuario);
create index idx_bitacora_modulo on nativo.bitacora (modulo);
create index idx_bitacora_accion on nativo.bitacora (accion);

-- ------------------------------------------------------------
-- PROVEEDORES (clon de clientes)
-- ------------------------------------------------------------
create table nativo.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null,
  nit text,
  contacto text,
  correo text,
  direccion text,
  ciudad text,
  departamento text,
  creado_en timestamptz not null default now()
);
create index idx_proveedores_nombre on nativo.proveedores (nombre);
create index idx_proveedores_nit on nativo.proveedores (nit);

-- ------------------------------------------------------------
-- MÓDULO FINANCIERO
-- ------------------------------------------------------------

-- CUENTAS BANCARIAS (saldo actual = saldo_inicial + ingresos - egresos)
create table nativo.cuentas_bancarias (
  id bigint generated always as identity primary key,
  nombre text not null,
  banco text,
  numero_cuenta text,
  saldo_inicial numeric not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- GASTOS Y COSTOS (causación; admite abonos parciales)
create table nativo.gastos (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('Gasto', 'Costo')),
  categoria text,
  proveedor text,
  proveedor_id bigint references nativo.proveedores (id),
  numero_factura text,
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
create index idx_gastos_ticket on nativo.gastos (ticket);

-- GASTOS_DETALLE: líneas de artículo por gasto (clon de ventas_detalle)
create table nativo.gastos_detalle (
  id bigint generated always as identity primary key,
  gasto_id bigint not null references nativo.gastos (id) on delete cascade,
  cantidad numeric not null default 1,
  unidad_medida text,
  articulo text not null,
  precio_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  creado_en timestamptz not null default now()
);
create index idx_gastos_detalle_gasto on nativo.gastos_detalle (gasto_id);

-- PAGOS DE GASTOS (cada abono a un gasto sale de una cuenta)
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

-- INGRESOS (espejo de gastos, sin líneas múltiples; admite cobro parcial)
create table nativo.ingresos (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null default current_date,
  categoria text,
  concepto text,
  cliente_id bigint references nativo.clientes (id),
  cliente text,
  tipo_ingreso text
    check (tipo_ingreso is null or tipo_ingreso in ('Abono a Factura', 'Cancela Factura', 'Otro')),
  estado_facturacion text not null default 'No Aplica'
    check (estado_facturacion in ('Pendiente de Facturar', 'Facturado', 'No Aplica')),
  numero_factura text,
  monto numeric not null default 0,
  cobrado numeric not null default 0,
  saldo numeric not null default 0,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Abonado', 'Cobrado')),
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_ingresos_estado on nativo.ingresos (estado);
create index idx_ingresos_fecha on nativo.ingresos (fecha);
create index idx_ingresos_ticket on nativo.ingresos (ticket);
create index idx_ingresos_cliente on nativo.ingresos (cliente_id);

-- PAGOS DE INGRESOS (cada cobro de un ingreso entra a una cuenta)
create table nativo.pagos_ingresos (
  id bigint generated always as identity primary key,
  ingreso_id bigint not null references nativo.ingresos (id) on delete cascade,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  monto numeric not null default 0,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_pagos_ingresos_ingreso on nativo.pagos_ingresos (ingreso_id);

-- MOVIMIENTOS BANCARIOS (libro de cada cuenta)
create table nativo.movimientos_bancarios (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  origen text not null default 'manual' check (origen in ('manual', 'pago_venta', 'pago_gasto', 'transferencia', 'pago_ingreso', 'devolucion_venta')),
  monto numeric not null check (monto > 0),
  concepto text,
  pago_id bigint references nativo.pagos (id) on delete cascade,
  pago_gasto_id bigint references nativo.pagos_gastos (id) on delete set null,
  pago_ingreso_id bigint references nativo.pagos_ingresos (id) on delete set null,
  movimiento_relacionado_id bigint references nativo.movimientos_bancarios (id),
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_movimientos_cuenta on nativo.movimientos_bancarios (cuenta_id);
create index idx_movimientos_fecha on nativo.movimientos_bancarios (fecha);

-- Cuenta destino del abono en pagos de ventas
alter table nativo.pagos add column cuenta_id bigint references nativo.cuentas_bancarias (id);

-- ------------------------------------------------------------
-- DEVOLUCIONES (cabecera, amarrada al ticket de venta)
-- ------------------------------------------------------------
create table nativo.devoluciones (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id),
  fecha date not null default current_date,
  usuario text,
  comentario text,
  creado_en timestamptz not null default now()
);
create index idx_devoluciones_venta on nativo.devoluciones (venta_id);

-- DEVOLUCIONES_DETALLE: una fila por prenda/línea devuelta. No depende
-- de una FK dura hacia ventas_detalle para sus datos de negocio: copia
-- producto/talla/color/valor_unitario al crearse, porque
-- actualizarVenta() borra y reinserta TODAS las líneas de
-- ventas_detalle al editar una venta (no hace diff). ventas_detalle_id
-- queda como referencia blanda (on delete set null), solo para
-- trazabilidad/navegación en la UI.
create table nativo.devoluciones_detalle (
  id bigint generated always as identity primary key,
  devolucion_id bigint not null references nativo.devoluciones (id) on delete cascade,
  ventas_detalle_id bigint references nativo.ventas_detalle (id) on delete set null,
  producto text not null,
  talla text,
  color text,
  valor_unitario numeric not null default 0,
  cantidad_devuelta numeric not null default 1,
  causal text,
  observacion text,
  recuperable boolean not null default true,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En Reproceso', 'Recuperada', 'Perdida')),
  costo_recuperacion numeric,
  valor_perdido numeric,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index idx_devoluciones_detalle_devolucion on nativo.devoluciones_detalle (devolucion_id);
create index idx_devoluciones_detalle_estado on nativo.devoluciones_detalle (estado);

-- DEVOLUCIONES_HISTORIAL: historial de estados/reprocesos, análogo a historial_entregas
create table nativo.devoluciones_historial (
  id bigint generated always as identity primary key,
  devolucion_detalle_id bigint not null references nativo.devoluciones_detalle (id) on delete cascade,
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  usuario text
);
create index idx_devoluciones_historial_detalle on nativo.devoluciones_historial (devolucion_detalle_id);

-- ------------------------------------------------------------
-- MÓDULO INVENTARIO
-- ------------------------------------------------------------

-- UBICACIONES (Bodega / Exhibición; ampliable)
create table nativo.inventario_ubicaciones (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- EXISTENCIAS físicas (una fila por producto + ubicación). Nunca negativas.
create table nativo.inventario_existencias (
  id bigint generated always as identity primary key,
  producto_id bigint not null references nativo.productos (id) on delete cascade,
  ubicacion_id bigint not null references nativo.inventario_ubicaciones (id),
  cantidad numeric not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  unique (producto_id, ubicacion_id)
);
create index idx_existencias_producto on nativo.inventario_existencias (producto_id);

-- KARDEX: nunca se borra. FKs blandas + texto copiado (mismo criterio
-- que devoluciones_detalle). cantidad SIEMPRE con signo (+entra/−sale);
-- en 'ajuste' es la diferencia. saldo_despues = stock TOTAL del
-- producto (todas las ubicaciones) tras el movimiento.
create table nativo.inventario_movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in (
    'inventario_inicial', 'entrada', 'devolucion', 'salida', 'venta',
    'traslado_salida', 'traslado_entrada', 'ajuste')),
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  ubicacion text,
  cantidad numeric not null,
  costo_unitario numeric,
  saldo_despues numeric not null,
  referencia text,
  venta_id bigint references nativo.ventas (id) on delete set null,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  numero_factura text,
  lote text,
  motivo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_inv_mov_producto on nativo.inventario_movimientos (producto_id, fecha);
create index idx_inv_mov_tipo on nativo.inventario_movimientos (tipo);
create index idx_inv_mov_fecha on nativo.inventario_movimientos (fecha);
create index idx_inv_mov_venta on nativo.inventario_movimientos (venta_id);

-- RESERVAS (stock comprometido por ventas). NO dependen de
-- ventas_detalle.id (esos ids cambian en cada edición de venta).
-- cantidad_pendiente = parte sin respaldo físico ("pendiente por
-- surtir" de venta sin inventario).
-- Disponible(producto) = Σ existencias − Σ (cantidad − pendiente) activas.
create table nativo.inventario_reservas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  ticket integer not null,
  producto_id bigint not null references nativo.productos (id),
  producto text not null,
  cantidad numeric not null check (cantidad > 0),
  cantidad_pendiente numeric not null default 0 check (cantidad_pendiente >= 0),
  estado text not null default 'Activa' check (estado in ('Activa', 'Despachada', 'Cancelada')),
  fecha_surtido timestamptz,
  fecha_despacho timestamptz,
  usuario text,
  creado_en timestamptz not null default now(),
  check (cantidad_pendiente <= cantidad)
);
create index idx_reservas_venta on nativo.inventario_reservas (venta_id);
create index idx_reservas_producto_estado on nativo.inventario_reservas (producto_id, estado);
create index idx_reservas_pendientes on nativo.inventario_reservas (producto_id, creado_en)
  where estado = 'Activa' and cantidad_pendiente > 0;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: registrar pago de forma atómica
-- Inserta en pagos, recalcula la cabecera y, si viene cuenta,
-- genera el movimiento bancario de ingreso por el abono.
-- ------------------------------------------------------------
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
-- FUNCIÓN RPC: pagar gasto (abono parcial o total) de forma atómica
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
-- FUNCIÓN RPC: transferencia entre cuentas (dos asientos enlazados)
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
-- FUNCIÓN RPC: actualizar estado de entrega de forma atómica
-- Actualiza cabecera e inserta historial en una sola transacción.
-- ------------------------------------------------------------
create or replace function nativo.actualizar_entrega(
  p_venta_id bigint,
  p_estado_nuevo text,
  p_comentario text,
  p_usuario text,
  p_fecha_entrega_real date default null,
  p_transportadora text default null,
  p_numero_guia text default null,
  p_ubicacion text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_anterior text;
begin
  select estado_entrega into v_anterior from nativo.ventas where id = p_venta_id;
  if not found then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  update nativo.ventas
  set estado_entrega = p_estado_nuevo,
      comentario_entrega = coalesce(p_comentario, comentario_entrega),
      fecha_entrega_real = coalesce(p_fecha_entrega_real, fecha_entrega_real),
      transportadora = coalesce(p_transportadora, transportadora),
      numero_guia = coalesce(p_numero_guia, numero_guia),
      ubicacion_actual = coalesce(p_ubicacion, ubicacion_actual)
  where id = p_venta_id
  returning * into v;

  insert into nativo.historial_entregas (venta_id, estado_anterior, estado_nuevo, comentario, usuario, ubicacion)
  values (p_venta_id, v_anterior, p_estado_nuevo, p_comentario, p_usuario, p_ubicacion);

  return v;
end;
$$;

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
-- FUNCIÓN RPC: cobrar ingreso (abono parcial o total), espejo
-- exacto de pagar_gasto.
-- ------------------------------------------------------------
create or replace function nativo.cobrar_ingreso(
  p_ingreso_id bigint,
  p_cuenta_id bigint,
  p_monto numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text
) returns nativo.ingresos
language plpgsql
as $$
declare
  i nativo.ingresos;
  v_pago_ingreso_id bigint;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del cobro debe ser mayor a cero';
  end if;
  if p_cuenta_id is null then
    raise exception 'Debe indicar la cuenta donde se recibe el ingreso';
  end if;

  insert into nativo.pagos_ingresos (ingreso_id, cuenta_id, fecha, monto, comentario, usuario)
  values (p_ingreso_id, p_cuenta_id, coalesce(p_fecha, current_date), p_monto, p_comentario, p_usuario)
  returning id into v_pago_ingreso_id;

  update nativo.ingresos
  set cobrado = cobrado + p_monto,
      saldo = monto - (cobrado + p_monto),
      estado = case when monto - (cobrado + p_monto) <= 0 then 'Cobrado' else 'Abonado' end
  where id = p_ingreso_id
  returning * into i;

  if i.id is null then
    raise exception 'Ingreso % no encontrado', p_ingreso_id;
  end if;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_ingreso_id, usuario)
  values (p_cuenta_id, coalesce(p_fecha, current_date), 'ingreso', 'pago_ingreso', p_monto,
          'Cobro ingreso: ' || coalesce(i.concepto, i.categoria, 'sin concepto'), v_pago_ingreso_id, p_usuario);

  return i;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: ingresar inventario (entrada / inventario inicial /
-- devolución) con recálculo de costo promedio ponderado, atómico.
-- p_costo_unitario null = entra al costo promedio actual sin
-- alterarlo (ej. devoluciones).
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

  -- Costo promedio ponderado
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

  return prod;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: traslado entre ubicaciones (dos asientos kardex).
-- El costo promedio y el stock total no cambian.
-- ------------------------------------------------------------
create or replace function nativo.trasladar_inventario(
  p_producto_id bigint,
  p_origen_id bigint,
  p_destino_id bigint,
  p_cantidad numeric,
  p_motivo text default null,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_origen text; v_destino text;
  v_en_origen numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'La ubicación origen y destino deben ser distintas';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_origen from nativo.inventario_ubicaciones where id = p_origen_id;
  select nombre into v_destino from nativo.inventario_ubicaciones where id = p_destino_id;
  if v_origen is null or v_destino is null then
    raise exception 'Ubicación origen o destino no encontrada';
  end if;

  select coalesce(cantidad, 0) into v_en_origen
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;
  if coalesce(v_en_origen, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas trasladar %', v_origen, coalesce(v_en_origen, 0), p_cantidad;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_destino_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values
    ('traslado_salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_origen_id, v_origen, -p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario),
    ('traslado_entrada', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_destino_id, v_destino, p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: ajuste puntual (conteo físico de un producto en
-- una ubicación). Deja la existencia = cantidad física y registra
-- la DIFERENCIA (con signo) en el kardex. No cambia el costo.
-- ------------------------------------------------------------
create or replace function nativo.ajustar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad_fisica numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns numeric
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_actual numeric;
  v_diferencia numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad_fisica, -1) < 0 then
    raise exception 'La cantidad física no puede ser negativa';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_actual
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  v_actual := coalesce(v_actual, 0);

  v_diferencia := p_cantidad_fisica - v_actual;
  if v_diferencia = 0 then
    raise exception 'No hay diferencia que ajustar: el sistema ya registra % en %', v_actual, v_ubicacion;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad_fisica, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = excluded.cantidad, actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('ajuste', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, v_diferencia, prod.costo_promedio, v_stock_total,
          p_referencia, p_motivo, p_usuario);

  return v_diferencia;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: salida manual (bajas, muestras, obsequios).
-- Valida stock físico en la ubicación y que la salida no rompa
-- las reservas respaldadas por stock.
-- ------------------------------------------------------------
create or replace function nativo.salida_manual_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_en_ubicacion numeric;
  v_stock_total numeric;
  v_respaldado numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_en_ubicacion
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  if coalesce(v_en_ubicacion, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas sacar %', v_ubicacion, coalesce(v_en_ubicacion, 0), p_cantidad;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;
  select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_respaldado
  from nativo.inventario_reservas
  where producto_id = p_producto_id and estado = 'Activa';

  if v_stock_total - p_cantidad < v_respaldado then
    raise exception 'No puedes sacar % unidades: hay % reservadas para ventas pendientes de despacho', p_cantidad, v_respaldado;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, -p_cantidad, prod.costo_promedio, v_stock_total - p_cantidad,
          p_referencia, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- Semillas: lista maestra de transportadoras
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('transportadora', 'Servientrega'),
  ('transportadora', 'Interrapidísimo'),
  ('transportadora', 'Coordinadora'),
  ('transportadora', 'Envía'),
  ('transportadora', 'Entrega propia')
on conflict do nothing;

-- ------------------------------------------------------------
-- Semillas: lista maestra de talleres/ubicaciones
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('taller', 'Tribey'),
  ('taller', 'Bordados JA'),
  ('taller', 'Madamis')
on conflict do nothing;

-- ------------------------------------------------------------
-- Semillas: categorías de ingreso y unidades de medida
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_ingreso', 'Ventas'),
  ('categoria_ingreso', 'Arriendo'),
  ('categoria_ingreso', 'Servicios Públicos'),
  ('categoria_ingreso', 'Préstamos'),
  ('categoria_ingreso', 'Otros')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('unidad_medida', 'Unidad'),
  ('unidad_medida', 'Metro'),
  ('unidad_medida', 'Kilogramo'),
  ('unidad_medida', 'Litro'),
  ('unidad_medida', 'Caja'),
  ('unidad_medida', 'Paquete'),
  ('unidad_medida', 'Rollo'),
  ('unidad_medida', 'Docena'),
  ('unidad_medida', 'Global')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('causal_devolucion', 'Talla incorrecta'),
  ('causal_devolucion', 'Color incorrecto'),
  ('causal_devolucion', 'Defecto de bordado'),
  ('causal_devolucion', 'Defecto de estampado'),
  ('causal_devolucion', 'Producto dañado'),
  ('causal_devolucion', 'Cambio de decisión del cliente'),
  ('causal_devolucion', 'Otro')
on conflict do nothing;

-- ------------------------------------------------------------
-- Semillas: inventario (ubicaciones, categorías de producto,
-- tipos de manga, motivos de ajuste y traslado)
-- ------------------------------------------------------------
insert into nativo.inventario_ubicaciones (nombre) values ('Bodega'), ('Exhibición')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_producto', 'Camisetas'),
  ('categoria_producto', 'Camisas'),
  ('categoria_producto', 'Jeans'),
  ('categoria_producto', 'Gorras'),
  ('categoria_producto', 'Buff'),
  ('categoria_producto', 'Telas'),
  ('categoria_producto', 'Botones'),
  ('categoria_producto', 'Insumos'),
  ('categoria_producto', 'Empaques'),
  ('categoria_producto', 'Servicios'),
  ('tipo_manga', 'Manga corta'),
  ('tipo_manga', 'Manga larga'),
  ('tipo_manga', 'Sin manga'),
  ('motivo_ajuste', 'Conteo físico'),
  ('motivo_ajuste', 'Producto dañado'),
  ('motivo_ajuste', 'Pérdida/Robo'),
  ('motivo_ajuste', 'Error de registro'),
  ('motivo_ajuste', 'Otro'),
  ('motivo_traslado', 'Reposición exhibición'),
  ('motivo_traslado', 'Reorganización'),
  ('motivo_traslado', 'Otro')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Reproceso')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos para los roles de la API de Supabase
-- (el acceso real de la app es solo server-side con service_role)
-- ------------------------------------------------------------
grant usage on schema nativo to anon, authenticated, service_role;
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
alter default privileges in schema nativo grant all on tables to service_role;
alter default privileges in schema nativo grant all on sequences to service_role;
alter default privileges in schema nativo grant all on functions to service_role;
