-- ============================================================
-- Migración 021: Módulo "Solicitudes Internas" — tareas/peticiones
-- entre miembros del equipo, con estado, conversación cronológica
-- (append-only), adjuntos y trazabilidad. Nunca se elimina una
-- solicitud; solo cambia de estado (Finalizada/Cancelada).
-- Permiso "solicitudes" habilitado por defecto para TODOS.
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

create table if not exists nativo.solicitudes (
  id bigint generated always as identity primary key,
  numero integer not null,
  fecha_creacion timestamptz not null default now(),
  solicitado_por_id bigint references nativo.usuarios (id) on delete set null,
  solicitado_por text,
  responsable_id bigint references nativo.usuarios (id) on delete set null,
  responsable text,
  area text,
  titulo text not null,
  descripcion text,
  prioridad text not null default 'Media'
    check (prioridad in ('Baja', 'Media', 'Alta', 'Urgente')),
  fecha_limite date,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En proceso', 'Esperando información', 'Esperando aprobación', 'Finalizada', 'Cancelada')),
  fecha_finalizacion timestamptz,
  observaciones_finales text,
  usuario text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_solicitudes_estado on nativo.solicitudes (estado);
create index if not exists idx_solicitudes_responsable on nativo.solicitudes (responsable_id);
create index if not exists idx_solicitudes_solicitante on nativo.solicitudes (solicitado_por_id);

-- Conversación + cambios de estado (append-only, nunca se borra)
create table if not exists nativo.solicitudes_historial (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references nativo.solicitudes (id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null default 'comentario'
    check (tipo in ('creacion', 'comentario', 'cambio_estado', 'reasignacion', 'finalizacion')),
  estado_anterior text,
  estado_nuevo text,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_solicitudes_historial_solicitud on nativo.solicitudes_historial (solicitud_id);

-- Adjuntos (imágenes, PDF, Excel, etc.) — URL pública en Storage
create table if not exists nativo.solicitudes_adjuntos (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references nativo.solicitudes (id) on delete cascade,
  url text not null,
  nombre text,
  tipo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_solicitudes_adjuntos_solicitud on nativo.solicitudes_adjuntos (solicitud_id);

-- ------------------------------------------------------------
-- USUARIOS: permiso "solicitudes" (default TRUE para todos)
-- ------------------------------------------------------------
alter table nativo.usuarios
  alter column permisos set default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false, "compras": false, "activos": false, "solicitudes": true}'::jsonb;

-- Habilitar solicitudes en los usuarios existentes (a todos)
update nativo.usuarios
  set permisos = permisos || '{"solicitudes": true}'::jsonb
  where not (permisos ? 'solicitudes');

-- ------------------------------------------------------------
-- Semillas: áreas de solicitudes
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('area_solicitud', 'Contabilidad'),
  ('area_solicitud', 'Logística'),
  ('area_solicitud', 'Producción'),
  ('area_solicitud', 'Comercial'),
  ('area_solicitud', 'Marketing'),
  ('area_solicitud', 'Gerencia')
on conflict do nothing;

grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
