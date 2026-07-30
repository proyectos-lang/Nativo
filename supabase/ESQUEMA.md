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
| permisos | jsonb | not null, default todos `true` excepto `proveedores`, `configuracion`, `financiero`, `devoluciones`, `inventario`, `compras`, `activos` y `costos` (`solicitudes` es `true` por defecto: todos crean solicitudes) | Banderas: dashboard, ventas, pagos, entregas, seguimiento, prospectos, clientes, proveedores, configuracion, financiero, devoluciones, inventario, compras, activos, solicitudes, costos |
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
| tipo | text | null | Tipo/categoría del proveedor (Telas, Diseñadores gráficos, etc.). Lista maestra `tipo_proveedor` |
| contacto | text | null | Teléfono |
| correo | text | null | |
| direccion | text | null | |
| ciudad | text | null | |
| departamento | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_proveedores_nombre (nombre)`, `idx_proveedores_nit (nit)`. Permiso `proveedores` en `usuarios.permisos` (default `false`). `gastos.proveedor_id` referencia esta tabla; `gastos.proveedor` (texto) se conserva como respaldo/legado.

---

## productos

Catálogo de referencias/variantes del inventario (una fila = una referencia; talla/color/manga hacen parte de la identidad; el **SKU** es la clave real). Sigue alimentándose automáticamente al registrar ventas con productos nuevos en texto libre — esos productos quedan con `controla_inventario = false` (sin stock) hasta "enrolarse" desde el módulo Inventario.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null, **unique** | Las variantes necesitan nombres distintos (convención: "Camiseta Polo H — M — Blanca") |
| sku | text | null, **unique** (índice parcial) | Código interno de la referencia |
| codigo_barras | text | null | |
| categoria | text | null | Lista maestra tipo `categoria_producto` |
| subcategoria | text | null | |
| sexo | text | null | Lista maestra `sexo` |
| talla | text | null | Lista maestra `talla` |
| color | text | null | Lista maestra `color` |
| manga | text | null | Lista maestra `tipo_manga` |
| unidad_medida | text | not null, default `'Unidad'` | Lista maestra `unidad_medida` |
| precio_compra | numeric | not null, default 0 | Último precio de compra (lo actualiza `ingresar_inventario`) |
| precio_venta_antes_iva | numeric | not null, default 0 | |
| iva_porcentaje | numeric | not null, default 0 | |
| precio_venta | numeric | not null, default 0 | **Calculado server-side:** `antes_iva × (1 + iva/100)` |
| costo_promedio | numeric | not null, default 0 | Promedio ponderado, recalculado en cada ingreso |
| es_servicio | boolean | not null, default `false` | Se vende como producto pero **nunca** mueve inventario |
| controla_inventario | boolean | not null, default `false` | Solo los enrolados participan en existencias/kardex/reservas |
| estado | text | not null, default `'Activo'`, check `('Activo','Descontinuado')` | |
| fecha_vencimiento | date | null | Opcional — reporte de próximos a vencer |
| stock_minimo | numeric | not null, default 0 | Editable por referencia (alertas) |
| stock_maximo | numeric | null | null = sin máximo |
| creado_en | timestamptz | not null, default `now()` | |

Constraint: `chk_servicio_sin_inventario` — un servicio no puede controlar inventario. Índices: `idx_productos_sku` (parcial), `idx_productos_categoria`, `idx_productos_estado`.

---

## recetas

**Costos y Recetas (explosión de materiales / MRP).** Una receta por producto de venta: define de qué está hecho y cuánto cuesta producirlo. Es lo que permite calcular *venta − costo = utilidad*, algo que `productos.costo_promedio` no puede hacer porque solo se alimenta al **comprar** el producto terminado. Módulo `/costos`, permiso `costos` (apagado por defecto: los márgenes son sensibles).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| producto_id | bigint | not null, **unique**, FK → `productos(id)` **on delete cascade** | Un producto tiene a lo sumo una receta |
| notas | text | null | |
| costo_total | numeric | not null, default 0 | Suma de las líneas. **Calculado y guardado por la server action**, no es columna generada (mismo criterio que `valor_total` en el resto del repo) |
| usuario | text | null | |
| creado_en / actualizado_en | timestamptz | not null, default `now()` | |

Índice: `idx_recetas_producto`.

## recetas_materiales

Las líneas de la receta. `tipo` permite que la mano de obra y los servicios externos (bordado, estampado) entren como líneas más, sin necesidad de columnas aparte.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| receta_id | bigint | not null, FK → `recetas(id)` **on delete cascade** | |
| tipo | text | not null, default `'Material'`, check `('Material','Mano de obra','Servicio','Otro')` | |
| insumo_id | bigint | null, FK → `insumos(id)` **on delete set null** | Cuando el material es un insumo del inventario de insumos (el caso normal). Migración 027 |
| material_producto_id | bigint | null, FK → `productos(id)` **on delete set null** | Cuando el material es un producto del catálogo que se compra terminado (una camiseta en blanco que luego se estampa). Permite proponer su costo real y refrescarlo después |
| material | text | not null | Nombre copiado del catálogo o texto libre (FK blanda + texto, igual que el kardex) |
| cantidad | numeric | not null, default 1, check `> 0` | Consumo por unidad de producto |
| unidad_medida | text | null | Se propone la del producto del catálogo |
| costo_unitario | numeric | not null, default 0 | Se propone desde el insumo (`insumos.costo_unitario`) o desde el producto (`costo_promedio`, o `precio_compra` si aún no hay movimientos) y **se puede sobrescribir** |
| costo_total | numeric | not null, default 0 | `cantidad × costo_unitario`, calculado por la acción |
| notas | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_recetas_materiales_receta`, `idx_recetas_materiales_producto`, `idx_recetas_materiales_insumo`.

Al guardar una receta las líneas se **borran y reinsertan** completas (mismo criterio que `ventas_detalle` en `actualizarVenta`). La acción `recalcularCostosDesdeInventario()` refresca el `costo_unitario` de todas las líneas que apuntan a un insumo **o** a un producto del catálogo, con el costo vigente de cada uno.

