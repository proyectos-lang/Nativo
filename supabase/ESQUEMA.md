# Esquema de Base de Datos — Nativo

> **Documento vivo.** Refleja el estado actual de `supabase/schema.sql` (esquema `nativo` en Supabase/Postgres).
> **Regla de mantenimiento:** todo cambio de esquema (tablas, columnas, índices, funciones) debe actualizar `schema.sql` y este documento **en el mismo commit**.

Convenciones generales:
- Todas las tablas viven en el esquema **`nativo`**, tienen `id bigint generated always as identity` como llave primaria y `creado_en timestamptz default now()`.
- Nombres de tablas y columnas en **español**, ids numéricos (no UUID).
- El acceso desde la app es exclusivamente **server-side** con la `service_role` key (RLS deshabilitado en este esquema; `anon` no tiene privilegios sobre las tablas).

---

## usuarios

Usuarios de la aplicación con permisos por módulo.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null | Nombre completo |
| usuario | text | not null, **unique** | Login |
| correo | text | null | |
| contrasena | text | not null | ⚠️ **TEXTO PLANO** por decisión explícita del propietario del sistema |
| rol | text | not null, default `'usuario'`, check `('admin','usuario')` | `admin` ignora los permisos y ve todo |
| permisos | jsonb | not null, default todos `true` excepto `configuracion` | Banderas: dashboard, ventas, pagos, entregas, seguimiento, prospectos, clientes, configuracion |
| activo | boolean | not null, default `true` | Usuario inactivo no puede iniciar sesión |
| creado_en | timestamptz | not null, default `now()` | |

---

## clientes

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null | |
| empresa | text | null | |
| contacto | text | null | Teléfono |
| ciudad | text | null | |
| departamento | text | null | |
| direccion | text | null | |
| correo | text | null | |
| cedula_nit | text | null | Usada como clave de deduplicación al crear clientes |
| rut | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_clientes_cedula (cedula_nit)`, `idx_clientes_nombre (nombre)`.

---

## productos

Catálogo simple de nombres de producto (se alimenta automáticamente al registrar/editar ventas con productos nuevos).

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| nombre | text | not null, **unique** |
| creado_en | timestamptz | not null, default `now()` |

---

## listas_maestras

Valores de los desplegables de la app, administrables desde Configuración.

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| tipo | text | not null |
| valor | text | not null |
| creado_en | timestamptz | not null, default `now()` |

Restricción: `unique (tipo, valor)`. Índice: `idx_listas_tipo (tipo)`.

Tipos en uso: `vendedora`, `talla`, `color`, `campana`, `motivo_compra`, `profesional`, `estado_entrega`, `canal_venta`, `estado_pago`, `medio_pago`, `tipo_pago`, `sexo`.

---

## ventas (cabecera)

Una fila por pedido/ticket. Toda la trazabilidad (pagos, estados de entrega) cuelga de esta tabla.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| ticket | integer | not null, **unique** | Secuenciales (1, 2, 3…) para ventas del sistema; **6 dígitos aleatorios (≥100000)** para ventas históricas migradas que no tenían ticket |
| fecha | date | not null | Fecha de la venta |
| cliente_id | bigint | null, FK → `clientes(id)` | |
| canal_venta | text | null | |
| campana | text | null | |
| vendedora | text | null | |
| profesional | text | null | |
| motivo_compra | text | null | |
| total_compra | numeric | not null, default 0 | Suma de `ventas_detalle.valor_total` |
| retencion | numeric | not null, default 0 | Acumulada |
| total_a_pagar | numeric | not null, default 0 | **Calculado:** `total_compra - retencion` |
| abono | numeric | not null, default 0 | Acumulado (el detalle vive en `pagos`) |
| saldo | numeric | not null, default 0 | **Calculado:** `total_a_pagar - abono` |
| estado_pago | text | default `'Pendiente'` | `Pendiente` / `Abonado` / `Pagado Total` |
| fecha_pago | date | null | Último pago |
| tipo_pago | text | null | 0/30/60/90 DIAS |
| medio_pago | text | null | |
| observaciones_pago | text | null | |
| estado_entrega | text | default `'En Proceso'` | Estado actual (el historial vive en `historial_entregas`); `Entregado` es el estado terminal |
| fecha_entrega | date | null | |
| comentario_entrega | text | null | Último comentario |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_ventas_ticket (ticket)`, `idx_ventas_cliente (cliente_id)`, `idx_ventas_estado_pago (estado_pago)`, `idx_ventas_estado_entrega (estado_entrega)`, `idx_ventas_fecha (fecha)`.

