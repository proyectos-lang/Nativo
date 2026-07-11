-- ============================================================
-- Migración 003: Dashboard modular, Gastos con líneas, edición
-- auditada con clave de contadora, Proveedores, e Ingresos con
-- categorías y cobro parcial.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- CONFIGURACIÓN DEL SISTEMA: clave de la contadora (separada del
-- PIN de ventas). ADVERTENCIA: texto plano, mismo criterio que
-- el resto de claves del sistema.
-- ------------------------------------------------------------
alter table nativo.configuracion_sistema
  add column clave_contadora text not null default 'CAMBIAR-5678';

-- ------------------------------------------------------------
-- AUDITORÍA DE EDICIONES (reutilizable: gastos e ingresos hoy)
-- ------------------------------------------------------------
create table nativo.auditoria_ediciones (
  id bigint generated always as identity primary key,
  tabla_afectada text not null,
  registro_id bigint not null,
  usuario text,
  fecha timestamptz not null default now(),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text
);
create index idx_auditoria_tabla_registro on nativo.auditoria_ediciones (tabla_afectada, registro_id);
create index idx_auditoria_fecha on nativo.auditoria_ediciones (fecha);

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
-- GASTOS: ticket consecutivo, proveedor_id, número de factura
-- ------------------------------------------------------------
alter table nativo.gastos add column ticket integer;
update nativo.gastos g set ticket = sub.rn
from (select id, row_number() over (order by creado_en, id) as rn from nativo.gastos) sub
where g.id = sub.id;
alter table nativo.gastos alter column ticket set not null;
alter table nativo.gastos add constraint gastos_ticket_key unique (ticket);
create index idx_gastos_ticket on nativo.gastos (ticket);

alter table nativo.gastos add column proveedor_id bigint references nativo.proveedores (id);
alter table nativo.gastos add column numero_factura text;

-- ------------------------------------------------------------
-- GASTOS_DETALLE: líneas de artículo por gasto (clon de ventas_detalle)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- INGRESOS (espejo de gastos, sin líneas múltiples) + PAGOS_INGRESOS
-- ------------------------------------------------------------
create table nativo.ingresos (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null default current_date,
  categoria text,
  concepto text,
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

-- ------------------------------------------------------------
-- MOVIMIENTOS_BANCARIOS: nuevo origen 'pago_ingreso'
-- ------------------------------------------------------------
alter table nativo.movimientos_bancarios
  add column pago_ingreso_id bigint references nativo.pagos_ingresos (id) on delete set null;

alter table nativo.movimientos_bancarios drop constraint movimientos_bancarios_origen_check;
alter table nativo.movimientos_bancarios add constraint movimientos_bancarios_origen_check
  check (origen in ('manual', 'pago_venta', 'pago_gasto', 'transferencia', 'pago_ingreso'));

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
-- USUARIOS: nuevo permiso "proveedores" en el default de permisos
-- (no se backfillean filas existentes, igual que se hizo con
-- "financiero" en la migración 001)
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false}'::jsonb;

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

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