---

## insumos

**Inventario de insumos** (parte del módulo Costos y Recetas, migración 027). Telas, hilos, botones, empaque, mano de obra: lo que se consume al fabricar. Viven **aparte de `productos`** a propósito — el catálogo completo de `productos` alimenta los selectores de Ventas, así que meter las telas ahí las volvería vendibles. Llevan existencia y movimientos propios, más simples que el kardex de productos: **un solo saldo global, sin ubicaciones/bodegas**.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| nombre | text | not null, **unique** | |
| codigo | text | null, **unique** (índice parcial) | Código interno opcional |
| categoria | text | null | Lista maestra `categoria_insumo` (semillas: Telas, Hilos, Botones y cierres, Etiquetas y marquillas, Empaque, Estampado, Bordado, Mano de obra, Otros) |
| unidad_medida | text | not null, default `'Unidad'` | Lista maestra `unidad_medida` |
| costo_unitario | numeric | not null, default 0 | **Costo promedio ponderado**, recalculado por `mover_insumo` en cada entrada. Es el costo que usan las recetas |
| ultimo_costo | numeric | not null, default 0 | Costo de la última entrada con costo explícito |
| existencia | numeric | not null, default 0, check `>= 0` | Saldo global. **Nunca negativa**, igual criterio que `inventario_existencias` |
| stock_minimo | numeric | not null, default 0 | Alerta de insumo bajo |
| proveedor_id / proveedor | bigint / text | null, FK → `proveedores(id)` set null | Último proveedor (FK blanda + nombre copiado) |
| notas | text | null | |
| activo | boolean | not null, default `true` | Un insumo inactivo no aparece en el selector de materiales |
| creado_en / actualizado_en | timestamptz | not null, default `now()` | |

Índices: `idx_insumos_codigo` (parcial), `idx_insumos_categoria`, `idx_insumos_activo`. La existencia y el costo **solo** se modifican vía el RPC `mover_insumo` (nunca con updates directos desde la app); el resto de la ficha sí se edita directo.

## insumos_movimientos

Libro de movimientos de insumos: **nunca se borra**. FK blanda (`on delete set null`) + nombre copiado, mismo criterio que `inventario_movimientos`.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| fecha | timestamptz | not null, default `now()` | |
| tipo | text | not null, check `('entrada','salida','ajuste')` | |
| insumo_id / insumo | bigint / text | null / not null | FK blanda + nombre copiado |
| cantidad | numeric | not null | **Siempre con signo** (+entra / −sale); en `ajuste` es la diferencia |
| costo_unitario | numeric | null | Costo del movimiento (histórico) |
| costo_total | numeric | null | `abs(cantidad) × costo_unitario` |
| saldo_despues | numeric | not null | Existencia tras el movimiento |
| proveedor_id / proveedor | bigint / text | null | |
| numero_factura / referencia / motivo / usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `(insumo_id, fecha desc)`, `tipo`, `fecha desc`.

---

## listas_maestras

Valores de los desplegables de la app, administrables desde Configuración.

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| tipo | text | not null |
| valor | text | not null |
| activo | boolean | not null, default `true` |
| creado_en | timestamptz | not null, default `now()` |

Restricción: `unique (tipo, valor)`. Índice: `idx_listas_tipo (tipo)`. Los valores se administran por línea en Configuración → Listas Maestras (editar, activar/inactivar, eliminar). Un valor **inactivo** desaparece de los selectores (`listasMaestras()` filtra `activo = true`) pero los registros históricos guardan el texto copiado y no cambian; renombrar un valor tampoco altera registros pasados.

Tipos en uso: `vendedora`, `talla`, `color`, `campana`, `motivo_compra`, `profesional`, `estado_entrega`, `canal_venta`, `estado_pago`, `medio_pago`, `tipo_pago`, `sexo`, `categoria_gasto`, `transportadora`, `categoria_ingreso`, `unidad_medida`, `taller`, `causal_devolucion`, `categoria_producto`, `tipo_manga`, `motivo_ajuste`, `motivo_traslado`, `categoria_activo`, `ubicacion_activo`, `motivo_baja_activo`, `area_activo`, `estado_activo`, `tipo_proveedor`, `area_solicitud`.

`categoria_ingreso = 'Ventas'` es **informativa/manual** — no reemplaza el flujo automático `origen = 'pago_venta'` que ya alimenta `movimientos_bancarios` desde `registrar_pago`.