---

## ventas_detalle

Una fila por producto de cada venta.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` **on delete cascade** | |
| producto | text | not null | |
| codigo_producto | text | null | |
| cantidad | numeric | not null, default 1 | |
| talla | text | null | |
| color | text | null | |
| sexo | text | null | |
| estampado | text | null | |
| bordado | text | null | |
| guia_estampado | text | null | |
| guia_bordado | text | null | |
| valor_unitario | numeric | not null, default 0 | |
| valor_total | numeric | not null, default 0 | `cantidad × valor_unitario` |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_detalle_venta (venta_id)`.

---

## pagos

Trazabilidad de cada abono/retención aplicada a una venta (la migración creó un pago inicial "acumulado" por venta con abono histórico).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` **on delete cascade** | |
| fecha | date | not null, default `current_date` | |
| abono | numeric | not null, default 0 | |
| retencion | numeric | not null, default 0 | |
| comentario | text | null | Medio de pago, referencia, etc. |
| usuario | text | null | Usuario de la app que registró el pago |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_pagos_venta (venta_id)`.

---

## historial_entregas

Un registro por cada cambio de estado de entrega.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` **on delete cascade** | |
| fecha | timestamptz | not null, default `now()` | Momento del cambio |
| estado_anterior | text | null | |
| estado_nuevo | text | not null | |
| comentario | text | null | Notas de envío |
| usuario | text | null | Usuario de la app que hizo el cambio |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_historial_venta (venta_id)`. El "días sin movimiento" del Seguimiento/Dashboard se calcula desde la última fila de esta tabla por venta (respaldo: `ventas.fecha_entrega` → `ventas.fecha`).

---

## prospectos

Clientes por contactar.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| fecha | date | not null, default `current_date` | |
| referido_por | text | null | |
| evento_lugar | text | null | |
| nombre | text | not null | |
| telefono | text | null | |
| correo | text | null | |
| descripcion | text | null | |
| estado | text | not null, default `'Pendiente'` | `Pendiente` / `Contactado` / `Venta Cerrada` / `Descartado` (Venta Cerrada se oculta por defecto en la UI) |
| fecha_contacto | date | null | |
| proximo_contacto | date | null | |
| observaciones | text | null | Historial de notas concatenado con fecha y usuario |
| creado_en | timestamptz | not null, default `now()` | |

---

## Funciones RPC (transaccionales)

### `nativo.registrar_pago(p_venta_id bigint, p_abono numeric, p_retencion numeric, p_fecha date, p_comentario text, p_usuario text) → nativo.ventas`

En una sola transacción: inserta la fila en `pagos` y actualiza la cabecera `ventas` — acumula `abono` y `retencion`, recalcula `total_a_pagar` y `saldo`, actualiza `fecha_pago` y fija `estado_pago` (`Pagado Total` si saldo ≤ 0, si no `Abonado`). Lanza excepción si la venta no existe.

### `nativo.actualizar_entrega(p_venta_id bigint, p_estado_nuevo text, p_comentario text, p_usuario text) → nativo.ventas`

En una sola transacción: lee el `estado_entrega` actual, actualiza la cabecera (`estado_entrega`, `comentario_entrega`) e inserta la fila de auditoría en `historial_entregas` con estado anterior → nuevo. Lanza excepción si la venta no existe.

---

## Permisos de API

- `grant usage` del esquema a `anon`, `authenticated`, `service_role`.
- Privilegios sobre tablas/secuencias/funciones **solo** para `service_role` (incluye default privileges para objetos futuros).
- El esquema `nativo` está agregado a "Exposed schemas" en la configuración de la API de Supabase.
