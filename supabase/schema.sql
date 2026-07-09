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
  permisos jsonb not null default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "configuracion": false}'::jsonb,
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
  creado_en timestamptz not null default now()
);
create index idx_clientes_cedula on nativo.clientes (cedula_nit);
create index idx_clientes_nombre on nativo.clientes (nombre);

-- ------------------------------------------------------------
-- PRODUCTOS
-- ------------------------------------------------------------
create table nativo.productos (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

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
  comentario_entrega text,
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
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
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
-- FUNCIÓN RPC: registrar pago de forma atómica
-- Inserta en pagos y recalcula la cabecera en una sola transacción.
-- ------------------------------------------------------------
create or replace function nativo.registrar_pago(
  p_venta_id bigint,
  p_abono numeric,
  p_retencion numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
begin
  insert into nativo.pagos (venta_id, fecha, abono, retencion, comentario, usuario)
  values (p_venta_id, coalesce(p_fecha, current_date), coalesce(p_abono, 0), coalesce(p_retencion, 0), p_comentario, p_usuario);

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
  return v;
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
  p_usuario text
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
      comentario_entrega = coalesce(p_comentario, comentario_entrega)
  where id = p_venta_id
  returning * into v;

  insert into nativo.historial_entregas (venta_id, estado_anterior, estado_nuevo, comentario, usuario)
  values (p_venta_id, v_anterior, p_estado_nuevo, p_comentario, p_usuario);

  return v;
end;
$$;

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
