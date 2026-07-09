# Sistema de Control de Pedidos y Despachos Nativo

Aplicación web para gestión de ventas, pagos, entregas, seguimiento de pedidos y prospectos.

**Stack**: Next.js (App Router) · TypeScript · shadcn/ui · Supabase (Postgres, esquema `nativo`) · Vercel

## Módulos

| Módulo | Descripción |
|---|---|
| Dashboard | KPIs (por cobrar, pendientes de entrega, alertas 10+ días, ventas del mes), gráfico de 12 meses, top productos/clientes |
| Ventas | Registro de ventas (cliente + productos + pago) e historial con filtros y export a Excel |
| Pagos | Pedidos pendientes por pagar, registro de abonos/retenciones con historial por pedido |
| Entregas | Estados de entrega con historial completo (timeline) por pedido |
| Seguimiento | Trazabilidad completa: venta → pagos → estados, con alerta por días sin movimiento |
| Prospectos | Clientes por contactar con seguimiento de estado |
| Clientes | Directorio editable de clientes |
| Configuración | Usuarios con permisos por módulo y administración de listas maestras |

## Configuración local

1. `npm install`
2. Crear `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # secreta, solo servidor
   SESSION_SECRET=...              # aleatorio, firma las cookies de sesión
   ```
3. Ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.
4. En Supabase → Settings → API → Exposed schemas: agregar `nativo`.
5. `npm run dev`

## Migración de datos (Google Sheets → Supabase)

1. Exportar el Google Sheet: Archivo → Descargar → `.xlsx` → guardar como `datos/registro-ventas.xlsx`.
2. `npx tsx scripts/migrar.ts --limpiar`
3. Revisar el reporte de conciliación que imprime el script.

Variables opcionales para el usuario administrador inicial: `ADMIN_USUARIO`, `ADMIN_CONTRASENA`.

## Notas de seguridad

- Todo el acceso a datos es **server-side** (service role); el navegador nunca habla directo con Supabase.
- ⚠️ La tabla `usuarios` guarda contraseñas **en texto plano** por decisión explícita del propietario del sistema.
