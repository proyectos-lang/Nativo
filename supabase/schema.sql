-- ============================================================
-- Sistema de Control de Pedidos y Despachos Nativo
-- Esquema: nativo  |  ids: bigint identity  |  tablas en español
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

create schema if not exists nativo;

-- ------------------------------------------------------------
-- USUARIOS
-- ADVERTENCIA: la columna "contrasena" guarda la contraseña en
-- TEXTO PLANO por decisión explícita del propietario del sistema.
-- Cualquiera con acceso a esta tabla ve las contraseñas reales.
-- ------------------------------------------------------------
create table nativo.usuarios (
  id bigint generated always as identity primary key,
  nombre text not null,
  usuario text not null unique,
  correo text,
  contrasena text not null,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  permisos jsonb not null default '{"dashboard": true, "ventas": true, "pagos": true, "entregas": true, "seguimiento": true, "prospectos": true, "clientes": true, "proveedores": false, "configuracion": false, "financiero": false, "devoluciones": false, "inventario": false, "compras": false, "activos": false, "solicitudes": true, "costos": false}'::jsonb,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table nativo.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  empresa text,
  contacto text,
  ciudad text,
  departamento text,
  direccion text,
  correo text,
  cedula_nit text,
  rut text,
  digito_verificacion text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index idx_clientes_cedula on nativo.clientes (cedula_nit);
create index idx_clientes_nombre on nativo.clientes (nombre);

-- ------------------------------------------------------------
-- PRODUCTOS (catálogo de referencias/variantes del inventario).
-- Un producto = una referencia (la talla/color/manga hacen parte
-- de la identidad de la fila; el SKU es la clave real). Los
-- productos creados automáticamente desde Ventas (texto libre)
-- quedan con controla_inventario = false hasta enrolarse desde
-- el módulo Inventario. es_servicio = se vende como producto pero
-- nunca mueve inventario.
-- ------------------------------------------------------------
create table nativo.productos (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  sku text,
  codigo_barras text,
  categoria text,
  subcategoria text,
  sexo text,
  talla text,
  color text,
  manga text,
  unidad_medida text not null default 'Unidad',
  precio_compra numeric not null default 0,
  precio_venta_antes_iva numeric not null default 0,
  iva_porcentaje numeric not null default 0,
  precio_venta numeric not null default 0,
  costo_promedio numeric not null default 0,
  es_servicio boolean not null default false,
  controla_inventario boolean not null default false,
  estado text not null default 'Activo' check (estado in ('Activo', 'Descontinuado')),
  fecha_vencimiento date,
  stock_minimo numeric not null default 0,
  stock_maximo numeric,
  creado_en timestamptz not null default now(),
  constraint chk_servicio_sin_inventario check (not (es_servicio and controla_inventario))
);
create unique index idx_productos_sku on nativo.productos (sku) where sku is not null;
create index idx_productos_categoria on nativo.productos (categoria);
create index idx_productos_estado on nativo.productos (estado);

-- ------------------------------------------------------------
-- COSTOS Y RECETAS (explosión de materiales / MRP)
-- Cada producto de venta puede tener su receta: los materiales que
-- lo componen con consumo, unidad y costo. Sirve para calcular
-- venta − costo = utilidad. Ver migración 026.
-- ------------------------------------------------------------
create table nativo.recetas (
  id bigint generated always as identity primary key,
  producto_id bigint not null unique references nativo.productos (id) on delete cascade,
  notas text,
  costo_total numeric not null default 0,
  usuario text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index idx_recetas_producto on nativo.recetas (producto_id);

-- `tipo` permite que mano de obra y servicios externos (bordado, estampado)
-- entren como líneas más. FK blanda + texto copiado, igual que el kardex.
create table nativo.recetas_materiales (
  id bigint generated always as identity primary key,
  receta_id bigint not null references nativo.recetas (id) on delete cascade,
  tipo text not null default 'Material'
    check (tipo in ('Material', 'Mano de obra', 'Servicio', 'Otro')),
  material_producto_id bigint references nativo.productos (id) on delete set null,
  material text not null,
  cantidad numeric not null default 1 check (cantidad > 0),
  unidad_medida text,
  costo_unitario numeric not null default 0,
  costo_total numeric not null default 0,
  notas text,
  creado_en timestamptz not null default now()
);
create index idx_recetas_materiales_receta on nativo.recetas_materiales (receta_id);
create index idx_recetas_materiales_producto on nativo.recetas_materiales (material_producto_id);

-- ------------------------------------------------------------
-- LISTAS MAESTRAS (vendedoras, tallas, colores, estados, etc.)
-- ------------------------------------------------------------
create table nativo.listas_maestras (
  id bigint generated always as identity primary key,
  tipo text not null,
  valor text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (tipo, valor)
);
create index idx_listas_tipo on nativo.listas_maestras (tipo);

-- ------------------------------------------------------------
-- VENTAS (cabecera) — trazabilidad, pagos y estados cuelgan de aquí
-- ------------------------------------------------------------
create table nativo.ventas (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null,
  cliente_id bigint references nativo.clientes (id),
  canal_venta text,
  campana text,
  vendedora text,
  profesional text,
  motivo_compra text,
  -- Orden de compra / pedido que envía el CLIENTE (no confundir con el módulo
  -- ordenes_compra, que son las órdenes de Nativo a sus proveedores).
  orden_compra_cliente text,
  total_compra numeric not null default 0,
  retencion numeric not null default 0,
  total_a_pagar numeric not null default 0,
  abono numeric not null default 0,
  saldo numeric not null default 0,
  estado_pago text default 'Pendiente',
  fecha_pago date,
  tipo_pago text,
  medio_pago text,
  observaciones_pago text,
  estado_entrega text default 'En Proceso',
  fecha_entrega date,
  fecha_entrega_real date,
  transportadora text,
  numero_guia text,
  comentario_entrega text,
  costo_envio numeric not null default 0,
  ubicacion_actual text,
  creado_en timestamptz not null default now()
);
create index idx_ventas_ticket on nativo.ventas (ticket);
create index idx_ventas_cliente on nativo.ventas (cliente_id);
create index idx_ventas_orden_compra on nativo.ventas (orden_compra_cliente);
create index idx_ventas_estado_pago on nativo.ventas (estado_pago);
create index idx_ventas_estado_entrega on nativo.ventas (estado_entrega);
create index idx_ventas_fecha on nativo.ventas (fecha);

-- ------------------------------------------------------------
-- VENTAS DETALLE (una fila por producto de la venta)
-- ------------------------------------------------------------
create table nativo.ventas_detalle (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  producto text not null,
  codigo_producto text,
  cantidad numeric not null default 1,
  talla text,
  color text,
  sexo text,
  estampado text,
  bordado text,
  guia_estampado text,
  guia_bordado text,
  imagen_estampado_url text,
  imagen_bordado_url text,
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  -- Costo CONGELADO al momento de vender, tomado de la receta del producto
  -- (módulo Costos y Recetas). null = venta anterior a ese módulo o producto
  -- sin receta: la utilidad se calcula con la receta actual o queda vacía.
  costo_unitario numeric,
  costo_total numeric,
  listo boolean not null default false,
  creado_en timestamptz not null default now()
);
create index idx_detalle_venta on nativo.ventas_detalle (venta_id);

-- ------------------------------------------------------------
-- PAGOS (trazabilidad de cada abono/retención aplicada)
-- ------------------------------------------------------------
create table nativo.pagos (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  fecha date not null default current_date,
  abono numeric not null default 0,
  retencion numeric not null default 0,   -- TOTAL de retenciones del pago (= retefuente + reteiva + reteica)
  retefuente numeric not null default 0,
  reteiva numeric not null default 0,
  reteica numeric not null default 0,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_pagos_venta on nativo.pagos (venta_id);

-- ------------------------------------------------------------
-- HISTORIAL DE ENTREGAS (cada cambio de estado)
-- ------------------------------------------------------------
create table nativo.historial_entregas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  ubicacion text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_historial_venta on nativo.historial_entregas (venta_id);

-- ------------------------------------------------------------
-- PROSPECTOS (clientes por contactar)
-- ------------------------------------------------------------
create table nativo.prospectos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  referido_por text,
  evento_lugar text,
  nombre text not null,
  telefono text,
  correo text,
  descripcion text,
  estado text not null default 'Pendiente',
  fecha_contacto date,
  proximo_contacto date,
  observaciones text,
  creado_en timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CONFIGURACIÓN DEL SISTEMA (fila única): PIN de autorización
-- ADVERTENCIA: igual que las contraseñas de usuarios, se guarda
-- en texto plano por decisión del propietario del sistema.
-- ------------------------------------------------------------
create table nativo.configuracion_sistema (
  id bigint generated always as identity primary key,
  clave_autorizacion text not null default 'CAMBIAR-1234',
  clave_contadora text not null default 'CAMBIAR-5678',
  frecuencia_conteo text
    constraint configuracion_frecuencia_conteo_check
    check (frecuencia_conteo is null or frecuencia_conteo in ('Mensual', 'Trimestral', 'Semestral', 'Anual')),
  creado_en timestamptz not null default now()
);
insert into nativo.configuracion_sistema (clave_autorizacion) values ('CAMBIAR-1234');

-- ------------------------------------------------------------
-- AUDITORÍA DE EDICIONES (reutilizable: gastos e ingresos hoy)
-- ------------------------------------------------------------
create table nativo.bitacora (
  id bigint generated always as identity primary key,
  tabla_afectada text not null,
  registro_id bigint not null,
  usuario text,
  fecha timestamptz not null default now(),
  modulo text not null default 'financiero',
  accion text not null default 'editar',
  descripcion text not null default '',
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text
);
create index idx_bitacora_entidad on nativo.bitacora (tabla_afectada, registro_id);
create index idx_bitacora_fecha on nativo.bitacora (fecha);
create index idx_bitacora_usuario on nativo.bitacora (usuario);
create index idx_bitacora_modulo on nativo.bitacora (modulo);
create index idx_bitacora_accion on nativo.bitacora (accion);

-- ------------------------------------------------------------
-- PROVEEDORES (clon de clientes)
-- ------------------------------------------------------------
create table nativo.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null,
  nit text,
  tipo text,
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
-- MÓDULO FINANCIERO
-- ------------------------------------------------------------

-- CUENTAS BANCARIAS (saldo actual = saldo_inicial + ingresos - egresos)
create table nativo.cuentas_bancarias (
  id bigint generated always as identity primary key,
  nombre text not null,
  banco text,
  numero_cuenta text,
  saldo_inicial numeric not null default 0,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- GASTOS Y COSTOS (causación; admite abonos parciales)
create table nativo.gastos (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('Gasto', 'Costo')),
  categoria text,
  proveedor text,
  proveedor_id bigint references nativo.proveedores (id),
  numero_factura text,
  descripcion text,
  monto numeric not null default 0,
  abonado numeric not null default 0,
  saldo numeric not null default 0,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Abonado', 'Pagado')),
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_gastos_estado on nativo.gastos (estado);
create index idx_gastos_fecha on nativo.gastos (fecha);
create index idx_gastos_ticket on nativo.gastos (ticket);

-- GASTOS_DETALLE: líneas de artículo por gasto (clon de ventas_detalle)
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

-- PAGOS DE GASTOS (cada abono a un gasto sale de una cuenta)
create table nativo.pagos_gastos (
  id bigint generated always as identity primary key,
  gasto_id bigint not null references nativo.gastos (id) on delete cascade,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  monto numeric not null default 0,
  comentario text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_pagos_gastos_gasto on nativo.pagos_gastos (gasto_id);

-- INGRESOS (espejo de gastos, sin líneas múltiples; admite cobro parcial)
create table nativo.ingresos (
  id bigint generated always as identity primary key,
  ticket integer not null unique,
  fecha date not null default current_date,
  categoria text,
  concepto text,
  cliente_id bigint references nativo.clientes (id),
  cliente text,
  tipo_ingreso text
    check (tipo_ingreso is null or tipo_ingreso in ('Abono a Factura', 'Cancela Factura', 'Otro')),
  estado_facturacion text not null default 'No Aplica'
    check (estado_facturacion in ('Pendiente de Facturar', 'Facturado', 'No Aplica')),
  numero_factura text,
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
create index idx_ingresos_cliente on nativo.ingresos (cliente_id);

-- PAGOS DE INGRESOS (cada cobro de un ingreso entra a una cuenta)
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

-- MOVIMIENTOS BANCARIOS (libro de cada cuenta)
create table nativo.movimientos_bancarios (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references nativo.cuentas_bancarias (id),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  origen text not null default 'manual' check (origen in ('manual', 'pago_venta', 'pago_gasto', 'transferencia', 'pago_ingreso', 'devolucion_venta')),
  monto numeric not null check (monto > 0),
  concepto text,
  pago_id bigint references nativo.pagos (id) on delete cascade,
  pago_gasto_id bigint references nativo.pagos_gastos (id) on delete set null,
  pago_ingreso_id bigint references nativo.pagos_ingresos (id) on delete set null,
  movimiento_relacionado_id bigint references nativo.movimientos_bancarios (id),
  -- Venta asociada cuando el movimiento no pasa por `pagos` (reembolsos por
  -- devolución); permite mostrar el cliente en el extracto de la cuenta.
  venta_id bigint references nativo.ventas (id) on delete set null,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_movimientos_cuenta on nativo.movimientos_bancarios (cuenta_id);
create index idx_movimientos_fecha on nativo.movimientos_bancarios (fecha);
create index idx_movimientos_venta on nativo.movimientos_bancarios (venta_id);

-- Cuenta destino del abono en pagos de ventas
alter table nativo.pagos add column cuenta_id bigint references nativo.cuentas_bancarias (id);

-- ------------------------------------------------------------
-- DEVOLUCIONES (cabecera, amarrada al ticket de venta)
-- ------------------------------------------------------------
create table nativo.devoluciones (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id),
  fecha date not null default current_date,
  usuario text,
  comentario text,
  creado_en timestamptz not null default now()
);
create index idx_devoluciones_venta on nativo.devoluciones (venta_id);

-- DEVOLUCIONES_DETALLE: una fila por prenda/línea devuelta. No depende
-- de una FK dura hacia ventas_detalle para sus datos de negocio: copia
-- producto/talla/color/valor_unitario al crearse, porque
-- actualizarVenta() borra y reinserta TODAS las líneas de
-- ventas_detalle al editar una venta (no hace diff). ventas_detalle_id
-- queda como referencia blanda (on delete set null), solo para
-- trazabilidad/navegación en la UI.
create table nativo.devoluciones_detalle (
  id bigint generated always as identity primary key,
  devolucion_id bigint not null references nativo.devoluciones (id) on delete cascade,
  ventas_detalle_id bigint references nativo.ventas_detalle (id) on delete set null,
  producto text not null,
  talla text,
  color text,
  valor_unitario numeric not null default 0,
  cantidad_devuelta numeric not null default 1,
  causal text,
  observacion text,
  recuperable boolean not null default true,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En Reproceso', 'Recuperada', 'Perdida')),
  costo_recuperacion numeric,
  valor_perdido numeric,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index idx_devoluciones_detalle_devolucion on nativo.devoluciones_detalle (devolucion_id);
create index idx_devoluciones_detalle_estado on nativo.devoluciones_detalle (estado);

-- DEVOLUCIONES_HISTORIAL: historial de estados/reprocesos, análogo a historial_entregas
create table nativo.devoluciones_historial (
  id bigint generated always as identity primary key,
  devolucion_detalle_id bigint not null references nativo.devoluciones_detalle (id) on delete cascade,
  fecha timestamptz not null default now(),
  estado_anterior text,
  estado_nuevo text not null,
  comentario text,
  usuario text
);
create index idx_devoluciones_historial_detalle on nativo.devoluciones_historial (devolucion_detalle_id);

-- ------------------------------------------------------------
-- MÓDULO INVENTARIO
-- ------------------------------------------------------------

-- UBICACIONES (Bodega / Exhibición; ampliable)
create table nativo.inventario_ubicaciones (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- EXISTENCIAS físicas (una fila por producto + ubicación). Nunca negativas.
create table nativo.inventario_existencias (
  id bigint generated always as identity primary key,
  producto_id bigint not null references nativo.productos (id) on delete cascade,
  ubicacion_id bigint not null references nativo.inventario_ubicaciones (id),
  cantidad numeric not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  unique (producto_id, ubicacion_id)
);
create index idx_existencias_producto on nativo.inventario_existencias (producto_id);

-- KARDEX: nunca se borra. FKs blandas + texto copiado (mismo criterio
-- que devoluciones_detalle). cantidad SIEMPRE con signo (+entra/−sale);
-- en 'ajuste' es la diferencia. saldo_despues = stock TOTAL del
-- producto (todas las ubicaciones) tras el movimiento.
create table nativo.inventario_movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in (
    'inventario_inicial', 'entrada', 'devolucion', 'salida', 'venta',
    'traslado_salida', 'traslado_entrada', 'ajuste')),
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  ubicacion text,
  cantidad numeric not null,
  costo_unitario numeric,
  saldo_despues numeric not null,
  referencia text,
  venta_id bigint references nativo.ventas (id) on delete set null,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  numero_factura text,
  lote text,
  motivo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_inv_mov_producto on nativo.inventario_movimientos (producto_id, fecha);
create index idx_inv_mov_tipo on nativo.inventario_movimientos (tipo);
create index idx_inv_mov_fecha on nativo.inventario_movimientos (fecha);
create index idx_inv_mov_venta on nativo.inventario_movimientos (venta_id);

-- RESERVAS (stock comprometido por ventas). NO dependen de
-- ventas_detalle.id (esos ids cambian en cada edición de venta).
-- cantidad_pendiente = parte sin respaldo físico ("pendiente por
-- surtir" de venta sin inventario).
-- Disponible(producto) = Σ existencias − Σ (cantidad − pendiente) activas.
create table nativo.inventario_reservas (
  id bigint generated always as identity primary key,
  venta_id bigint not null references nativo.ventas (id) on delete cascade,
  ticket integer not null,
  producto_id bigint not null references nativo.productos (id),
  producto text not null,
  cantidad numeric not null check (cantidad > 0),
  cantidad_pendiente numeric not null default 0 check (cantidad_pendiente >= 0),
  estado text not null default 'Activa' check (estado in ('Activa', 'Despachada', 'Cancelada')),
  fecha_surtido timestamptz,
  fecha_despacho timestamptz,
  usuario text,
  creado_en timestamptz not null default now(),
  check (cantidad_pendiente <= cantidad)
);
create index idx_reservas_venta on nativo.inventario_reservas (venta_id);
create index idx_reservas_producto_estado on nativo.inventario_reservas (producto_id, estado);
create index idx_reservas_pendientes on nativo.inventario_reservas (producto_id, creado_en)
  where estado = 'Activa' and cantidad_pendiente > 0;

-- ------------------------------------------------------------
-- MÓDULO COMPRAS (órdenes de compra que alimentan el inventario
-- y generan el Gasto en Financiero al recibirse)
-- ------------------------------------------------------------
create table nativo.ordenes_compra (
  id bigint generated always as identity primary key,
  numero integer not null unique,
  fecha date not null default current_date,
  proveedor_id bigint references nativo.proveedores (id),
  proveedor text,
  estado text not null default 'Borrador'
    check (estado in ('Borrador', 'Enviada', 'Recibida Parcial', 'Recibida', 'Anulada')),
  fecha_esperada date,
  observaciones text,
  total numeric not null default 0,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_oc_estado on nativo.ordenes_compra (estado);
create index idx_oc_proveedor on nativo.ordenes_compra (proveedor_id);
create index idx_oc_fecha on nativo.ordenes_compra (fecha);

create table nativo.ordenes_compra_detalle (
  id bigint generated always as identity primary key,
  orden_compra_id bigint not null references nativo.ordenes_compra (id) on delete cascade,
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  cantidad numeric not null check (cantidad > 0),
  precio_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  cantidad_recibida numeric not null default 0 check (cantidad_recibida >= 0),
  creado_en timestamptz not null default now()
);
create index idx_ocd_orden on nativo.ordenes_compra_detalle (orden_compra_id);

-- ------------------------------------------------------------
-- MÓDULO ACTIVOS FIJOS (mobiliario/equipos de la empresa — NO
-- mercancía para vender. A diferencia del kardex inmutable de
-- Inventario, este registro sí se edita libremente. La baja no
-- borra: pasa a estado 'Vendido'/'Dado de Baja' y queda en
-- historial. La compra puede generar un Gasto automático en
-- Financiero, igual que recibir_orden_compra.)
-- ------------------------------------------------------------
create table nativo.activos (
  id bigint generated always as identity primary key,
  codigo text,
  nombre text not null,
  categoria text,
  descripcion text,
  cantidad numeric not null default 1 check (cantidad > 0),
  costo_unitario numeric not null default 0 check (costo_unitario >= 0),
  valor_total numeric not null default 0,
  proveedor_id bigint references nativo.proveedores (id) on delete set null,
  proveedor text,
  numero_factura text,
  fecha_compra date not null default current_date,
  ubicacion text,
  -- Ficha extendida (contadora). estado_actual = condición física
  -- (lista maestra estado_activo), distinta de `estado` (ciclo de vida).
  fecha_ingreso date,
  area text,
  marca text,
  color text,
  dimensiones text,
  modelo text,
  numero_serie text,
  estado_actual text,
  garantia_vida_util text,
  fecha_valuacion date,
  valor_actual_depreciacion numeric,
  estado text not null default 'Activo'
    check (estado in ('Activo', 'Vendido', 'Dado de Baja')),
  fecha_baja date,
  motivo_baja text,
  valor_baja numeric,
  observaciones_baja text,
  gasto_id bigint references nativo.gastos (id) on delete set null,
  usuario text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index idx_activos_estado on nativo.activos (estado);
create index idx_activos_categoria on nativo.activos (categoria);
create index idx_activos_proveedor on nativo.activos (proveedor_id);

-- ------------------------------------------------------------
-- MÓDULO SOLICITUDES INTERNAS (tareas/peticiones entre miembros
-- del equipo, con estado, conversación cronológica append-only,
-- adjuntos y trazabilidad. Nunca se elimina: solo cambia estado.
-- Permiso "solicitudes" habilitado por defecto para todos.)
-- ------------------------------------------------------------
create table nativo.solicitudes (
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
create index idx_solicitudes_estado on nativo.solicitudes (estado);
create index idx_solicitudes_responsable on nativo.solicitudes (responsable_id);
create index idx_solicitudes_solicitante on nativo.solicitudes (solicitado_por_id);

create table nativo.solicitudes_historial (
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
create index idx_solicitudes_historial_solicitud on nativo.solicitudes_historial (solicitud_id);

create table nativo.solicitudes_adjuntos (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references nativo.solicitudes (id) on delete cascade,
  url text not null,
  nombre text,
  tipo text,
  usuario text,
  creado_en timestamptz not null default now()
);
create index idx_solicitudes_adjuntos_solicitud on nativo.solicitudes_adjuntos (solicitud_id);
create index idx_solicitudes_fecha_limite on nativo.solicitudes (fecha_limite);

-- ------------------------------------------------------------
-- NOTIFICACIONES INTERNAS + SUSCRIPCIONES PUSH
-- Alimentan la campanita de la cabecera y las notificaciones del
-- sistema operativo (Web Push). Hoy solo se genera una por el evento
-- "solicitud nueva asignada" (incluye reasignaciones). Ver migración 025.
-- ------------------------------------------------------------
create table nativo.notificaciones (
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
create index idx_notificaciones_usuario on nativo.notificaciones (usuario_id, leida);
create index idx_notificaciones_fecha on nativo.notificaciones (usuario_id, creado_en desc);

create table nativo.push_suscripciones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references nativo.usuarios (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_en timestamptz not null default now()
);
create index idx_push_usuario on nativo.push_suscripciones (usuario_id);

-- ------------------------------------------------------------
-- ARQUEOS DE INVENTARIO (conteos físicos con cuadre autorizado)
-- ------------------------------------------------------------
create table nativo.arqueos (
  id bigint generated always as identity primary key,
  numero integer not null unique,
  fecha_inicio timestamptz not null default now(),
  fecha_cierre timestamptz,
  estado text not null default 'Abierto' check (estado in ('Abierto', 'Cerrado', 'Anulado')),
  categoria text,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  observaciones text,
  usuario_abre text,
  usuario_cierra text,
  creado_en timestamptz not null default now()
);

create table nativo.arqueos_detalle (
  id bigint generated always as identity primary key,
  arqueo_id bigint not null references nativo.arqueos (id) on delete cascade,
  producto_id bigint references nativo.productos (id) on delete set null,
  producto text not null,
  ubicacion_id bigint references nativo.inventario_ubicaciones (id),
  ubicacion text,
  cantidad_sistema numeric not null default 0,
  cantidad_fisica numeric,
  diferencia numeric,
  costo_unitario numeric not null default 0,
  contado_en timestamptz,
  usuario text,
  unique (arqueo_id, producto_id, ubicacion_id)
);
create index idx_arqueos_detalle_arqueo on nativo.arqueos_detalle (arqueo_id);

-- Enlace del kardex con el arqueo que generó el ajuste
alter table nativo.inventario_movimientos
  add column arqueo_id bigint references nativo.arqueos (id) on delete set null;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: registrar pago de forma atómica
-- Inserta en pagos, recalcula la cabecera y, si viene cuenta,
-- genera el movimiento bancario de ingreso por el abono.
-- ------------------------------------------------------------
-- registrar_pago: p_retencion se conserva como retención genérica; se
-- suman las 3 retenciones colombianas (Retefuente/ReteIVA/ReteICA). El
-- total reduce el saldo de la venta pero NO es efectivo (a la cuenta
-- bancaria solo entra el abono). Ver migración 019.
create or replace function nativo.registrar_pago(
  p_venta_id bigint,
  p_abono numeric,
  p_retencion numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text,
  p_cuenta_id bigint default null,
  p_retefuente numeric default 0,
  p_reteiva numeric default 0,
  p_reteica numeric default 0
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_pago_id bigint;
  v_ticket integer;
  v_ret_total numeric;
begin
  v_ret_total := coalesce(p_retencion, 0) + coalesce(p_retefuente, 0) + coalesce(p_reteiva, 0) + coalesce(p_reteica, 0);

  insert into nativo.pagos (venta_id, fecha, abono, retencion, retefuente, reteiva, reteica, comentario, usuario, cuenta_id)
  values (p_venta_id, coalesce(p_fecha, current_date), coalesce(p_abono, 0), v_ret_total,
          coalesce(p_retefuente, 0), coalesce(p_reteiva, 0), coalesce(p_reteica, 0), p_comentario, p_usuario, p_cuenta_id)
  returning id into v_pago_id;

  update nativo.ventas
  set abono = abono + coalesce(p_abono, 0),
      retencion = retencion + v_ret_total,
      total_a_pagar = total_compra - (retencion + v_ret_total),
      saldo = (total_compra - (retencion + v_ret_total)) - (abono + coalesce(p_abono, 0)),
      fecha_pago = coalesce(p_fecha, fecha_pago),
      estado_pago = case
        when (total_compra - (retencion + v_ret_total)) - (abono + coalesce(p_abono, 0)) <= 0 then 'Pagado Total'
        else 'Abonado'
      end
  where id = p_venta_id
  returning * into v;

  if v.id is null then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  -- Asiento bancario: solo el abono entra a caja (las retenciones no son efectivo)
  if p_cuenta_id is not null and coalesce(p_abono, 0) > 0 then
    select ticket into v_ticket from nativo.ventas where id = p_venta_id;
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_id, usuario)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'ingreso', 'pago_venta', p_abono,
            'Pago venta ticket #' || v_ticket, v_pago_id, p_usuario);
  end if;

  return v;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIONES RPC: editar y anular un abono ya registrado. Corrigen
-- la cabecera de la venta y rehacen/eliminan el asiento bancario.
-- En la app van protegidas con la clave de autorización. Ver
-- migración 023.
-- ------------------------------------------------------------
create or replace function nativo.editar_pago(
  p_pago_id bigint,
  p_abono numeric,
  p_retefuente numeric default 0,
  p_reteiva numeric default 0,
  p_reteica numeric default 0,
  p_fecha date default null,
  p_comentario text default null,
  p_cuenta_id bigint default null,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  pg nativo.pagos;
  v nativo.ventas;
  v_ret_nueva numeric;
  v_abono_total numeric;
  v_ret_total numeric;
  v_saldo numeric;
begin
  select * into pg from nativo.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago % no encontrado', p_pago_id;
  end if;

  v_ret_nueva := coalesce(p_retefuente, 0) + coalesce(p_reteiva, 0) + coalesce(p_reteica, 0);
  if coalesce(p_abono, 0) < 0 or v_ret_nueva < 0 then
    raise exception 'Los valores del pago no pueden ser negativos';
  end if;
  if coalesce(p_abono, 0) <= 0 and v_ret_nueva <= 0 then
    raise exception 'El pago debe tener un abono o alguna retención mayor a cero. Si deseas eliminarlo, usa Anular.';
  end if;

  select * into v from nativo.ventas where id = pg.venta_id for update;
  if not found then
    raise exception 'La venta del pago % no existe', p_pago_id;
  end if;

  v_abono_total := v.abono - pg.abono + coalesce(p_abono, 0);
  v_ret_total := v.retencion - pg.retencion + v_ret_nueva;
  if v_abono_total < 0 or v_ret_total < 0 then
    raise exception 'El cambio deja la venta con valores negativos; revisa el monto';
  end if;
  v_saldo := (v.total_compra - v_ret_total) - v_abono_total;

  update nativo.pagos
  set abono = coalesce(p_abono, 0),
      retencion = v_ret_nueva,
      retefuente = coalesce(p_retefuente, 0),
      reteiva = coalesce(p_reteiva, 0),
      reteica = coalesce(p_reteica, 0),
      fecha = coalesce(p_fecha, pg.fecha),
      comentario = coalesce(p_comentario, pg.comentario),
      cuenta_id = p_cuenta_id
  where id = p_pago_id;

  update nativo.ventas
  set abono = v_abono_total,
      retencion = v_ret_total,
      total_a_pagar = v.total_compra - v_ret_total,
      saldo = v_saldo,
      estado_pago = case
        when v_saldo <= 0 then 'Pagado Total'
        when v_abono_total > 0 or v_ret_total > 0 then 'Abonado'
        else 'Pendiente'
      end
  where id = v.id
  returning * into v;

  delete from nativo.movimientos_bancarios where pago_id = p_pago_id;
  if p_cuenta_id is not null and coalesce(p_abono, 0) > 0 then
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_id, usuario)
    values (p_cuenta_id, coalesce(p_fecha, pg.fecha), 'ingreso', 'pago_venta', p_abono,
            'Pago venta ticket #' || v.ticket || ' (editado)', p_pago_id, p_usuario);
  end if;

  return v;
end;
$$;

create or replace function nativo.anular_pago(
  p_pago_id bigint,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  pg nativo.pagos;
  v nativo.ventas;
  v_abono_total numeric;
  v_ret_total numeric;
  v_saldo numeric;
begin
  select * into pg from nativo.pagos where id = p_pago_id for update;
  if not found then
    raise exception 'Pago % no encontrado', p_pago_id;
  end if;

  select * into v from nativo.ventas where id = pg.venta_id for update;
  if not found then
    raise exception 'La venta del pago % no existe', p_pago_id;
  end if;

  v_abono_total := greatest(v.abono - pg.abono, 0);
  v_ret_total := greatest(v.retencion - pg.retencion, 0);
  v_saldo := (v.total_compra - v_ret_total) - v_abono_total;

  delete from nativo.pagos where id = p_pago_id;

  update nativo.ventas
  set abono = v_abono_total,
      retencion = v_ret_total,
      total_a_pagar = v.total_compra - v_ret_total,
      saldo = v_saldo,
      estado_pago = case
        when v_saldo <= 0 then 'Pagado Total'
        when v_abono_total > 0 or v_ret_total > 0 then 'Abonado'
        else 'Pendiente'
      end
  where id = v.id
  returning * into v;

  return v;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: pagar gasto (abono parcial o total) de forma atómica
-- ------------------------------------------------------------
create or replace function nativo.pagar_gasto(
  p_gasto_id bigint,
  p_cuenta_id bigint,
  p_monto numeric,
  p_fecha date,
  p_comentario text,
  p_usuario text
) returns nativo.gastos
language plpgsql
as $$
declare
  g nativo.gastos;
  v_pago_gasto_id bigint;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;
  if p_cuenta_id is null then
    raise exception 'Debe indicar la cuenta desde donde se paga';
  end if;

  insert into nativo.pagos_gastos (gasto_id, cuenta_id, fecha, monto, comentario, usuario)
  values (p_gasto_id, p_cuenta_id, coalesce(p_fecha, current_date), p_monto, p_comentario, p_usuario)
  returning id into v_pago_gasto_id;

  update nativo.gastos
  set abonado = abonado + p_monto,
      saldo = monto - (abonado + p_monto),
      estado = case when monto - (abonado + p_monto) <= 0 then 'Pagado' else 'Abonado' end
  where id = p_gasto_id
  returning * into g;

  if g.id is null then
    raise exception 'Gasto % no encontrado', p_gasto_id;
  end if;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, pago_gasto_id, usuario)
  values (p_cuenta_id, coalesce(p_fecha, current_date), 'egreso', 'pago_gasto', p_monto,
          'Pago ' || lower(g.tipo) || ': ' || coalesce(g.descripcion, g.categoria, 'sin descripción'), v_pago_gasto_id, p_usuario);

  return g;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: transferencia entre cuentas (dos asientos enlazados)
-- ------------------------------------------------------------
create or replace function nativo.transferir_cuentas(
  p_origen bigint,
  p_destino bigint,
  p_monto numeric,
  p_fecha date,
  p_concepto text,
  p_usuario text
) returns void
language plpgsql
as $$
declare
  v_egreso_id bigint;
  v_ingreso_id bigint;
  v_nombre_origen text;
  v_nombre_destino text;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_origen = p_destino then
    raise exception 'La cuenta origen y destino deben ser distintas';
  end if;

  select nombre into v_nombre_origen from nativo.cuentas_bancarias where id = p_origen;
  select nombre into v_nombre_destino from nativo.cuentas_bancarias where id = p_destino;
  if v_nombre_origen is null or v_nombre_destino is null then
    raise exception 'Cuenta origen o destino no encontrada';
  end if;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, usuario)
  values (p_origen, coalesce(p_fecha, current_date), 'egreso', 'transferencia', p_monto,
          coalesce(p_concepto, '') || ' → ' || v_nombre_destino, p_usuario)
  returning id into v_egreso_id;

  insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, movimiento_relacionado_id, usuario)
  values (p_destino, coalesce(p_fecha, current_date), 'ingreso', 'transferencia', p_monto,
          coalesce(p_concepto, '') || ' ← ' || v_nombre_origen, v_egreso_id, p_usuario)
  returning id into v_ingreso_id;

  update nativo.movimientos_bancarios set movimiento_relacionado_id = v_ingreso_id where id = v_egreso_id;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: actualizar estado de entrega de forma atómica
-- Actualiza cabecera e inserta historial en una sola transacción.
-- ------------------------------------------------------------
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
-- FUNCIÓN RPC: registrar la pérdida de una prenda devuelta, de forma
-- atómica. Resta el valor a la venta, recalcula estado_pago con la
-- MISMA regla que actualizarVenta() en ventas/acciones.ts, y si el
-- saldo queda negativo (el cliente ya había pagado de más), genera
-- el reembolso bancario y ajusta el abono para que la contabilidad
-- cuadre. Además actualiza devoluciones_detalle e inserta el
-- historial, todo en la misma transacción (mismo patrón que
-- actualizar_entrega).
-- ------------------------------------------------------------
create or replace function nativo.registrar_devolucion_perdida(
  p_devolucion_detalle_id bigint,
  p_valor_perdido numeric,
  p_cuenta_id bigint default null,
  p_fecha date default current_date,
  p_comentario text default null,
  p_usuario text default null
) returns nativo.ventas
language plpgsql
as $$
declare
  v nativo.ventas;
  v_venta_id bigint;
  v_estado_anterior text;
  v_nuevo_total numeric;
  v_nuevo_total_a_pagar numeric;
  v_nuevo_saldo numeric;
  v_reembolso numeric;
  v_ticket integer;
begin
  if coalesce(p_valor_perdido, 0) <= 0 then
    raise exception 'El valor perdido debe ser mayor a cero';
  end if;

  select d.estado, dv.venta_id into v_estado_anterior, v_venta_id
  from nativo.devoluciones_detalle d
  join nativo.devoluciones dv on dv.id = d.devolucion_id
  where d.id = p_devolucion_detalle_id;

  if v_venta_id is null then
    raise exception 'Detalle de devolución % no encontrado', p_devolucion_detalle_id;
  end if;
  if v_estado_anterior in ('Recuperada', 'Perdida') then
    raise exception 'Esta prenda ya fue resuelta (%)', v_estado_anterior;
  end if;

  select * into v from nativo.ventas where id = v_venta_id;

  v_nuevo_total := greatest(v.total_compra - p_valor_perdido, 0);
  v_nuevo_total_a_pagar := v_nuevo_total - v.retencion;
  v_nuevo_saldo := v_nuevo_total_a_pagar - v.abono;

  if v_nuevo_saldo < 0 then
    v_reembolso := -v_nuevo_saldo;
    if p_cuenta_id is null then
      raise exception 'Esta pérdida deja un saldo a favor del cliente de %; selecciona una cuenta para el reembolso.', v_reembolso;
    end if;

    update nativo.ventas
    set total_compra = v_nuevo_total, total_a_pagar = v_nuevo_total_a_pagar,
        abono = v.abono - v_reembolso, saldo = 0, estado_pago = 'Pagado Total'
    where id = v_venta_id
    returning * into v;

    select ticket into v_ticket from nativo.ventas where id = v_venta_id;
    insert into nativo.movimientos_bancarios (cuenta_id, fecha, tipo, origen, monto, concepto, usuario, venta_id)
    values (p_cuenta_id, coalesce(p_fecha, current_date), 'egreso', 'devolucion_venta', v_reembolso,
            'Reembolso por devolución - ticket #' || v_ticket, p_usuario, v_venta_id);
  else
    update nativo.ventas
    set total_compra = v_nuevo_total, total_a_pagar = v_nuevo_total_a_pagar, saldo = v_nuevo_saldo,
        estado_pago = case
          when v_nuevo_saldo <= 0 and v_nuevo_total > 0 then 'Pagado Total'
          when v.abono > 0 then 'Abonado'
          else 'Pendiente'
        end
    where id = v_venta_id
    returning * into v;
  end if;

  update nativo.devoluciones_detalle set estado = 'Perdida', valor_perdido = p_valor_perdido
  where id = p_devolucion_detalle_id;

  insert into nativo.devoluciones_historial (devolucion_detalle_id, estado_anterior, estado_nuevo, comentario, usuario)
  values (p_devolucion_detalle_id, v_estado_anterior, 'Perdida', p_comentario, p_usuario);

  return v;
end;
$$;

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
-- FUNCIÓN RPC: ingresar inventario (entrada / inventario inicial /
-- devolución) con recálculo de costo promedio ponderado, atómico.
-- p_costo_unitario null = entra al costo promedio actual sin
-- alterarlo (ej. devoluciones).
-- ------------------------------------------------------------
create or replace function nativo.ingresar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_costo_unitario numeric default null,
  p_tipo text default 'entrada',
  p_referencia text default null,
  p_proveedor_id bigint default null,
  p_numero_factura text default null,
  p_lote text default null,
  p_motivo text default null,
  p_usuario text default null,
  p_venta_id bigint default null,
  p_fecha timestamptz default now()
) returns nativo.productos
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_stock_total numeric;
  v_costo numeric;
  v_nuevo_costo numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_tipo not in ('entrada', 'inventario_inicial', 'devolucion') then
    raise exception 'Tipo de ingreso inválido: %', p_tipo;
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;
  if prod.es_servicio then
    raise exception 'El producto "%" es un servicio: no maneja inventario', prod.nombre;
  end if;
  if not prod.controla_inventario then
    raise exception 'El producto "%" no controla inventario; actívalo en el catálogo primero', prod.nombre;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  -- Costo promedio ponderado
  v_costo := coalesce(p_costo_unitario, prod.costo_promedio);
  if v_stock_total + p_cantidad > 0 then
    v_nuevo_costo := round(
      (v_stock_total * prod.costo_promedio + p_cantidad * v_costo)
      / (v_stock_total + p_cantidad), 4);
  else
    v_nuevo_costo := v_costo;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  update nativo.productos
  set costo_promedio = v_nuevo_costo,
      precio_compra = case when p_costo_unitario is not null and p_tipo in ('entrada', 'inventario_inicial')
                           then p_costo_unitario else precio_compra end
  where id = p_producto_id
  returning * into prod;

  insert into nativo.inventario_movimientos
    (fecha, tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
     saldo_despues, referencia, venta_id, proveedor_id, numero_factura, lote, motivo, usuario)
  values (coalesce(p_fecha, now()), p_tipo, prod.id,
          coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, p_cantidad, v_costo,
          v_stock_total + p_cantidad, p_referencia, p_venta_id, p_proveedor_id,
          p_numero_factura, p_lote, p_motivo, p_usuario);

  -- Surtido automático FIFO de pendientes por surtir (ventas sin inventario)
  perform nativo.surtir_pendientes(p_producto_id, p_usuario);

  return prod;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: traslado entre ubicaciones (dos asientos kardex).
-- El costo promedio y el stock total no cambian.
-- ------------------------------------------------------------
create or replace function nativo.trasladar_inventario(
  p_producto_id bigint,
  p_origen_id bigint,
  p_destino_id bigint,
  p_cantidad numeric,
  p_motivo text default null,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_origen text; v_destino text;
  v_en_origen numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'La ubicación origen y destino deben ser distintas';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_origen from nativo.inventario_ubicaciones where id = p_origen_id;
  select nombre into v_destino from nativo.inventario_ubicaciones where id = p_destino_id;
  if v_origen is null or v_destino is null then
    raise exception 'Ubicación origen o destino no encontrada';
  end if;

  select coalesce(cantidad, 0) into v_en_origen
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;
  if coalesce(v_en_origen, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas trasladar %', v_origen, coalesce(v_en_origen, 0), p_cantidad;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_origen_id;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_destino_id, p_cantidad, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values
    ('traslado_salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_origen_id, v_origen, -p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario),
    ('traslado_entrada', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
     p_destino_id, v_destino, p_cantidad, prod.costo_promedio, v_stock_total,
     v_origen || ' → ' || v_destino, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: ajuste puntual (conteo físico de un producto en
-- una ubicación). Deja la existencia = cantidad física y registra
-- la DIFERENCIA (con signo) en el kardex. No cambia el costo.
-- ------------------------------------------------------------
create or replace function nativo.ajustar_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad_fisica numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns numeric
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_actual numeric;
  v_diferencia numeric;
  v_stock_total numeric;
begin
  if coalesce(p_cantidad_fisica, -1) < 0 then
    raise exception 'La cantidad física no puede ser negativa';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_actual
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  v_actual := coalesce(v_actual, 0);

  v_diferencia := p_cantidad_fisica - v_actual;
  if v_diferencia = 0 then
    raise exception 'No hay diferencia que ajustar: el sistema ya registra % en %', v_actual, v_ubicacion;
  end if;

  insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
  values (p_producto_id, p_ubicacion_id, p_cantidad_fisica, now())
  on conflict (producto_id, ubicacion_id)
  do update set cantidad = excluded.cantidad, actualizado_en = now();

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('ajuste', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, v_diferencia, prod.costo_promedio, v_stock_total,
          p_referencia, p_motivo, p_usuario);

  return v_diferencia;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: salida manual (bajas, muestras, obsequios).
-- Valida stock físico en la ubicación y que la salida no rompa
-- las reservas respaldadas por stock.
-- ------------------------------------------------------------
create or replace function nativo.salida_manual_inventario(
  p_producto_id bigint,
  p_ubicacion_id bigint,
  p_cantidad numeric,
  p_motivo text,
  p_usuario text default null,
  p_referencia text default null
) returns void
language plpgsql
as $$
declare
  prod nativo.productos;
  v_ubicacion text;
  v_en_ubicacion numeric;
  v_stock_total numeric;
  v_respaldado numeric;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into prod from nativo.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  select nombre into v_ubicacion from nativo.inventario_ubicaciones where id = p_ubicacion_id;
  if v_ubicacion is null then
    raise exception 'Ubicación % no encontrada', p_ubicacion_id;
  end if;

  select coalesce(cantidad, 0) into v_en_ubicacion
  from nativo.inventario_existencias
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;
  if coalesce(v_en_ubicacion, 0) < p_cantidad then
    raise exception 'Stock insuficiente en %: hay %, intentas sacar %', v_ubicacion, coalesce(v_en_ubicacion, 0), p_cantidad;
  end if;

  select coalesce(sum(cantidad), 0) into v_stock_total
  from nativo.inventario_existencias where producto_id = p_producto_id;
  select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_respaldado
  from nativo.inventario_reservas
  where producto_id = p_producto_id and estado = 'Activa';

  if v_stock_total - p_cantidad < v_respaldado then
    raise exception 'No puedes sacar % unidades: hay % reservadas para ventas pendientes de despacho', p_cantidad, v_respaldado;
  end if;

  update nativo.inventario_existencias
  set cantidad = cantidad - p_cantidad, actualizado_en = now()
  where producto_id = p_producto_id and ubicacion_id = p_ubicacion_id;

  insert into nativo.inventario_movimientos
    (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario, saldo_despues, referencia, motivo, usuario)
  values ('salida', prod.id, coalesce(prod.sku || ' — ', '') || prod.nombre,
          p_ubicacion_id, v_ubicacion, -p_cantidad, prod.costo_promedio, v_stock_total - p_cantidad,
          p_referencia, p_motivo, p_usuario);
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: reservar inventario para una venta. Idempotente:
-- cancela las reservas Activas anteriores de la venta y crea las
-- nuevas (compatible con el delete+reinsert de líneas al editar).
-- permitir_faltante=true (venta sin inventario) deja la parte sin
-- respaldo como cantidad_pendiente (pendiente por surtir).
-- ------------------------------------------------------------
create or replace function nativo.reservar_venta(
  p_venta_id bigint,
  p_lineas jsonb,   -- [{"producto_id":7,"cantidad":3,"permitir_faltante":true}, ...]
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  v_ticket integer;
  l record;
  prod nativo.productos;
  v_fisico numeric; v_reservado numeric; v_disponible numeric; v_pendiente numeric;
begin
  select ticket into v_ticket from nativo.ventas where id = p_venta_id;
  if v_ticket is null then
    raise exception 'Venta % no encontrada', p_venta_id;
  end if;

  if exists (select 1 from nativo.inventario_reservas
             where venta_id = p_venta_id and estado = 'Despachada') then
    raise exception 'La venta #% ya tiene mercancía despachada del inventario; usa Ajustes o Devoluciones para corregir', v_ticket;
  end if;

  update nativo.inventario_reservas set estado = 'Cancelada'
  where venta_id = p_venta_id and estado = 'Activa';

  for l in select (e->>'producto_id')::bigint producto_id,
                  (e->>'cantidad')::numeric cantidad,
                  coalesce((e->>'permitir_faltante')::boolean, false) permitir_faltante
           from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) e
  loop
    if coalesce(l.cantidad, 0) <= 0 then continue; end if;

    select * into prod from nativo.productos where id = l.producto_id for update;
    if not found or not prod.controla_inventario or prod.es_servicio then continue; end if;

    select coalesce(sum(cantidad), 0) into v_fisico
      from nativo.inventario_existencias where producto_id = l.producto_id;
    select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_reservado
      from nativo.inventario_reservas where producto_id = l.producto_id and estado = 'Activa';
    v_disponible := greatest(v_fisico - v_reservado, 0);

    if l.cantidad > v_disponible and not l.permitir_faltante then
      raise exception 'Stock insuficiente de "%": disponible %, pedido %. Marca "Venta sin inventario" en esa línea para continuar.',
        prod.nombre, v_disponible, l.cantidad;
    end if;
    v_pendiente := greatest(l.cantidad - v_disponible, 0);

    insert into nativo.inventario_reservas
      (venta_id, ticket, producto_id, producto, cantidad, cantidad_pendiente, estado, usuario, fecha_surtido)
    values (p_venta_id, v_ticket, prod.id,
            coalesce(prod.sku || ' — ', '') || prod.nombre,
            l.cantidad, v_pendiente, 'Activa', p_usuario,
            case when v_pendiente = 0 then now() else null end);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: despachar una venta (descuento físico al entregar).
-- Saca lo respaldado de cada reserva Activa (primero de Bodega),
-- kardex tipo 'venta' al costo promedio del momento, y marca la
-- reserva Despachada (o la reduce a lo pendiente). Idempotente.
-- ------------------------------------------------------------
create or replace function nativo.despachar_venta(
  p_venta_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  r record; ub record;
  v_por_sacar numeric; v_toma numeric; v_saldo numeric; v_costo numeric;
begin
  for r in select * from nativo.inventario_reservas
           where venta_id = p_venta_id and estado = 'Activa'
           order by id
           for update
  loop
    perform 1 from nativo.productos where id = r.producto_id for update;
    v_por_sacar := r.cantidad - r.cantidad_pendiente;
    if v_por_sacar <= 0 then continue; end if;

    select costo_promedio into v_costo from nativo.productos where id = r.producto_id;

    for ub in select e.id, e.ubicacion_id, e.cantidad, u.nombre
              from nativo.inventario_existencias e
              join nativo.inventario_ubicaciones u on u.id = e.ubicacion_id
              where e.producto_id = r.producto_id and e.cantidad > 0
              order by case when u.nombre = 'Bodega' then 0 else 1 end, e.id
    loop
      exit when v_por_sacar <= 0;
      v_toma := least(ub.cantidad, v_por_sacar);
      update nativo.inventario_existencias
      set cantidad = cantidad - v_toma, actualizado_en = now()
      where id = ub.id;
      select coalesce(sum(cantidad), 0) into v_saldo
        from nativo.inventario_existencias where producto_id = r.producto_id;
      insert into nativo.inventario_movimientos
        (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
         saldo_despues, referencia, venta_id, usuario)
      values ('venta', r.producto_id, r.producto, ub.ubicacion_id, ub.nombre, -v_toma,
              v_costo, v_saldo, 'Ticket #' || r.ticket, p_venta_id, p_usuario);
      v_por_sacar := v_por_sacar - v_toma;
    end loop;

    if v_por_sacar > 0 then
      raise exception 'Inconsistencia de inventario: la reserva de "%" no tiene respaldo físico suficiente', r.producto;
    end if;

    if r.cantidad_pendiente > 0 then
      update nativo.inventario_reservas
      set cantidad = cantidad_pendiente, fecha_despacho = now()
      where id = r.id;
    else
      update nativo.inventario_reservas
      set estado = 'Despachada', fecha_despacho = now()
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: surtir pendientes por surtir (FIFO) con el stock
-- libre. Si la venta ya está Entregada, auto-despacha lo surtido.
-- La llama ingresar_inventario al final de cada ingreso.
-- ------------------------------------------------------------
create or replace function nativo.surtir_pendientes(
  p_producto_id bigint,
  p_usuario text default null
) returns void
language plpgsql
as $$
declare
  r record; v_fisico numeric; v_respaldado numeric; v_libre numeric; v_asigna numeric;
  v_entregada boolean;
begin
  select coalesce(sum(cantidad), 0) into v_fisico
    from nativo.inventario_existencias where producto_id = p_producto_id;
  select coalesce(sum(cantidad - cantidad_pendiente), 0) into v_respaldado
    from nativo.inventario_reservas where producto_id = p_producto_id and estado = 'Activa';
  v_libre := v_fisico - v_respaldado;

  for r in select * from nativo.inventario_reservas
           where producto_id = p_producto_id and estado = 'Activa' and cantidad_pendiente > 0
           order by creado_en, id
           for update
  loop
    exit when v_libre <= 0;
    v_asigna := least(r.cantidad_pendiente, v_libre);
    update nativo.inventario_reservas
    set cantidad_pendiente = cantidad_pendiente - v_asigna,
        fecha_surtido = case when cantidad_pendiente - v_asigna = 0 then now() else fecha_surtido end
    where id = r.id;
    v_libre := v_libre - v_asigna;

    select lower(trim(coalesce(estado_entrega, ''))) = 'entregado' into v_entregada
      from nativo.ventas where id = r.venta_id;
    if coalesce(v_entregada, false) then
      perform nativo.despachar_venta(r.venta_id, p_usuario);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: cerrar un arqueo aplicando el cuadre masivo, atómico.
-- Aplica el DELTA de cada diferencia (no el absoluto — tolera
-- movimientos ocurridos después del conteo). Si un delta negativo
-- dejaría una existencia bajo cero, TODO el cierre se revierte.
-- El PIN de gerencia se valida en la server action antes de llamar.
-- ------------------------------------------------------------
create or replace function nativo.cerrar_arqueo(
  p_arqueo_id bigint,
  p_usuario text default null
) returns table (ajustados integer, valor_diferencia numeric)
language plpgsql
as $$
declare
  a nativo.arqueos;
  d record;
  v_ajustados integer := 0;
  v_valor numeric := 0;
  v_saldo numeric;
begin
  select * into a from nativo.arqueos where id = p_arqueo_id for update;
  if not found then
    raise exception 'Arqueo % no encontrado', p_arqueo_id;
  end if;
  if a.estado <> 'Abierto' then
    raise exception 'El arqueo #% ya está %', a.numero, a.estado;
  end if;

  for d in select ad.* from nativo.arqueos_detalle ad
           where ad.arqueo_id = p_arqueo_id
             and ad.cantidad_fisica is not null
             and ad.diferencia is not null and ad.diferencia <> 0
           order by ad.producto_id
  loop
    if d.producto_id is null or d.ubicacion_id is null then continue; end if;
    perform 1 from nativo.productos where id = d.producto_id for update;

    insert into nativo.inventario_existencias (producto_id, ubicacion_id, cantidad, actualizado_en)
    values (d.producto_id, d.ubicacion_id, d.diferencia, now())
    on conflict (producto_id, ubicacion_id)
    do update set cantidad = nativo.inventario_existencias.cantidad + excluded.cantidad,
                  actualizado_en = now();

    select coalesce(sum(cantidad), 0) into v_saldo
      from nativo.inventario_existencias where producto_id = d.producto_id;

    insert into nativo.inventario_movimientos
      (tipo, producto_id, producto, ubicacion_id, ubicacion, cantidad, costo_unitario,
       saldo_despues, referencia, motivo, usuario, arqueo_id)
    values ('ajuste', d.producto_id, d.producto, d.ubicacion_id, d.ubicacion, d.diferencia,
            d.costo_unitario, v_saldo, 'Arqueo #' || a.numero, 'Cuadre de conteo físico',
            p_usuario, p_arqueo_id);

    v_ajustados := v_ajustados + 1;
    v_valor := v_valor + d.diferencia * d.costo_unitario;
  end loop;

  update nativo.arqueos
  set estado = 'Cerrado', fecha_cierre = now(), usuario_cierra = p_usuario
  where id = p_arqueo_id;

  return query select v_ajustados, v_valor;
end;
$$;

-- ------------------------------------------------------------
-- FUNCIÓN RPC: recibir orden de compra (total o parcial), atómico.
-- Ingresa el inventario línea a línea (costo promedio incluido),
-- acumula cantidad_recibida, recalcula el estado de la orden y,
-- si p_crear_gasto, genera el Gasto en Financiero (tipo Costo,
-- categoría 'Compra Inventario') por lo recibido en ESTA recepción.
-- ------------------------------------------------------------
create or replace function nativo.recibir_orden_compra(
  p_orden_id bigint,
  p_lineas jsonb,           -- [{"detalle_id":1,"cantidad":5,"ubicacion_id":1,"lote":null}, ...]
  p_numero_factura text default null,
  p_fecha date default current_date,
  p_usuario text default null,
  p_crear_gasto boolean default true
) returns nativo.ordenes_compra
language plpgsql
as $$
declare
  oc nativo.ordenes_compra;
  l record;
  det nativo.ordenes_compra_detalle;
  v_monto_recibido numeric := 0;
  v_gasto_id bigint;
  v_ticket integer;
  v_pendientes integer;
begin
  select * into oc from nativo.ordenes_compra where id = p_orden_id for update;
  if not found then
    raise exception 'Orden de compra % no encontrada', p_orden_id;
  end if;
  if oc.estado not in ('Enviada', 'Recibida Parcial') then
    raise exception 'La orden #% está en estado "%"; solo se reciben órdenes Enviadas o con recepción parcial', oc.numero, oc.estado;
  end if;

  for l in select (e->>'detalle_id')::bigint detalle_id,
                  (e->>'cantidad')::numeric cantidad,
                  (e->>'ubicacion_id')::bigint ubicacion_id,
                  nullif(e->>'lote', '') lote
           from jsonb_array_elements(p_lineas) e
  loop
    if coalesce(l.cantidad, 0) <= 0 then continue; end if;
    if l.ubicacion_id is null then
      raise exception 'Indica la ubicación de ingreso de cada línea recibida';
    end if;

    select * into det from nativo.ordenes_compra_detalle
    where id = l.detalle_id and orden_compra_id = p_orden_id;
    if not found then
      raise exception 'La línea % no pertenece a esta orden', l.detalle_id;
    end if;
    if l.cantidad > det.cantidad - det.cantidad_recibida then
      raise exception 'La línea "%" solo tiene % pendientes por recibir', det.producto, det.cantidad - det.cantidad_recibida;
    end if;
    if det.producto_id is null then
      raise exception 'La línea "%" no tiene producto de inventario vinculado', det.producto;
    end if;

    perform nativo.ingresar_inventario(
      det.producto_id, l.ubicacion_id, l.cantidad, det.precio_unitario,
      'entrada', 'OC #' || oc.numero, oc.proveedor_id, p_numero_factura, l.lote,
      null, p_usuario, null, coalesce(p_fecha, current_date)::timestamptz);

    update nativo.ordenes_compra_detalle
    set cantidad_recibida = cantidad_recibida + l.cantidad
    where id = l.detalle_id;

    v_monto_recibido := v_monto_recibido + l.cantidad * det.precio_unitario;
  end loop;

  if v_monto_recibido <= 0 then
    raise exception 'No se recibió ninguna cantidad';
  end if;

  if p_crear_gasto then
    select coalesce(max(ticket), 0) + 1 into v_ticket from nativo.gastos;
    insert into nativo.gastos
      (ticket, fecha, tipo, categoria, proveedor, proveedor_id, numero_factura, monto, abonado, saldo, estado, usuario)
    values (v_ticket, coalesce(p_fecha, current_date), 'Costo', 'Compra Inventario',
            oc.proveedor, oc.proveedor_id, p_numero_factura, v_monto_recibido, 0, v_monto_recibido, 'Pendiente', p_usuario)
    returning id into v_gasto_id;

    insert into nativo.gastos_detalle (gasto_id, cantidad, unidad_medida, articulo, precio_unitario, valor_total)
    select v_gasto_id, (e->>'cantidad')::numeric, null,
           'OC #' || oc.numero || ' — ' || d.producto,
           d.precio_unitario, (e->>'cantidad')::numeric * d.precio_unitario
    from jsonb_array_elements(p_lineas) e
    join nativo.ordenes_compra_detalle d on d.id = (e->>'detalle_id')::bigint
    where coalesce((e->>'cantidad')::numeric, 0) > 0;
  end if;

  select count(*) into v_pendientes from nativo.ordenes_compra_detalle
  where orden_compra_id = p_orden_id and cantidad_recibida < cantidad;

  update nativo.ordenes_compra
  set estado = case when v_pendientes = 0 then 'Recibida' else 'Recibida Parcial' end,
      gasto_id = coalesce(v_gasto_id, gasto_id)
  where id = p_orden_id
  returning * into oc;

  return oc;
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
-- Semillas: lista maestra de talleres/ubicaciones
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('taller', 'Tribey'),
  ('taller', 'Bordados JA'),
  ('taller', 'Madamis')
on conflict do nothing;

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

insert into nativo.listas_maestras (tipo, valor) values
  ('causal_devolucion', 'Talla incorrecta'),
  ('causal_devolucion', 'Color incorrecto'),
  ('causal_devolucion', 'Defecto de bordado'),
  ('causal_devolucion', 'Defecto de estampado'),
  ('causal_devolucion', 'Producto dañado'),
  ('causal_devolucion', 'Cambio de decisión del cliente'),
  ('causal_devolucion', 'Otro')
on conflict do nothing;

-- ------------------------------------------------------------
-- Semillas: inventario (ubicaciones, categorías de producto,
-- tipos de manga, motivos de ajuste y traslado)
-- ------------------------------------------------------------
insert into nativo.inventario_ubicaciones (nombre) values ('Bodega'), ('Exhibición')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_producto', 'Camisetas'),
  ('categoria_producto', 'Camisas'),
  ('categoria_producto', 'Jeans'),
  ('categoria_producto', 'Gorras'),
  ('categoria_producto', 'Buff'),
  ('categoria_producto', 'Telas'),
  ('categoria_producto', 'Botones'),
  ('categoria_producto', 'Insumos'),
  ('categoria_producto', 'Empaques'),
  ('categoria_producto', 'Servicios'),
  ('tipo_manga', 'Manga corta'),
  ('tipo_manga', 'Manga larga'),
  ('tipo_manga', 'Sin manga'),
  ('motivo_ajuste', 'Conteo físico'),
  ('motivo_ajuste', 'Producto dañado'),
  ('motivo_ajuste', 'Pérdida/Robo'),
  ('motivo_ajuste', 'Error de registro'),
  ('motivo_ajuste', 'Otro'),
  ('motivo_traslado', 'Reposición exhibición'),
  ('motivo_traslado', 'Reorganización'),
  ('motivo_traslado', 'Otro')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Compra Inventario')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Reproceso')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('tipo_proveedor', 'Telas'),
  ('tipo_proveedor', 'Insumos'),
  ('tipo_proveedor', 'Diseñadores gráficos'),
  ('tipo_proveedor', 'Bordado'),
  ('tipo_proveedor', 'Estampado'),
  ('tipo_proveedor', 'Publicidad'),
  ('tipo_proveedor', 'Servicios'),
  ('tipo_proveedor', 'Transportadora'),
  ('tipo_proveedor', 'Otros')
on conflict do nothing;

-- ------------------------------------------------------------
-- Semillas: activos fijos (categorías, ubicaciones, motivos de
-- baja) y categoría de gasto para la compra de activos
-- ------------------------------------------------------------
insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_activo', 'Mobiliario'),
  ('categoria_activo', 'Equipos de Cómputo'),
  ('categoria_activo', 'Equipos de Oficina'),
  ('categoria_activo', 'Herramientas'),
  ('categoria_activo', 'Electrodomésticos'),
  ('categoria_activo', 'Vehículos'),
  ('categoria_activo', 'Otros'),
  ('ubicacion_activo', 'Oficina Principal'),
  ('ubicacion_activo', 'Bodega'),
  ('ubicacion_activo', 'Taller'),
  ('ubicacion_activo', 'Local/Punto de Venta'),
  ('motivo_baja_activo', 'Vendido'),
  ('motivo_baja_activo', 'Dañado/Obsoleto'),
  ('motivo_baja_activo', 'Donado'),
  ('motivo_baja_activo', 'Perdido/Robado'),
  ('motivo_baja_activo', 'Otro'),
  ('area_activo', 'Administración'),
  ('area_activo', 'Producción'),
  ('area_activo', 'Ventas'),
  ('area_activo', 'Diseño'),
  ('area_activo', 'Bodega'),
  ('estado_activo', 'Nuevo'),
  ('estado_activo', 'Bueno'),
  ('estado_activo', 'Regular'),
  ('estado_activo', 'Malo'),
  ('estado_activo', 'Fuera de servicio'),
  ('area_solicitud', 'Contabilidad'),
  ('area_solicitud', 'Logística'),
  ('area_solicitud', 'Producción'),
  ('area_solicitud', 'Comercial'),
  ('area_solicitud', 'Marketing'),
  ('area_solicitud', 'Gerencia')
on conflict do nothing;

insert into nativo.listas_maestras (tipo, valor) values
  ('categoria_gasto', 'Compra de Activo Fijo')
on conflict do nothing;

-- ------------------------------------------------------------
-- Permisos para los roles de la API de Supabase
-- (el acceso real de la app es solo server-side con service_role)
-- ------------------------------------------------------------
grant usage on schema nativo to anon, authenticated, service_role;
grant all on all tables in schema nativo to service_role;
grant all on all sequences in schema nativo to service_role;
grant all on all functions in schema nativo to service_role;
alter default privileges in schema nativo grant all on tables to service_role;
alter default privileges in schema nativo grant all on sequences to service_role;
alter default privileges in schema nativo grant all on functions to service_role;
