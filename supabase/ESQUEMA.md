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
| permisos | jsonb | not null, default todos `true` excepto `proveedores`, `configuracion`, `financiero` y `devoluciones` | Banderas: dashboard, ventas, pagos, entregas, seguimiento, prospectos, clientes, proveedores, configuracion, financiero, devoluciones |
| activo | boolean | not null, default `true` | Usuario inactivo no puede iniciar sesión |
| creado_en | timestamptz | not null, default `now()` | |

---

## clientes

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null | Nombre del representante legal |
| empresa | text | null | Nombre de la empresa |
| contacto | text | null | Teléfono |
| ciudad | text | null | |
| departamento | text | null | |
| direccion | text | null | |
| correo | text | null | |
| cedula_nit | text | null | Cédula del representante legal. Usada como clave de deduplicación al crear clientes |
| rut | text | null | RUT / NIT de la empresa (sin el dígito de verificación) |
| digito_verificacion | text | null | Dígito de verificación (DV) del NIT de la empresa, en campo separado de `rut` |
| activo | boolean | not null, default `true` | Un cliente inactivo deja de aparecer en el selector de clientes de Ventas (`clientesActivos()`), pero sigue visible en el módulo Clientes |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_clientes_cedula (cedula_nit)`, `idx_clientes_nombre (nombre)`.

---

## proveedores

Clon de `clientes` para la base de datos de proveedores (usada en Financiero → Gastos).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null | |
| nit | text | null | NIT/identificación |
| contacto | text | null | Teléfono |
| correo | text | null | |
| direccion | text | null | |
| ciudad | text | null | |
| departamento | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_proveedores_nombre (nombre)`, `idx_proveedores_nit (nit)`. Permiso `proveedores` en `usuarios.permisos` (default `false`). `gastos.proveedor_id` referencia esta tabla; `gastos.proveedor` (texto) se conserva como respaldo/legado.

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

Tipos en uso: `vendedora`, `talla`, `color`, `campana`, `motivo_compra`, `profesional`, `estado_entrega`, `canal_venta`, `estado_pago`, `medio_pago`, `tipo_pago`, `sexo`, `categoria_gasto`, `transportadora`, `categoria_ingreso`, `unidad_medida`, `taller`, `causal_devolucion`.

`categoria_ingreso = 'Ventas'` es **informativa/manual** — no reemplaza el flujo automático `origen = 'pago_venta'` que ya alimenta `movimientos_bancarios` desde `registrar_pago`.