El catálogo de **productos** (tabla `productos`) es independiente de `listas_maestras` y se administra desde el módulo Inventario → Productos (la pantalla Configuración → Productos, redundante con esta, fue eliminada).

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
| orden_compra_cliente | text | null | Orden de compra / pedido que envía el **cliente**, para relacionarla al facturar o cobrar. No confundir con el módulo `ordenes_compra` (órdenes de Nativo a sus proveedores). Índice `idx_ventas_orden_compra` |
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
| costo_unitario | numeric | null | **Costo congelado** al vender, tomado de la receta del producto (módulo Costos y Recetas). `null` = venta anterior a ese módulo o producto sin receta |
| costo_total | numeric | null | `cantidad × costo_unitario` |
| listo | boolean | not null, default `false` | Marca de control en Entregas: si esa línea/producto ya está lista, independiente del `estado_entrega` general del pedido |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_detalle_venta (venta_id)`. El costo se congela a propósito: actualizar una receta **no** altera la utilidad de las ventas ya registradas. Cuando viene en `null`, los informes caen a la receta actual; si el producto no tiene receta, la utilidad queda vacía (nunca se asume costo cero).

---

## pagos

Trazabilidad de cada abono/retención aplicada a una venta (la migración creó un pago inicial "acumulado" por venta con abono histórico).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` **on delete cascade** | |
| fecha | date | not null, default `current_date` | |
| abono | numeric | not null, default 0 | Efectivo recibido (lo que entra a la cuenta bancaria) |
| retencion | numeric | not null, default 0 | **Total** de retenciones del pago (= retefuente + reteiva + reteica) |
| retefuente | numeric | not null, default 0 | Retención en la fuente (monto) |
| reteiva | numeric | not null, default 0 | Retención de IVA (monto) |
| reteica | numeric | not null, default 0 | Retención de ICA (monto) |
| comentario | text | null | Medio de pago, referencia, etc. |
| usuario | text | null | Usuario de la app que registró el pago |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_pagos_venta (venta_id)`. Las retenciones reducen el saldo de la venta pero **no son efectivo**: al banco solo entra `abono`.

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

## inventario_ubicaciones

Ubicaciones físicas del inventario (semillas: Bodega, Exhibición; ampliable).

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| nombre | text | not null, **unique** |
| activa | boolean | not null, default `true` |
| creado_en | timestamptz | not null, default `now()` |

---

## inventario_existencias

Stock físico actual: una fila por producto + ubicación. **Nunca negativa** (check `cantidad >= 0`) — decisión de negocio: sin inventario negativo; los faltantes de "venta sin inventario" viven como `cantidad_pendiente` en `inventario_reservas`.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| producto_id | bigint | not null, FK → `productos(id)` **on delete cascade** | |
| ubicacion_id | bigint | not null, FK → `inventario_ubicaciones(id)` | |
| cantidad | numeric | not null, default 0, check `>= 0` | |
| actualizado_en | timestamptz | not null, default `now()` | |

Restricción: `unique (producto_id, ubicacion_id)`. Índice: `idx_existencias_producto`. Solo se modifica vía los RPCs de inventario (nunca updates directos desde la app).

---

## inventario_movimientos (kardex)

Libro de inventario: todo movimiento queda registrado y **nunca se borra**. FKs blandas (`on delete set null`) + texto copiado (mismo criterio que `devoluciones_detalle`), para que el historial sobreviva a ediciones/eliminaciones.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| fecha | timestamptz | not null, default `now()` | |
| tipo | text | not null, check `('inventario_inicial','entrada','devolucion','salida','venta','traslado_salida','traslado_entrada','ajuste')` | |
| producto_id | bigint | null, FK → `productos(id)` set null | |
| producto | text | not null | "SKU — Nombre" copiado |
| ubicacion_id / ubicacion | bigint / text | null | FK blanda + nombre copiado |
| cantidad | numeric | not null | **Siempre con signo** (+entra / −sale); en `ajuste` es la diferencia |
| costo_unitario | numeric | null | Costo del movimiento (histórico — los reportes de rentabilidad usan este, no el costo actual) |
| saldo_despues | numeric | not null | Stock TOTAL del producto (todas las ubicaciones) tras el movimiento |
| referencia | text | null | 'Ticket #123', 'OC #4', 'Arqueo #2', factura, etc. |
| venta_id / proveedor_id | bigint | null, FK set null | |
| numero_factura / lote / motivo / usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `(producto_id, fecha)`, `tipo`, `fecha`, `venta_id`. Las consultas de la app usan límite/paginación (el kardex crece indefinidamente).

---

## inventario_reservas

Stock comprometido por ventas (se crea al registrar/editar una venta con productos inventariados; se convierte en salida física al despachar — Fase 4). **No depende de `ventas_detalle.id`** (esos ids cambian en cada edición de venta). `cantidad_pendiente` = parte sin respaldo físico ("pendiente por surtir" de una venta sin inventario), surtida automáticamente FIFO al ingresar mercancía.

**Disponible(producto) = Σ existencias físicas − Σ (cantidad − cantidad_pendiente) de reservas Activas.**

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| venta_id | bigint | not null, FK → `ventas(id)` **on delete cascade** | |
| ticket | integer | not null | Copiado para reportes |
| producto_id | bigint | not null, FK → `productos(id)` | |
| producto | text | not null | Copiado |
| cantidad | numeric | not null, check `> 0` | |
| cantidad_pendiente | numeric | not null, default 0, check `0 ≤ x ≤ cantidad` | Sin respaldo físico |
| estado | text | not null, default `'Activa'`, check `('Activa','Despachada','Cancelada')` | |
| fecha_surtido / fecha_despacho | timestamptz | null | |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `venta_id`, `(producto_id, estado)`, e índice parcial FIFO `(producto_id, creado_en) where estado='Activa' and cantidad_pendiente > 0`.

---

## ordenes_compra

Órdenes de compra del módulo Compras. Flujo de estados: `Borrador` (editable) → `Enviada` → `Recibida Parcial` → `Recibida`; `Anulada` solo sin recepciones (exige PIN de autorización).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| numero | integer | not null, **unique** | Consecutivo (`max+1`) |
| fecha | date | not null, default `current_date` | |
| proveedor_id | bigint | null, FK → `proveedores(id)` | |
| proveedor | text | null | Nombre copiado |
| estado | text | not null, default `'Borrador'`, check `('Borrador','Enviada','Recibida Parcial','Recibida','Anulada')` | |
| fecha_esperada | date | null | |
| observaciones | text | null | |
| total | numeric | not null, default 0 | Σ líneas |
| gasto_id | bigint | null, FK → `gastos(id)` set null | Último gasto generado por recepción |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

## ordenes_compra_detalle

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| orden_compra_id | bigint | not null, FK cascade | |
| producto_id | bigint | null, FK → `productos(id)` set null | Debe ser un producto con `controla_inventario` para poder recibirse |
| producto | text | not null | Copiado |
| cantidad | numeric | not null, check `> 0` | |
| precio_unitario / valor_total | numeric | not null, default 0 | |
| cantidad_recibida | numeric | not null, default 0 | Acumulada por las recepciones |
| creado_en | timestamptz | not null, default `now()` | |

---

## activos

Registro de **activos fijos de la empresa** (mobiliario, equipos de oficina/cómputo) — NO es mercancía para vender, es un módulo separado de `productos`/Inventario. A diferencia del kardex inmutable de Inventario, aquí sí se edita libremente para actualizar precio o información. La baja no borra: pasa a `estado = 'Vendido'` o `'Dado de Baja'` y el registro sigue consultable en historial (mismo espíritu que `clientes.activo`/`productos.estado`).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| codigo | text | null | Código/etiqueta física interna, opcional |
| nombre | text | not null | |
| categoria | text | null | Lista maestra `categoria_activo` |
| descripcion | text | null | |
| cantidad | numeric | not null, default 1, check `> 0` | |
| costo_unitario | numeric | not null, default 0, check `>= 0` | |
| valor_total | numeric | not null, default 0 | `cantidad × costo_unitario`, calculado y guardado por la server action (no es columna generada) |
| proveedor_id / proveedor | bigint / text | proveedor_id null, FK → `proveedores(id)` set null | Mismo patrón que `gastos` (FK + texto copiado de respaldo) |
| numero_factura | text | null | |
| fecha_compra | date | not null, default `current_date` | |
| ubicacion | text | null | Lista maestra `ubicacion_activo` |
| fecha_ingreso | date | null | Fecha en que el activo ingresó al registro (distinta de `fecha_compra` y `creado_en`) |
| area | text | null | Área/dependencia. Lista maestra `area_activo` |
| marca / color / dimensiones / modelo | text | null | Datos físicos del artículo |
| numero_serie | text | null | Número de serie / referencia de fábrica (distinto de `codigo`, que es la placa/etiqueta interna) |
| estado_actual | text | null | **Condición física** (Nuevo/Bueno/Regular/Malo/Fuera de servicio). Lista maestra `estado_activo`. Distinto de `estado` (ciclo de vida) |
| garantia_vida_util | text | null | Texto libre de garantía / vida útil |
| fecha_valuacion | date | null | Fecha de la valoración manual de depreciación |
| valor_actual_depreciacion | numeric | null | Valor actual depreciado, capturado **manualmente** por la contadora (no se calcula) |
| estado | text | not null, default `'Activo'`, check `('Activo','Vendido','Dado de Baja')` | Ciclo de vida |
| fecha_baja / motivo_baja / valor_baja / observaciones_baja | date / text / numeric / text | null | Se completan al dar de baja. `motivo_baja` viene de la lista maestra `motivo_baja_activo`; `valor_baja` es informativo (la venta de un activo **no** genera un Ingreso automático en Financiero) |
| gasto_id | bigint | null, FK → `gastos(id)` set null | Si la compra generó un Gasto automático en Financiero |
| usuario | text | null | |
| creado_en / actualizado_en | timestamptz | not null, default `now()` | |

Índices: `idx_activos_estado`, `idx_activos_categoria`, `idx_activos_proveedor`. Permiso `activos` en `usuarios.permisos` (default `false`).

Al registrar la compra de un activo con `costo_unitario > 0`, la acción `guardarActivo` puede generar automáticamente un Gasto (`tipo = 'Gasto'`, `categoria = 'Compra de Activo Fijo'`) + su línea en `gastos_detalle` (desactivable con un checkbox en el formulario) — lógica local a `activos/acciones.ts`, no reutiliza `crearGasto` de Financiero porque ese exige el permiso `financiero`.

---

## solicitudes

Módulo "Solicitudes Internas": tareas/peticiones entre miembros del equipo. Nunca se elimina una solicitud; solo cambia de estado (`Finalizada`/`Cancelada`) y queda en historial. Permiso `solicitudes` en `usuarios.permisos` es **`true` por defecto** (cualquier usuario crea solicitudes).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| numero | integer | not null | Consecutivo visible (max+1) |
| fecha_creacion | timestamptz | not null, default `now()` | Fecha y hora automáticas |
| solicitado_por_id / solicitado_por | bigint / text | FK → `usuarios(id)` set null | Quien crea (id + nombre copiado) = sesión |
| responsable_id / responsable | bigint / text | FK → `usuarios(id)` set null | Persona asignada (una sola) |
| area | text | null | Lista maestra `area_solicitud` (opcional) |
| titulo | text | not null | |
| descripcion | text | null | |
| prioridad | text | not null, default `'Media'`, check `('Baja','Media','Alta','Urgente')` | |
| fecha_limite | date | null | Opcional |
| estado | text | not null, default `'Pendiente'`, check `('Pendiente','En proceso','Esperando información','Esperando aprobación','Finalizada','Cancelada')` | |
| fecha_finalizacion | timestamptz | null | Automática al finalizar |
| observaciones_finales | text | null | |
| usuario | text | null | Autor (texto) |
| creado_en / actualizado_en | timestamptz | not null, default `now()` | |

Índices: `idx_solicitudes_estado`, `idx_solicitudes_responsable`, `idx_solicitudes_solicitante`.

## solicitudes_historial

Conversación cronológica + cambios de estado (append-only, patrón `historial_entregas`). Un renglón por creación, comentario, cambio de estado, reasignación o finalización.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| solicitud_id | bigint | not null, FK → `solicitudes(id)` **on delete cascade** | |
| fecha | timestamptz | not null, default `now()` | |
| tipo | text | not null, default `'comentario'`, check `('creacion','comentario','cambio_estado','reasignacion','finalizacion')` | |
| estado_anterior / estado_nuevo | text | null | En transiciones de estado |
| comentario | text | null | Texto del avance/comentario |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_solicitudes_historial_solicitud`.

