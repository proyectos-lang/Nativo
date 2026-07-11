-- ============================================================
-- Migración 002: Observaciones de uso (Jessica)
-- Costo de envío, fecha real de entrega, transportadora/guía,
-- imágenes de estampado/bordado, PIN de autorización, y fix
-- de integridad en movimientos_bancarios.pago_id.
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- VENTAS: costo de envío, fecha real de entrega, transportadora
-- ------------------------------------------------------------
alter table nativo.ventas add column costo_envio numeric not null default 0;
alter table nativo.ventas add column fecha_entrega_real date;
alter table nativo.ventas add column transportadora text;
alter table nativo.ventas add column numero_guia text;

-- ------------------------------------------------------------
-- VENTAS_DETALLE: imágenes de referencia de estampado/bordado
-- ------------------------------------------------------------
alter table nativo.ventas_detalle add column imagen_estampado_url text;
alter table nativo.ventas_detalle add column imagen_bordado_url text;

-- ------------------------------------------------------------
-- CONFIGURACIÓN DEL SISTEMA (fila única): PIN de autorización
-- ADVERTENCIA: igual que las contraseñas de usuarios, se guarda
-- en texto plano por decisión del propietario del sistema.
-- Cambiar el valor por defecto de inmediato desde
-- Configuración → Seguridad.
-- ------------------------------------------------------------
create table nativo.configuracion_sistema (
  id bigint generated always as identity primary key,
  clave_autorizacion text not null default 'CAMBIAR-1234',
  creado_en timestamptz not null default now()
);
insert into nativo.configuracion_sistema (clave_autorizacion) values ('CAMBIAR-1234');

-- ------------------------------------------------------------
-- FIX DE INTEGRIDAD: movimientos_bancarios.pago_id debe ser
-- on delete cascade (no "set null"), para que al eliminar una
-- venta se elimine también su movimiento bancario y el saldo
-- de la cuenta se corrija automáticamente.
-- ------------------------------------------------------------
alter table nativo.movimientos_bancarios
  drop constraint movimientos_bancarios_pago_id_fkey;
alter table nativo.movimientos_bancarios
  add constraint movimientos_bancarios_pago_id_fkey
  foreign key (pago_id) references nativo.pagos (id) on delete cascade;

-- ------------------------------------------------------------
-- RPC actualizar_entrega: ahora también recibe fecha real de
-- entrega, transportadora y número de guía.
-- ------------------------------------------------------------
drop function if exists nativo.actualizar_entrega(bigint, text, text, text);

create or replace function nativo.actualizar_entrega(
  p_venta_id bigint,
  p_estado_nuevo text,
  p_comentario text,
  p_usuario text,
  p_fecha_entrega_real date default null,
  p_transportadora text default null,
  p_numero_guia text default null
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
      numero_guia = coalesce(p_numero_guia, numero_guia)
  where id = p_venta_id
  returning * into v;

  insert into nativo.historial_entregas (venta_id, estado_anterior, estado_nuevo, comentario, usuario)
  values (p_venta_id, v_anterior, p_estado_nuevo, p_comentario, p_usuario);

  return v;
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
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