El catálogo de **productos** (tabla `productos`) es independiente de `listas_maestras` y se administra en Configuración → Productos.

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
| fecha_entrega | date | null | **Fecha Programada** — la que se pone al registrar la venta |
| fecha_entrega_real | date | null | Fecha en que realmente se entregó al cliente (se compara contra `fecha_entrega` para medir cumplimiento) |
| transportadora | text | null | Lista maestra tipo `transportadora` |
| numero_guia | text | null | Número de guía de envío |
| comentario_entrega | text | null | Último comentario |
| costo_envio | numeric | not null, default 0 | Se suma al `total_compra`/`saldo` — lo paga el cliente |
| ubicacion_actual | text | null | Última ubicación/taller conocido de la prenda (ej. "Tribey", "Bordados JA", "Madamis"), o motivo si está Sin Procesar (ej. "Falta tela"). Lista maestra tipo `taller`. El historial completo de ubicaciones por cambio de estado vive en `historial_entregas.ubicacion` |
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
| imagen_estampado_url | text | null | URL pública en el bucket de Storage `guias` |
| imagen_bordado_url | text | null | URL pública en el bucket de Storage `guias` |
| valor_unitario | numeric | not null, default 0 | |
| valor_total | numeric | not null, default 0 | `cantidad × valor_unitario` |
| listo | boolean | not null, default `false` | Marca de control en Entregas: si esa línea/producto ya está lista, independiente del `estado_entrega` general del pedido |
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
| ubicacion | text | null | Ubicación/taller o motivo registrado en ese cambio de estado específico (lista maestra tipo `taller`) |
| usuario | text | null | Usuario de la app que hizo el cambio |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_historial_venta (venta_id)`. El "días sin movimiento" del Seguimiento/Dashboard se calcula desde la última fila de esta tabla por venta (respaldo: `ventas.fecha_entrega` → `ventas.fecha`).

---

## devoluciones

Cabecera de una devolución, amarrada a su ticket de venta. Una venta puede tener varias devoluciones a lo largo del tiempo.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` | **Sin** `on delete cascade` a propósito: no se debe poder borrar una venta con devoluciones registradas sin antes resolverlas (ver `eliminarVenta`, código `23503`) |
| fecha | date | not null, default `current_date` | |
| usuario | text | null | |
| comentario | text | null | Motivo general de la devolución |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_devoluciones_venta (venta_id)`.

---

## devoluciones_detalle

Una fila por prenda/línea devuelta dentro de una devolución. **No depende de una FK dura hacia `ventas_detalle` para sus datos de negocio** — copia `producto`/`talla`/`color`/`valor_unitario` desde `ventas_detalle` en el momento de crearse, porque `actualizarVenta()` borra y reinserta *todas* las líneas de `ventas_detalle` al editar una venta (no hace diff): una FK dura ahí rompería la edición de cualquier venta con una devolución registrada. `ventas_detalle_id` es una referencia blanda, solo para trazabilidad/navegación en la UI.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| devolucion_id | bigint | not null, FK → `devoluciones(id)` **on delete cascade** | |
| ventas_detalle_id | bigint | null, FK → `ventas_detalle(id)` **on delete set null** | Referencia blanda; no se usa para calcular nada |
| producto | text | not null | Copiado de `ventas_detalle` al crear la devolución |
| talla | text | null | Copiado de `ventas_detalle` |
| color | text | null | Copiado de `ventas_detalle` |
| valor_unitario | numeric | not null, default 0 | Copiado de `ventas_detalle`; usado para calcular `valor_perdido = valor_unitario × cantidad_devuelta` |
| cantidad_devuelta | numeric | not null, default 1 | |
| causal | text | null | Lista maestra tipo `causal_devolucion` (categoría) |
| observacion | text | null | Motivo detallado en texto libre, complementa `causal` |
| recuperable | boolean | not null, default `true` | Decisión tomada al crear la devolución: si es `false`, la prenda no entra al pipeline de reproceso y solo puede resolverse como `Perdida` |
| estado | text | not null, default `'Pendiente'`, check `('Pendiente','En Reproceso','Recuperada','Perdida')` | |
| costo_recuperacion | numeric | null | Solo si `estado = 'Recuperada'` |
| valor_perdido | numeric | null | Solo si `estado = 'Perdida'` — lo que se restó a `ventas.total_compra` |
| gasto_id | bigint | null, FK → `gastos(id)` **on delete set null** | Gasto generado en Financiero (categoría "Reproceso") si `costo_recuperacion > 0` |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_devoluciones_detalle_devolucion (devolucion_id)`, `idx_devoluciones_detalle_estado (estado)`.

---

## devoluciones_historial

Historial de cambios de estado por prenda devuelta (una prenda puede reprocesarse más de una vez si vuelve a fallar), análogo a `historial_entregas`. El "número de reprocesos" se calcula contando filas con `estado_nuevo = 'En Reproceso'`, sin columna contador redundante.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| devolucion_detalle_id | bigint | not null, FK → `devoluciones_detalle(id)` **on delete cascade** | |
| fecha | timestamptz | not null, default `now()` | |
| estado_anterior | text | null | |
| estado_nuevo | text | not null | |
| comentario | text | null | |
| usuario | text | null | |

Índice: `idx_devoluciones_historial_detalle (devolucion_detalle_id)`.

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

## configuracion_sistema

