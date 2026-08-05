-- ============================================================
-- Migración 032: tercera clave de autorización.
--
-- Editar y eliminar ventas, y editar y anular abonos, aceptan
-- cualquiera de las claves de autorización. Se agrega una tercera
-- para un área más, sin quitarle nada a las dos existentes.
--
-- Nace con un valor de fábrica que hay que cambiar desde
-- Configuración → Seguridad, igual que las otras dos.
-- ⚠️ TEXTO PLANO, mismo criterio que el resto del sistema.
--
-- Idempotente. Ejecutar en: Supabase SQL Editor → Run
-- ============================================================

alter table nativo.configuracion_sistema
  add column if not exists clave_autorizacion_3 text not null default 'CAMBIAR-8199';

grant all on all tables in schema nativo to service_role;