## solicitudes_adjuntos

Archivos adjuntos (imágenes, PDF, Excel, Word) subidos al bucket de Storage `guias`; se guarda la URL pública.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| solicitud_id | bigint | not null, FK → `solicitudes(id)` **on delete cascade** | |
| url | text | not null | URL pública en Storage |
| nombre | text | null | Nombre original del archivo |
| tipo | text | null | MIME |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_solicitudes_adjuntos_solicitud`.

---

## notificaciones

Avisos internos que alimentan la **campanita** de la cabecera. Hoy se genera una sola clase de aviso: cuando a alguien le **asignan** una solicitud (al crearla o al reasignarla). Nunca se notifica al propio autor. Se crean best-effort desde `src/lib/notificaciones.ts`: un fallo aquí jamás interrumpe la operación de negocio (mismo criterio que `bitacora`).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| usuario_id | bigint | not null, FK → `usuarios(id)` **on delete cascade** | Destinatario |
| tipo | text | not null, default `'solicitud_asignada'` | Clase de aviso |
| titulo | text | not null | Encabezado que se ve en la campanita y en el push |
| cuerpo | text | null | Detalle corto |
| url | text | null | Destino al hacer clic (ej. `/solicitudes`) |
| solicitud_id | bigint | null, FK → `solicitudes(id)` **on delete cascade** | Solicitud que originó el aviso |
| leida | boolean | not null, default `false` | Se marca al pulsar "Marcar todas como leídas" |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_notificaciones_usuario (usuario_id, leida)`, `idx_notificaciones_fecha (usuario_id, creado_en desc)`.