Fila única con ajustes globales del sistema.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| clave_autorizacion | text | not null, default `'CAMBIAR-1234'` | ⚠️ **TEXTO PLANO**. PIN requerido para editar/eliminar ventas (Configuración → Seguridad la cambia) |
| clave_contadora | text | not null, default `'CAMBIAR-5678'` | ⚠️ **TEXTO PLANO**. Clave requerida para editar gastos/ingresos en Financiero (Configuración → Seguridad la cambia, solo admin) |
| creado_en | timestamptz | not null, default `now()` | |

---

## bitacora

Bitácora general de trazabilidad de **todas** las mutaciones del sistema (ventas, pagos, entregas, financiero, clientes, proveedores, usuarios, catálogos, prospectos). Cada evento guarda quién, cuándo, qué acción y — cuando aplica (crear/editar/eliminar) — el snapshot completo antes/después, no solo el último editor. Antes de la migración 004 esta tabla se llamaba `auditoria_ediciones` y solo cubría ediciones de `gastos`/`ingresos`; se generalizó en vez de crear una tabla paralela, así que las filas históricas siguen siendo válidas (columnas nuevas con default).

Se escribe exclusivamente desde el helper `registrarBitacora()` (`src/lib/pin.ts`/`src/lib/bitacora.ts`), llamado al final de cada server action de mutación, **después** de que la operación principal fue exitosa — un fallo al escribir la bitácora nunca revierte ni interrumpe la transacción de negocio (best-effort).

Se consume de dos formas: (1) el módulo **Trazabilidad** (`/trazabilidad`, solo administradores) muestra el histórico completo sin filtro de fecha por defecto; (2) el bloque "Historial de cambios" en Financiero → Gastos/Ingresos sigue mostrando solo los eventos de edición de ese registro específico (`auditoriaPorTabla` filtra `accion = 'editar'`).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| tabla_afectada | text | not null | Nombre de la entidad afectada: `ventas`, `clientes`, `proveedores`, `usuarios`, `gastos`, `ingresos`, `cuentas_bancarias`, `listas_maestras`, `productos`, `prospectos`, `configuracion_sistema`, etc. |
| registro_id | bigint | not null | id de la fila afectada en esa entidad |
| usuario | text | null | Quién hizo la acción |
| fecha | timestamptz | not null, default `now()` | Cuándo, con hora exacta |
| modulo | text | not null, default `'financiero'` | Módulo de la app donde ocurrió: `ventas`, `pagos`, `entregas`, `financiero`, `clientes`, `proveedores`, `configuracion`, `prospectos` |
| accion | text | not null, default `'editar'` | `crear` \| `editar` \| `eliminar` \| `pagar` \| `cobrar` \| `transferir` \| `cambiar_estado` \| `cambiar_clave` |
| descripcion | text | not null, default `''` | Resumen legible del evento, ej. `"Venta #123 — $150.000"` |
| datos_anteriores | jsonb | null | Snapshot antes del cambio (editar/eliminar). Nunca incluye contraseñas ni claves. |
| datos_nuevos | jsonb | null | Snapshot después del cambio (crear/editar) |
| motivo | text | null | Motivo opcional (usado hoy por la edición de gastos/ingresos) |

Índices: `idx_bitacora_entidad (tabla_afectada, registro_id)`, `idx_bitacora_fecha (fecha)`, `idx_bitacora_usuario (usuario)`, `idx_bitacora_modulo (modulo)`, `idx_bitacora_accion (accion)`. Sin `check constraint` en `modulo`/`accion` (mismo criterio que `tabla_afectada`, texto libre).

No incluye eventos de inicio/cierre de sesión — solo mutaciones de datos.

Índices: `idx_auditoria_tabla_registro (tabla_afectada, registro_id)`, `idx_auditoria_fecha (fecha)`.

---

## cuentas_bancarias

