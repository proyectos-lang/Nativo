-- ============================================================
-- Migración 025: notificaciones internas + suscripciones push.
-- Alimentan la campanita de la cabecera y las notificaciones del
-- sistema operativo (Web Push). Hoy solo se notifica un evento:
-- "solicitud nueva asignada a mí" (incluye reasignaciones).
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

create table if not exists nativo.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references nativo.usuarios (id) on delete cascade,
  tipo text not null default 'solicitud_asignada',
  titulo text not null,
  cuerpo text,
  url text,
  solicitud_id bigint references nativo.solicitudes (id) on delete cascade,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index if not exists idx_notificaciones_usuario on nativo.notificaciones (usuario_id, leida);
create index if not exists idx_notificaciones_fecha on nativo.notificaciones (usuario_id, creado_en desc);

-- Suscripciones de Web Push por dispositivo/navegador. El endpoint es único:
-- permite hacer upsert cuando el navegador renueva la suscripción.
create table if not exists nativo.push_suscripciones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references nativo.usuarios (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_push_usuario on nativo.push_suscripciones (usuario_id);

-- Para la vista de calendario de tareas
create index if not exists idx_solicitudes_fecha_limite on nativo.solicitudes (fecha_limite);

grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