## push_suscripciones

Suscripciones de **Web Push** (notificaciones del sistema operativo, funcionan con la app cerrada). Una fila por navegador/dispositivo de cada usuario. El envío usa `web-push` con claves VAPID en variables de entorno (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` para el navegador). Si las claves no están configuradas, el envío se omite sin romper nada.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| usuario_id | bigint | not null, FK → `usuarios(id)` **on delete cascade** | |
| endpoint | text | not null, **unique** | URL del servicio de push del navegador. El `unique` permite `upsert` cuando el navegador renueva la suscripción |
| p256dh / auth | text | not null | Claves de cifrado que entrega el navegador |
| agente | text | null | User-agent, para identificar el dispositivo |
| creado_en | timestamptz | not null, default `now()` | |

Índice: `idx_push_usuario (usuario_id)`. Las suscripciones que el servicio de push reporta como vencidas (404/410) se eliminan automáticamente al intentar enviar.

---

## arqueos

Sesión de conteo físico de inventario (total, por categoría o por ubicación — conteos cíclicos). Estados: `Abierto` → `Cerrado` (cuadre aplicado con PIN de gerencia) / `Anulado`. Un arqueo cerrado es inmutable; nunca se borra información.

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| numero | integer | not null, **unique** | Consecutivo |
| fecha_inicio / fecha_cierre | timestamptz | inicio not null | |
| estado | text | not null, default `'Abierto'`, check `('Abierto','Cerrado','Anulado')` | |
| categoria | text | null | Alcance del conteo (null = todas) |
| ubicacion_id | bigint | null, FK → `inventario_ubicaciones(id)` | Alcance (null = todas) |
| observaciones / usuario_abre / usuario_cierra | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

## arqueos_detalle

Una fila por producto + ubicación incluida en el arqueo. `cantidad_sistema` es el snapshot al abrir; `diferencia = física − sistema` se valoriza con `costo_unitario` (costo promedio al abrir).

| Columna | Tipo | Nulos/Default |
|---|---|---|
| id | bigint | PK identity |
| arqueo_id | bigint | not null, FK cascade |
| producto_id | bigint | null, FK set null (+ `producto` texto copiado) |
| ubicacion_id | bigint | null (+ `ubicacion` texto copiado) |
| cantidad_sistema | numeric | not null, default 0 |
| cantidad_fisica | numeric | null (null = aún no contado) |
| diferencia | numeric | null |
| costo_unitario | numeric | not null, default 0 |
| contado_en / usuario | — | null |

Restricción: `unique (arqueo_id, producto_id, ubicacion_id)`. El kardex (`inventario_movimientos`) tiene `arqueo_id` para rastrear los ajustes de cada cuadre.

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
| frecuencia_conteo | text | null, check `('Mensual','Trimestral','Semestral','Anual')` | Frecuencia deseada de conteos físicos de inventario (recordatorio en el dashboard) |
| creado_en | timestamptz | not null, default `now()` | |

---

## bitacora

Bitácora general de trazabilidad de **todas** las mutaciones del sistema (ventas, pagos, entregas, financiero, clientes, proveedores, usuarios, catálogos, prospectos). Cada evento guarda quién, cuándo, qué acción y — cuando aplica (crear/editar/eliminar) — el snapshot completo antes/después, no solo el último editor. Antes de la migración 004 esta tabla se llamaba `auditoria_ediciones` y solo cubría ediciones de `gastos`/`ingresos`; se generalizó en vez de crear una tabla paralela, así que las filas históricas siguen siendo válidas (columnas nuevas con default).

Se escribe exclusivamente desde el helper `registrarBitacora()` (`src/lib/pin.ts`/`src/lib/bitacora.ts`), llamado al final de cada server action de mutación, **después** de que la operación principal fue exitosa — un fallo al escribir la bitácora nunca revierte ni interrumpe la transacción de negocio (best-effort).

Se consume de dos formas: (1) el módulo **Trazabilidad** (`/trazabilidad`, solo administradores) muestra el histórico completo sin filtro de fecha por defecto; (2) el bloque "Historial de cambios" en Financiero → Gastos/Ingresos muestra los eventos de ese registro específico vía `auditoriaPorTabla(tabla, acciones?)` — por defecto solo `accion = 'editar'`; para **ingresos** se llama con `["editar", "actualizar_facturacion"]` para incluir también los cambios de estado de facturación/número de factura (gastos sigue solo con `'editar'`).

| Columna | Tipo | Nulos/Default | Descripción |
|---|---|---|---|
| id | bigint | PK identity | |
| tabla_afectada | text | not null | Nombre de la entidad afectada: `ventas`, `clientes`, `proveedores`, `usuarios`, `gastos`, `ingresos`, `cuentas_bancarias`, `listas_maestras`, `productos`, `prospectos`, `configuracion_sistema`, etc. |
| registro_id | bigint | not null | id de la fila afectada en esa entidad |
| usuario | text | null | Quién hizo la acción |
| fecha | timestamptz | not null, default `now()` | Cuándo, con hora exacta |
| modulo | text | not null, default `'financiero'` | Módulo de la app donde ocurrió: `ventas`, `pagos`, `entregas`, `financiero`, `clientes`, `proveedores`, `configuracion`, `prospectos` |
| accion | text | not null, default `'editar'` | `crear` \| `editar` \| `eliminar` \| `pagar` \| `cobrar` \| `transferir` \| `cambiar_estado` \| `cambiar_clave` \| `actualizar_facturacion` |
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
| venta_id | bigint | null, FK → `ventas(id)` set null | Venta asociada cuando el movimiento no pasa por `pagos` (reembolsos por devolución). Permite mostrar el cliente en el extracto. Índice `idx_movimientos_venta` |
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
| cliente_id | bigint | null, FK → `clientes(id)` | Cliente vinculado (Combobox + "Nuevo Cliente" al vuelo vía `crearClienteDesdeFinanciero`), sin `on delete cascade` |
| cliente | text | null | Caché del nombre del cliente al vincularlo, mismo patrón que `gastos.proveedor` |
| tipo_ingreso | text | null, check `is null or in ('Abono a Factura','Cancela Factura','Otro')` | Relación del pago con una factura del cliente |
| estado_facturacion | text | not null, default `'No Aplica'`, check `('Pendiente de Facturar','Facturado','No Aplica')` | Editable después vía `actualizarFacturacionIngreso`, **sin** clave de la contadora (no modifica montos) |
| numero_factura | text | null | Se completa normalmente al pasar `estado_facturacion` a `'Facturado'` |
| monto | numeric | not null, default 0 | |
| cobrado | numeric | not null, default 0 | Acumulado de `pagos_ingresos` |
| saldo | numeric | not null, default 0 | **Calculado:** `monto − cobrado` |
| estado | text | not null, default `'Pendiente'`, check `('Pendiente','Abonado','Cobrado')` | |
| usuario | text | null | |
| creado_en | timestamptz | not null, default `now()` | |

Índices: `idx_ingresos_estado (estado)`, `idx_ingresos_fecha (fecha)`, `idx_ingresos_ticket (ticket)`, `idx_ingresos_cliente (cliente_id)`. Solo se puede **editar** (nunca eliminar): fecha/categoría/concepto/cliente/tipo_ingreso/monto vía `editarIngreso` con `clave_contadora`; estado_facturacion/numero_factura vía `actualizarFacturacionIngreso` sin clave (acción separada y liviana). Ambas quedan en `bitacora`.

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

### `nativo.registrar_pago(p_venta_id bigint, p_abono numeric, p_retencion numeric, p_fecha date, p_comentario text, p_usuario text, p_cuenta_id bigint default null, p_retefuente numeric default 0, p_reteiva numeric default 0, p_reteica numeric default 0) → nativo.ventas`

En una sola transacción: calcula `v_ret_total = p_retencion + p_retefuente + p_reteiva + p_reteica`, inserta la fila en `pagos` (con `cuenta_id` y el desglose retefuente/reteiva/reteica, y `retencion = v_ret_total`) y actualiza la cabecera `ventas` — acumula `abono` y `retencion` (por el total), recalcula `total_a_pagar` y `saldo`, actualiza `fecha_pago` y fija `estado_pago` (`Pagado Total` si saldo ≤ 0, si no `Abonado`). Si viene `p_cuenta_id` y `p_abono > 0`, inserta el movimiento bancario de **ingreso** (origen `pago_venta`) por el monto del abono — **las retenciones no son entrada de caja**. Lanza excepción si la venta no existe. (Migración 019 reemplazó la firma anterior de 7 parámetros.)

### `nativo.editar_pago(p_pago_id bigint, p_abono numeric, p_retefuente numeric default 0, p_reteiva numeric default 0, p_reteica numeric default 0, p_fecha date default null, p_comentario text default null, p_cuenta_id bigint default null, p_usuario text default null) → nativo.ventas`

Corrige un abono ya registrado en una sola transacción: descuenta de la venta lo que aportaba el pago anterior, suma los valores nuevos, recalcula `total_a_pagar`, `saldo` y `estado_pago`, actualiza la fila de `pagos` y **rehace el asiento bancario** (borra el anterior y crea uno nuevo si hay cuenta y abono > 0). Exige que el pago quede con abono o alguna retención > 0 (para dejarlo en cero está `anular_pago`). En la app la acción `editarPago` la protege con `verificarPin` (clave de autorización). Migración 023.

### `nativo.anular_pago(p_pago_id bigint, p_usuario text default null) → nativo.ventas`

Elimina el abono y revierte su efecto: resta su `abono` y su `retencion` de la venta, recalcula `total_a_pagar`, `saldo` y `estado_pago` (vuelve a `Pendiente` si la venta queda sin abonos ni retenciones), y borra la fila de `pagos` — el asiento bancario se elimina en cascada por `movimientos_bancarios.pago_id`. Protegida con `verificarPin` en la acción `anularPago`. Migración 023.

### `nativo.pagar_gasto(p_gasto_id bigint, p_cuenta_id bigint, p_monto numeric, p_fecha date, p_comentario text, p_usuario text) → nativo.gastos`

En una sola transacción: inserta `pagos_gastos`, actualiza el gasto (acumula `abonado`, recalcula `saldo`, fija `estado` — `Pagado` si saldo ≤ 0, si no `Abonado`) e inserta el movimiento bancario de **egreso** (origen `pago_gasto`). Valida monto > 0 y cuenta obligatoria.

### `nativo.transferir_cuentas(p_origen bigint, p_destino bigint, p_monto numeric, p_fecha date, p_concepto text, p_usuario text) → void`

En una sola transacción: inserta el **egreso** en la cuenta origen y el **ingreso** en la destino (origen `transferencia`), enlazados entre sí vía `movimiento_relacionado_id`. Valida monto > 0, cuentas distintas y existentes.

### `nativo.actualizar_entrega(p_venta_id bigint, p_estado_nuevo text, p_comentario text, p_usuario text, p_fecha_entrega_real date default null, p_transportadora text default null, p_numero_guia text default null, p_ubicacion text default null) → nativo.ventas`

En una sola transacción: lee el `estado_entrega` actual, actualiza la cabecera (`estado_entrega`, `comentario_entrega`, y si vienen, `fecha_entrega_real`, `transportadora`, `numero_guia`, `ubicacion_actual`) e inserta la fila de auditoría en `historial_entregas` con estado anterior → nuevo y la `ubicacion` de ese cambio. Lanza excepción si la venta no existe.

### `nativo.cobrar_ingreso(p_ingreso_id bigint, p_cuenta_id bigint, p_monto numeric, p_fecha date, p_comentario text, p_usuario text) → nativo.ingresos`

Espejo exacto de `pagar_gasto`: en una sola transacción inserta `pagos_ingresos`, actualiza el ingreso (acumula `cobrado`, recalcula `saldo`, fija `estado` — `Cobrado` si saldo ≤ 0, si no `Abonado`) e inserta el movimiento bancario de **ingreso** (origen `pago_ingreso`). Valida monto > 0 y cuenta obligatoria.

No existen RPCs de edición: `editarGasto`/`editarIngreso` se implementan como statements directos en la server action (igual que `actualizarVenta`), protegidos por `verificarPinContadora` y registrando el cambio en `bitacora`.

**Corrección de un registro ya saldado (`ajustar_pagos`).** Cuando el gasto/ingreso estaba pagado o cobrado por completo (`saldo <= 0` y `abonado`/`cobrado > 0`), el diálogo de edición ofrece una casilla —marcada por defecto— para arrastrar la corrección al pago y a su asiento bancario. Existe porque el caso real es un error de digitación al causar: el monto equivocado se copiaba al "Pago/Cobro inmediato al causar" y a `movimientos_bancarios`, así que corregir solo la cabecera dejaba un **saldo residual imposible de cerrar** y el Historial (que lista movimientos bancarios) seguía mostrando el valor viejo. Con la casilla marcada se ajusta el **último** pago por la diferencia y su movimiento bancario en el mismo importe, y el registro vuelve a quedar saldado; el saldo de la cuenta se recalcula solo, porque `cuentasConSaldo()` lo suma desde los movimientos. Sin la casilla, el monto nuevo no puede ser menor a lo ya pagado. Si el ajuste dejaría el pago en cero o negativo se rechaza (hay que anular el pago y rehacerlo). El ajuste queda en la descripción de la `bitacora`.

### `nativo.ingresar_inventario(p_producto_id, p_ubicacion_id, p_cantidad, p_costo_unitario default null, p_tipo default 'entrada', p_referencia, p_proveedor_id, p_numero_factura, p_lote, p_motivo, p_usuario, p_venta_id, p_fecha) → nativo.productos`

Entrada de inventario atómica (tipos: `entrada`, `inventario_inicial`, `devolucion`). Lock del producto (`for update` — serializa por producto), rechaza servicios y no-enrolados, suma a la existencia de la ubicación y recalcula el **costo promedio ponderado**: `round((stock_total×costo_actual + cantidad×costo)/(stock_total+cantidad), 4)`. Con `p_costo_unitario` null la mercancía entra al costo promedio actual sin alterarlo (caso devoluciones). Actualiza `precio_compra` solo en entradas/inicial con costo explícito. Inserta el kardex con `saldo_despues`.

### Borrado de movimientos financieros (migración 028)

Nada en Financiero se podía deshacer: un pago mal registrado, un gasto causado por error o una transferencia equivocada quedaban para siempre descuadrando el banco. Las cinco funciones son RPC porque tocan varias tablas y deben ser atómicas. **El orden importa:** `movimientos_bancarios.pago_gasto_id`/`pago_ingreso_id` son `on delete set null`, así que si se borra el pago antes que el asiento, el movimiento queda huérfano y sigue sumando en el saldo de la cuenta. El borrado es real; la trazabilidad la da `bitacora`, con copia completa de lo borrado. Todas se protegen con `verificarPinContadora` en la server action.

- **`nativo.anular_pago_gasto(p_pago_id, p_usuario) → nativo.gastos`** — borra el asiento bancario y la fila de `pagos_gastos`, recalcula `abonado` desde los pagos que quedan, y con él `saldo` y `estado`. El gasto **no** se borra: vuelve a quedar pendiente por ese valor.
- **`nativo.anular_cobro_ingreso(p_pago_id, p_usuario) → nativo.ingresos`** — espejo exacto sobre `pagos_ingresos`/`ingresos`.
- **`nativo.eliminar_gasto(p_gasto_id, p_usuario) → void`** — borra los asientos bancarios de sus pagos y luego el gasto (`gastos_detalle` y `pagos_gastos` caen por cascade). **Se bloquea** si alguna `ordenes_compra.gasto_id` lo referencia: ese gasto es la cuenta por pagar de mercancía que ya entró al inventario, y borrarlo haría aparecer el inventario como gratis — hay que reversar la recepción. Los enlaces blandos de `activos.gasto_id` y `devoluciones_detalle.gasto_id` quedan en `null` por FK.
- **`nativo.eliminar_ingreso(p_ingreso_id, p_usuario) → void`** — espejo, sin guardas (ningún módulo referencia `ingresos`).
- **`nativo.eliminar_movimiento_manual(p_movimiento_id, p_usuario) → void`** — solo `origen` `manual` o `transferencia`; cualquier otro se rechaza indicando que hay que anular el pago. En una transferencia borra **los dos** asientos (dejar uno descuadraría ambas cuentas). Rompe `movimiento_relacionado_id` en ambos sentidos antes de borrar, porque esa FK no tiene cascade y bloquearía el delete.

### `nativo.mover_insumo(p_insumo_id, p_tipo, p_cantidad, p_costo_unitario default null, p_fecha default now(), p_proveedor_id, p_numero_factura, p_referencia, p_motivo, p_usuario) → nativo.insumos`

Movimiento de insumo atómico (tipos: `entrada`, `salida`, `ajuste`). Lock del insumo (`for update` — serializa por insumo). **Entrada:** suma a la existencia y recalcula el **costo promedio ponderado** `round((existencia×costo_actual + cantidad×costo)/(existencia+cantidad), 4)`; sin `p_costo_unitario` la mercancía entra al costo promedio actual sin alterarlo; con costo explícito además actualiza `ultimo_costo`. **Salida:** valida existencia suficiente (nunca deja saldo negativo) y se valoriza al costo promedio del momento. **Ajuste:** `p_cantidad` es la existencia **física contada**; registra la diferencia con signo y falla si no hay diferencia — no cambia el costo. Siempre inserta el asiento en `insumos_movimientos` con `saldo_despues`. Migración 027.

### `nativo.trasladar_inventario(p_producto_id, p_origen_id, p_destino_id, p_cantidad, p_motivo, p_usuario) → void`

Traslado entre ubicaciones: valida stock en origen, resta/suma existencias e inserta DOS filas de kardex (`traslado_salida` negativa / `traslado_entrada` positiva). El stock total y el costo promedio no cambian.

### `nativo.ajustar_inventario(p_producto_id, p_ubicacion_id, p_cantidad_fisica, p_motivo, p_usuario, p_referencia) → numeric`

Ajuste puntual por conteo físico: deja la existencia de la ubicación = cantidad física, registra la **diferencia** (con signo) en el kardex y la retorna. Error si no hay diferencia. No cambia el costo promedio.

### `nativo.salida_manual_inventario(p_producto_id, p_ubicacion_id, p_cantidad, p_motivo, p_usuario, p_referencia) → void`

Salida directa (bajas, muestras, obsequios): valida stock en la ubicación **y** que la salida no deje el stock total por debajo de lo reservado para ventas pendientes de despacho.

### `nativo.reservar_venta(p_venta_id, p_lineas jsonb, p_usuario) → void`

Reserva inventario para una venta (llamado por `registrarVenta`/`actualizarVenta` con las líneas que tienen match en el catálogo). Idempotente: cancela las reservas Activas anteriores y crea las nuevas (compatible con el delete+reinsert de líneas al editar). Bloquea si la venta ya tiene reservas Despachadas. Si `cantidad > disponible` y la línea no viene con `permitir_faltante` ("Venta sin inventario") lanza error; con el flag, la parte faltante queda como `cantidad_pendiente` (pendiente por surtir).

### `nativo.despachar_venta(p_venta_id, p_usuario) → void`

Descuento físico al entregar (llamado por `actualizarEntrega` cuando el estado nuevo es "Entregado", ANTES de cambiar el estado): por cada reserva Activa saca lo respaldado tomando primero de Bodega, inserta kardex tipo `venta` al costo promedio del momento y marca la reserva `Despachada` (o la reduce a solo lo pendiente si la venta tenía faltantes). Idempotente.

### `nativo.surtir_pendientes(p_producto_id, p_usuario) → void`

Surtido automático FIFO: asigna el stock libre de un producto a las reservas con `cantidad_pendiente` más antiguas. Si la venta ya está Entregada, auto-despacha lo surtido de inmediato. Lo llama `ingresar_inventario` al final de cada ingreso (compras, ingresos manuales, devoluciones).

### `nativo.cerrar_arqueo(p_arqueo_id, p_usuario) → (ajustados integer, valor_diferencia numeric)`

Cuadre masivo atómico de un conteo físico: por cada detalle contado con diferencia ≠ 0 aplica el **delta** a la existencia (tolera movimientos posteriores al conteo) e inserta el kardex tipo `ajuste` con `arqueo_id`. Si un delta negativo dejaría una existencia bajo cero, todo el cierre se revierte (nunca cuadra a ciegas). El **PIN de gerencia** (`verificarPin`) se valida en la server action `cerrarArqueo` antes de invocar el RPC.

### `nativo.recibir_orden_compra(p_orden_id, p_lineas jsonb, p_numero_factura, p_fecha, p_usuario, p_crear_gasto default true) → nativo.ordenes_compra`

Recepción (total o parcial) de una orden de compra, atómica: valida estado Enviada/Recibida Parcial y pendientes por línea; por línea llama `ingresar_inventario` (stock + costo promedio + kardex con referencia `OC #N`); acumula `cantidad_recibida`; recalcula el estado de la orden; y si `p_crear_gasto`, genera el Gasto en Financiero (tipo `Costo`, categoría `Compra Inventario`, con proveedor y factura) por lo recibido en esta recepción + sus `gastos_detalle`. **Cada recepción parcial genera su propio gasto** (la cuenta por pagar real de esa factura).

### `nativo.registrar_devolucion_perdida(p_devolucion_detalle_id bigint, p_valor_perdido numeric, p_cuenta_id bigint default null, p_fecha date default current_date, p_comentario text default null, p_usuario text default null) → nativo.ventas`

En una sola transacción: resta `p_valor_perdido` de `ventas.total_compra` de la venta dueña del detalle, recalcula `total_a_pagar`/`saldo` y `estado_pago` con la misma regla que `actualizarVenta()` (`saldo ≤ 0 && total > 0 → 'Pagado Total'`, si no `abono > 0 → 'Abonado'`, si no `'Pendiente'`). Si el nuevo saldo queda negativo (el cliente ya había pagado de más), exige `p_cuenta_id` (si no viene, lanza excepción pidiéndola), reduce `abono` en esa diferencia, fija `saldo = 0` y `estado_pago = 'Pagado Total'`, e inserta el movimiento bancario de **egreso** (origen `devolucion_venta`) por el reembolso. Siempre actualiza `devoluciones_detalle.estado = 'Perdida'` + `valor_perdido`, e inserta la fila correspondiente en `devoluciones_historial`. Lanza excepción si el detalle no existe o ya fue resuelto (`Recuperada`/`Perdida`).

---

## Permisos de API

- `grant usage` del esquema a `anon`, `authenticated`, `service_role`.
- Privilegios sobre tablas/secuencias/funciones **solo** para `service_role` (incluye default privileges para objetos futuros).
- El esquema `nativo` está agregado a "Exposed schemas" en la configuración de la API de Supabase.

## Storage

- Bucket **`guias`** (público): imágenes de referencia de estampado/bordado por línea de producto. Las URLs públicas se guardan en `ventas_detalle.imagen_estampado_url` / `imagen_bordado_url`. Subidas siempre server-side (`subirImagenLinea`, permiso `ventas`), nunca directo desde el navegador.