Cuentas de la empresa (bancos y caja). El saldo actual **no se almacena**: se calcula `saldo_inicial + ingresos − egresos` de `movimientos_bancarios`.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null | |
| banco | text | null | |
| numero_cuenta | text | null | |
| saldo_inicial | numeric | not null, default 0 | Saldo al momento de crear la cuenta |
| activa | boolean | not null, default `true` | Las inactivas no aparecen en selectores |
| creado_en | timestamptz | not null, default `now()` | |

---

## movimientos_bancarios

Libro de cada cuenta: todo ingreso/egreso queda registrado aquí.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| cuenta_id | bigint | not null, FK → `cuentas_bancarias(id)` | |
| fecha | date | not null, default `current_date` | |
| tipo | text | not null, check `('ingreso','egreso')` | |
| origen | text | not null, default `'manual'`, check `('manual','pago_venta','pago_gasto','transferencia','pago_ingreso','devolucion_venta')` | `devolucion_venta` = reembolso al cliente generado por `registrar_devolucion_perdida()` cuando una pérdida deja el saldo de la venta en negativo |
| monto | numeric | not null, check `> 0` | Siempre positivo; el signo lo da `tipo` |
| concepto | text | null | |
| pago_id | bigint | null, FK → `pagos(id)` **on delete cascade** | Cuando origen = pago_venta — al eliminar la venta/pago, el movimiento bancario también se elimina y el saldo de la cuenta se corrige |
| pago_gasto_id | bigint | null, FK → `pagos_gastos(id)` on delete set null | Cuando origen = pago_gasto |
| pago_ingreso_id | bigint | null, FK → `pagos_ingresos(id)` on delete set null | Cuando origen = pago_ingreso |
| movimiento_relacionado_id | bigint | null, FK → `movimientos_bancarios(id)` | Enlaza los 2 asientos de una transferencia |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_movimientos_cuenta (cuenta_id)`, `idx_movimientos_fecha (fecha)`.

---

## gastos

Gastos y costos causados (cuentas por pagar). Admite abonos parciales vía `pagos_gastos`.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| ticket | integer | not null, **unique** | Consecutivo (`max(ticket)+1` calculado en la server action, sin resguardo de históricos) |
| fecha | date | not null, default `current_date` | Fecha de causación |
| tipo | text | not null, check `('Gasto','Costo')` | |
| categoria | text | null | Lista maestra tipo `categoria_gasto` |
| proveedor | text | null | Texto de respaldo/legado (gastos creados antes de `proveedores`) |
| proveedor_id | bigint | null, FK → `proveedores(id)` | Proveedor seleccionado del catálogo |
| numero_factura | text | null | Número de factura de compra |
| descripcion | text | null | Legado — el formulario actual ya no la usa, reemplazada por `gastos_detalle` |
| monto | numeric | not null, default 0 | **Calculado:** suma de `gastos_detalle.valor_total` |
| abonado | numeric | not null, default 0 | Acumulado de `pagos_gastos` |
| saldo | numeric | not null, default 0 | **Calculado:** `monto − abonado` |
| estado | text | not null, default `'Pendiente'`, check `('Pendiente','Abonado','Pagado')` | |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_gastos_estado (estado)`, `idx_gastos_fecha (fecha)`, `idx_gastos_ticket (ticket)`. Solo se puede **editar** (nunca eliminar), vía `editarGasto` con `clave_contadora` — cada edición queda en `bitacora`.

---

## gastos_detalle

