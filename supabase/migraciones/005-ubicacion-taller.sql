-- ============================================================
-- Migración 005: Ubicación/taller por cambio de estado de entrega.
-- Permite anotar dónde está físicamente la prenda en cada
-- actualización (ej. "Tribey", "Bordados JA", "Madamis") o el
-- motivo cuando está Sin Procesar (ej. "Falta tela").
-- Idempotente (mismo criterio que 004-bitacora.sql).
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table nativo.ventas add column if not exists ubicacion_actual text;
alter table nativo.historial_entregas add column if not exists ubicacion text;

drop function if exists nativo.actualizar_entrega(bigint, text, text, text, date, text, text);

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
-- Semillas: lista maestra de talleres/ubicaciones
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('taller', 'Tribey'),
  ('taller', 'Bordados JA'),
  ('taller', 'Madamis')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos de API
-- ------------------------------------------------------------
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