Líneas de artículo de cada gasto (clon de `ventas_detalle`), pensado para alimentar un futuro módulo de inventario.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| gasto_id | bigint | not null, FK → `gastos(id)` **on delete cascade** | |
| cantidad | numeric | not null, default 1 | |
| unidad_medida | text | null | Lista maestra tipo `unidad_medida` |
| articulo | text | not null | |
| precio_unitario | numeric | not null, default 0 | |
| valor_total | numeric | not null, default 0 | `cantidad × precio_unitario` |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_gastos_detalle_gasto (gasto_id)`. Gastos históricos (creados antes de esta migración) no tienen líneas: la UI usa `descripcion`/`categoria` como fallback.

---

## pagos_gastos

Cada abono a un gasto (siempre sale de una cuenta).

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| gasto_id | bigint | not null, FK → `gastos(id)` on delete cascade |
| cuenta_id | bigint | not null, FK → `cuentas_bancarias(id)` |
| fecha | date | not null, default `current_date` |
| monto | numeric | not null, default 0 |
| comentario | text | null |
| usuario | text | null |
| creado_en | timestamptz | not null, default `now()` |

Índice: `idx_pagos_gastos_gasto (gasto_id)`.

> **Nota:** la tabla `pagos` (ventas) tiene además la columna `cuenta_id bigint null` FK → `cuentas_bancarias(id)`: la cuenta a la que entró el abono. El permiso `financiero` existe en `usuarios.permisos` (default `false` — solo admins ven el módulo hasta activarlo).

---

## ingresos

Espejo de `gastos` para dinero que entra (arriendo, servicios públicos, préstamos, etc. — distinto del flujo automático de pagos de venta). Admite cobro parcial vía `pagos_ingresos`.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| ticket | integer | not null, **unique** | Consecutivo propio, independiente del de `gastos` |
| fecha | date | not null, default `current_date` | Fecha de causación |
| categoria | text | null | Lista maestra tipo `categoria_ingreso` |
| concepto | text | null | Descripción libre (a diferencia de gastos, sin líneas múltiples) |
| monto | numeric | not null, default 0 | |
| cobrado | numeric | not null, default 0 | Acumulado de `pagos_ingresos` |
| saldo | numeric | not null, default 0 | **Calculado:** `monto − cobrado` |
| estado | text | not null, default `'Pendiente'`, check `('Pendiente','Abonado','Cobrado')` | |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_ingresos_estado (estado)`, `idx_ingresos_fecha (fecha)`, `idx_ingresos_ticket (ticket)`. Solo se puede **editar** (nunca eliminar), vía `editarIngreso` con `clave_contadora` — cada edición queda en `bitacora`.

---

## pagos_ingresos

Cada cobro de un ingreso (siempre entra a una cuenta). Clon de `pagos_gastos`.

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| ingreso_id | bigint | not null, FK → `ingresos(id)` on delete cascade |
| cuenta_id | bigint | not null, FK → `cuentas_bancarias(id)` |
| fecha | date | not null, default `current_date` |
| monto | numeric | not null, default 0 |
| comentario | text | null |
| usuario | text | null |
| creado_en | timestamptz | not null, default `now()` |

Índice: `idx_pagos_ingresos_ingreso (ingreso_id)`.

---

## Funciones RPC (transaccionales)

### `nativo.registrar_pago(p_venta_id bigint, p_abono numeric, p_retencion numeric, p_fecha date, p_comentario text, p_usuario text, p_cuenta_id bigint default null) → nativo.ventas`

En una sola transacción: inserta la fila en `pagos` (con `cuenta_id`) y actualiza la cabecera `ventas` — acumula `abono` y `retencion`, recalcula `total_a_pagar` y `saldo`, actualiza `fecha_pago` y fija `estado_pago` (`Pagado Total` si saldo ≤ 0, si no `Abonado`). Si viene `p_cuenta_id` y `p_abono > 0`, inserta el movimiento bancario de **ingreso** (origen `pago_venta`) por el monto del abono — la retención no es entrada de caja. Lanza excepción si la venta no existe.

### `nativo.pagar_gasto(p_gasto_id bigint, p_cuenta_id bigint, p_monto numeric, p_fecha date, p_comentario text, p_usuario text) → nativo.gastos`

En una sola transacción: inserta `pagos_gastos`, actualiza el gasto (acumula `abonado`, recalcula `saldo`, fija `estado` — `Pagado` si saldo ≤ 0, si no `Abonado`) e inserta el movimiento bancario de **egreso** (origen `pago_gasto`). Valida monto > 0 y cuenta obligatoria.

### `nativo.transferir_cuentas(p_origen bigint, p_destino bigint, p_monto numeric, p_fecha date, p_concepto text, p_usuario text) → void`

En una sola transacción: inserta el **egreso** en la cuenta origen y el **ingreso** en la destino (origen `transferencia`), enlazados entre sí vía `movimiento_relacionado_id`. Valida monto > 0, cuentas distintas y existentes.

### `nativo.actualizar_entrega(p_venta_id bigint, p_estado_nuevo text, p_comentario text, p_usuario text, p_fecha_entrega_real date default null, p_transportadora text default null, p_numero_guia text default null, p_ubicacion text default null) → nativo.ventas`

En una sola transacción: lee el `estado_entrega` actual, actualiza la cabecera (`estado_entrega`, `comentario_entrega`, y si vienen, `fecha_entrega_real`, `transportadora`, `numero_guia`, `ubicacion_actual`) e inserta la fila de auditoría en `historial_entregas` con estado anterior → nuevo y la `ubicacion` de ese cambio. Lanza excepción si la venta no existe.

### `nativo.cobrar_ingreso(p_ingreso_id bigint, p_cuenta_id bigint, p_monto numeric, p_fecha date, p_comentario text, p_usuario text) → nativo.ingresos`

Espejo exacto de `pagar_gasto`: en una sola transacción inserta `pagos_ingresos`, actualiza el ingreso (acumula `cobrado`, recalcula `saldo`, fija `estado` — `Cobrado` si saldo ≤ 0, si no `Abonado`) e inserta el movimiento bancario de **ingreso** (origen `pago_ingreso`). Valida monto > 0 y cuenta obligatoria.

No existen RPCs de edición: `editarGasto`/`editarIngreso` se implementan como statements directos en la server action (igual que `actualizarVenta`), protegidos por `verificarPinContadora` y registrando el cambio en `bitacora`.

### `nativo.registrar_devolucion_perdida(p_devolucion_detalle_id bigint, p_valor_perdido numeric, p_cuenta_id bigint default null, p_fecha date default current_date, p_comentario text default null, p_usuario text default null) → nativo.ventas`

En una sola transacción: resta `p_valor_perdido` de `ventas.total_compra` de la venta dueña del detalle, recalcula `total_a_pagar`/`saldo` y `estado_pago` con la misma regla que `actualizarVenta()` (`saldo ≤ 0 && total > 0 → 'Pagado Total'`, si no `abono > 0 → 'Abonado'`, si no `'Pendiente'`). Si el nuevo saldo queda negativo (el cliente ya había pagado de más), exige `p_cuenta_id` (si no viene, lanza excepción pidiéndola), reduce `abono` en esa diferencia, fija `saldo = 0` y `estado_pago = 'Pagado Total'`, e inserta el movimiento bancario de **egreso** (origen `devolucion_venta`) por el reembolso. Siempre actualiza `devoluciones_detalle.estado = 'Perdida'` + `valor_perdido`, e inserta la fila correspondiente en `devoluciones_historial`. Lanza excepción si el detalle no existe o ya fue resuelto (`Recuperada`/`Perdida`).

---

## Permisos de API

- `grant usage` del esquema a `anon`, `authenticated`, `service_role`.
- Privilegios sobre tablas/secuencias/funciones **solo** para `service_role` (incluye default privileges para objetos futuros).
- El esquema `nativo` está agregado a "Exposed schemas" en la configuración de la API de Supabase.

## Storage

- Bucket **`guias`** (público): imágenes de referencia de estampado/bordado por línea de producto. Las URLs públicas se guardan en `ventas_detalle.imagen_estampado_url` / `imagen_bordado_url`. Subidas siempre server-side (`subirImagenLinea`, permiso `ventas`), nunca directo desde el navegador.
