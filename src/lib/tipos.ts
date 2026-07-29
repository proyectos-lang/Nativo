export type Permisos = {
  dashboard: boolean;
  ventas: boolean;
  pagos: boolean;
  entregas: boolean;
  seguimiento: boolean;
  prospectos: boolean;
  clientes: boolean;
  proveedores: boolean;
  configuracion: boolean;
  financiero: boolean;
  devoluciones: boolean;
  inventario: boolean;
  compras: boolean;
  activos: boolean;
  solicitudes: boolean;
};

export type Modulo = keyof Permisos;

export type Sesion = {
  id: number;
  nombre: string;
  usuario: string;
  rol: "admin" | "usuario";
  permisos: Permisos;
};

export type Cliente = {
  id: number;
  nombre: string;
  empresa: string | null;
  contacto: string | null;
  ciudad: string | null;
  departamento: string | null;
  direccion: string | null;
  correo: string | null;
  cedula_nit: string | null;
  rut: string | null;
  digito_verificacion: string | null;
  activo: boolean;
};

export type Proveedor = {
  id: number;
  nombre: string;
  nit: string | null;
  tipo: string | null;
  contacto: string | null;
  correo: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
};

export type Activo = {
  id: number;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  descripcion: string | null;
  cantidad: number;
  costo_unitario: number;
  valor_total: number;
  proveedor_id: number | null;
  proveedor: string | null;
  numero_factura: string | null;
  fecha_compra: string;
  ubicacion: string | null;
  fecha_ingreso: string | null;
  area: string | null;
  marca: string | null;
  color: string | null;
  dimensiones: string | null;
  modelo: string | null;
  numero_serie: string | null;
  estado_actual: string | null;
  garantia_vida_util: string | null;
  fecha_valuacion: string | null;
  valor_actual_depreciacion: number | null;
  estado: "Activo" | "Vendido" | "Dado de Baja";
  fecha_baja: string | null;
  motivo_baja: string | null;
  valor_baja: number | null;
  observaciones_baja: string | null;
  gasto_id: number | null;
  usuario: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type EstadoSolicitud = "Pendiente" | "En proceso" | "Esperando información" | "Esperando aprobación" | "Finalizada" | "Cancelada";
export type PrioridadSolicitud = "Baja" | "Media" | "Alta" | "Urgente";

export type Solicitud = {
  id: number;
  numero: number;
  fecha_creacion: string;
  solicitado_por_id: number | null;
  solicitado_por: string | null;
  responsable_id: number | null;
  responsable: string | null;
  area: string | null;
  titulo: string;
  descripcion: string | null;
  prioridad: PrioridadSolicitud;
  fecha_limite: string | null;
  estado: EstadoSolicitud;
  fecha_finalizacion: string | null;
  observaciones_finales: string | null;
  usuario: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type SolicitudHistorial = {
  id: number;
  solicitud_id: number;
  fecha: string;
  tipo: "creacion" | "comentario" | "cambio_estado" | "reasignacion" | "finalizacion";
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string | null;
  usuario: string | null;
  creado_en: string;
};

export type SolicitudAdjunto = {
  id: number;
  solicitud_id: number;
  url: string;
  nombre: string | null;
  tipo: string | null;
  usuario: string | null;
  creado_en: string;
};

export type Producto = {
  id: number;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  categoria: string | null;
  subcategoria: string | null;
  sexo: string | null;
  talla: string | null;
  color: string | null;
  manga: string | null;
  unidad_medida: string;
  precio_compra: number;
  precio_venta_antes_iva: number;
  iva_porcentaje: number;
  precio_venta: number;
  costo_promedio: number;
  es_servicio: boolean;
  controla_inventario: boolean;
  estado: "Activo" | "Descontinuado";
  fecha_vencimiento: string | null;
  stock_minimo: number;
  stock_maximo: number | null;
  creado_en: string;
};

export type InventarioUbicacion = {
  id: number;
  nombre: string;
  activa: boolean;
  creado_en: string;
};

export type InventarioExistencia = {
  id: number;
  producto_id: number;
  ubicacion_id: number;
  cantidad: number;
  actualizado_en: string;
};

export type InventarioMovimiento = {
  id: number;
  fecha: string;
  tipo: "inventario_inicial" | "entrada" | "devolucion" | "salida" | "venta" | "traslado_salida" | "traslado_entrada" | "ajuste";
  producto_id: number | null;
  producto: string;
  ubicacion_id: number | null;
  ubicacion: string | null;
  cantidad: number;
  costo_unitario: number | null;
  saldo_despues: number;
  referencia: string | null;
  venta_id: number | null;
  proveedor_id: number | null;
  numero_factura: string | null;
  lote: string | null;
  motivo: string | null;
  usuario: string | null;
  creado_en: string;
};

export type InventarioReserva = {
  id: number;
  venta_id: number;
  ticket: number;
  producto_id: number;
  producto: string;
  cantidad: number;
  cantidad_pendiente: number;
  estado: "Activa" | "Despachada" | "Cancelada";
  fecha_surtido: string | null;
  fecha_despacho: string | null;
  usuario: string | null;
  creado_en: string;
};

/** Info liviana del catálogo para el formulario de ventas (match por nombre). */
export type InfoInventarioVenta = {
  nombre: string;
  sku: string | null;
  es_servicio: boolean;
  controla_inventario: boolean;
  disponible: number;
};

export type OrdenCompra = {
  id: number;
  numero: number;
  fecha: string;
  proveedor_id: number | null;
  proveedor: string | null;
  estado: "Borrador" | "Enviada" | "Recibida Parcial" | "Recibida" | "Anulada";
  fecha_esperada: string | null;
  observaciones: string | null;
  total: number;
  gasto_id: number | null;
  usuario: string | null;
  creado_en: string;
};

export type OrdenCompraDetalle = {
  id: number;
  orden_compra_id: number;
  producto_id: number | null;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  valor_total: number;
  cantidad_recibida: number;
  creado_en: string;
};

export type Arqueo = {
  id: number;
  numero: number;
  fecha_inicio: string;
  fecha_cierre: string | null;
  estado: "Abierto" | "Cerrado" | "Anulado";
  categoria: string | null;
  ubicacion_id: number | null;
  observaciones: string | null;
  usuario_abre: string | null;
  usuario_cierra: string | null;
  creado_en: string;
};

export type ArqueoDetalle = {
  id: number;
  arqueo_id: number;
  producto_id: number | null;
  producto: string;
  ubicacion_id: number | null;
  ubicacion: string | null;
  cantidad_sistema: number;
  cantidad_fisica: number | null;
  diferencia: number | null;
  costo_unitario: number;
  contado_en: string | null;
  usuario: string | null;
};

export const NOMBRE_TIPO_MOVIMIENTO_INVENTARIO: Record<string, string> = {
  inventario_inicial: "Inventario Inicial",
  entrada: "Entrada",
  devolucion: "Devolución",
  salida: "Salida",
  venta: "Venta",
  traslado_salida: "Traslado (salida)",
  traslado_entrada: "Traslado (entrada)",
  ajuste: "Ajuste",
};

export type Venta = {
  id: number;
  ticket: number;
  fecha: string;
  cliente_id: number | null;
  canal_venta: string | null;
  campana: string | null;
  vendedora: string | null;
  profesional: string | null;
  motivo_compra: string | null;
  /** Orden de compra / pedido que envía el cliente. */
  orden_compra_cliente: string | null;
  total_compra: number;
  retencion: number;
  total_a_pagar: number;
  abono: number;
  saldo: number;
  estado_pago: string | null;
  fecha_pago: string | null;
  tipo_pago: string | null;
  medio_pago: string | null;
  observaciones_pago: string | null;
  estado_entrega: string | null;
  fecha_entrega: string | null;
  fecha_entrega_real: string | null;
  transportadora: string | null;
  numero_guia: string | null;
  comentario_entrega: string | null;
  costo_envio: number;
  ubicacion_actual: string | null;
  creado_en: string;
  clientes?: Cliente | null;
};

export type VentaDetalle = {
  id: number;
  venta_id: number;
  producto: string;
  codigo_producto: string | null;
  cantidad: number;
  talla: string | null;
  color: string | null;
  sexo: string | null;
  estampado: string | null;
  bordado: string | null;
  guia_estampado: string | null;
  guia_bordado: string | null;
  imagen_estampado_url: string | null;
  imagen_bordado_url: string | null;
  valor_unitario: number;
  valor_total: number;
  listo: boolean;
};

export type Pago = {
  id: number;
  venta_id: number;
  fecha: string;
  abono: number;
  retencion: number;
  retefuente: number;
  reteiva: number;
  reteica: number;
  comentario: string | null;
  usuario: string | null;
  cuenta_id: number | null;
  creado_en: string;
};

export type HistorialEntrega = {
  id: number;
  venta_id: number;
  fecha: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  comentario: string | null;
  ubicacion: string | null;
  usuario: string | null;
};

export type Prospecto = {
  id: number;
  fecha: string;
  referido_por: string | null;
  evento_lugar: string | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  descripcion: string | null;
  estado: string;
  fecha_contacto: string | null;
  proximo_contacto: string | null;
  observaciones: string | null;
};

export type Usuario = {
  id: number;
  nombre: string;
  usuario: string;
  correo: string | null;
  rol: "admin" | "usuario";
  permisos: Permisos;
  activo: boolean;
};

export const MODULOS: { clave: Modulo; nombre: string }[] = [
  { clave: "dashboard", nombre: "Dashboard" },
  { clave: "ventas", nombre: "Ventas" },
  { clave: "pagos", nombre: "Pagos" },
  { clave: "entregas", nombre: "Entregas" },
  { clave: "devoluciones", nombre: "Devoluciones" },
  { clave: "seguimiento", nombre: "Seguimiento" },
  { clave: "prospectos", nombre: "Prospectos" },
  { clave: "clientes", nombre: "Clientes" },
  { clave: "proveedores", nombre: "Proveedores" },
  { clave: "inventario", nombre: "Inventario" },
  { clave: "compras", nombre: "Compras" },
  { clave: "activos", nombre: "Activos Fijos" },
  { clave: "solicitudes", nombre: "Solicitudes Internas" },
  { clave: "financiero", nombre: "Financiero" },
  { clave: "configuracion", nombre: "Configuración" },
];

/** URL de cada módulo — usado por requierePermisoPagina() para redirigir. */
export const MODULO_URL: Record<Modulo, string> = {
  dashboard: "/",
  ventas: "/ventas",
  pagos: "/pagos",
  entregas: "/entregas",
  devoluciones: "/devoluciones",
  seguimiento: "/seguimiento",
  prospectos: "/prospectos",
  clientes: "/clientes",
  proveedores: "/proveedores",
  inventario: "/inventario",
  compras: "/compras",
  activos: "/activos",
  solicitudes: "/solicitudes",
  financiero: "/financiero",
  configuracion: "/configuracion",
};

export type CuentaBancaria = {
  id: number;
  nombre: string;
  banco: string | null;
  numero_cuenta: string | null;
  saldo_inicial: number;
  activa: boolean;
  creado_en: string;
  /** Calculado en consultas: saldo_inicial + ingresos - egresos */
  saldo_actual?: number;
};

export type MovimientoBancario = {
  id: number;
  cuenta_id: number;
  fecha: string;
  tipo: "ingreso" | "egreso";
  origen: "manual" | "pago_venta" | "pago_gasto" | "transferencia" | "pago_ingreso" | "devolucion_venta";
  monto: number;
  concepto: string | null;
  pago_id: number | null;
  pago_gasto_id: number | null;
  pago_ingreso_id: number | null;
  movimiento_relacionado_id: number | null;
  venta_id: number | null;
  usuario: string | null;
  creado_en: string;
  /** Calculado en consultas: cliente o proveedor al que se le causó el movimiento. */
  tercero?: string | null;
  /** Calculado en consultas: número de factura del gasto o ingreso asociado. */
  factura?: string | null;
};

export const NOMBRE_ORIGEN_MOVIMIENTO: Record<string, string> = {
  manual: "Manual",
  pago_venta: "Pago de venta",
  pago_gasto: "Pago de gasto",
  transferencia: "Transferencia",
  pago_ingreso: "Cobro de ingreso",
  devolucion_venta: "Reembolso por devolución",
};

export type Devolucion = {
  id: number;
  venta_id: number;
  fecha: string;
  usuario: string | null;
  comentario: string | null;
  creado_en: string;
};

export type DevolucionDetalle = {
  id: number;
  devolucion_id: number;
  ventas_detalle_id: number | null;
  producto: string;
  talla: string | null;
  color: string | null;
  valor_unitario: number;
  cantidad_devuelta: number;
  causal: string | null;
  observacion: string | null;
  recuperable: boolean;
  estado: "Pendiente" | "En Reproceso" | "Recuperada" | "Perdida";
  costo_recuperacion: number | null;
  valor_perdido: number | null;
  gasto_id: number | null;
  creado_en: string;
};

export type DevolucionHistorial = {
  id: number;
  devolucion_detalle_id: number;
  fecha: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  comentario: string | null;
  usuario: string | null;
};

export type GastoDetalle = {
  id: number;
  gasto_id: number;
  cantidad: number;
  unidad_medida: string | null;
  articulo: string;
  precio_unitario: number;
  valor_total: number;
};

export type Gasto = {
  id: number;
  ticket: number;
  fecha: string;
  tipo: "Gasto" | "Costo";
  categoria: string | null;
  proveedor: string | null;
  proveedor_id: number | null;
  numero_factura: string | null;
  descripcion: string | null;
  monto: number;
  abonado: number;
  saldo: number;
  estado: "Pendiente" | "Abonado" | "Pagado";
  usuario: string | null;
  creado_en: string;
};

export type PagoGasto = {
  id: number;
  gasto_id: number;
  cuenta_id: number;
  fecha: string;
  monto: number;
  comentario: string | null;
  usuario: string | null;
  creado_en: string;
};

export type Ingreso = {
  id: number;
  ticket: number;
  fecha: string;
  categoria: string | null;
  concepto: string | null;
  cliente: string | null;
  cliente_id: number | null;
  tipo_ingreso: "Abono a Factura" | "Cancela Factura" | "Otro" | null;
  estado_facturacion: "Pendiente de Facturar" | "Facturado" | "No Aplica";
  numero_factura: string | null;
  monto: number;
  cobrado: number;
  saldo: number;
  estado: "Pendiente" | "Abonado" | "Cobrado";
  usuario: string | null;
  creado_en: string;
};

export type PagoIngreso = {
  id: number;
  ingreso_id: number;
  cuenta_id: number;
  fecha: string;
  monto: number;
  comentario: string | null;
  usuario: string | null;
  creado_en: string;
};

export type Bitacora = {
  id: number;
  tabla_afectada: string;
  registro_id: number;
  usuario: string | null;
  fecha: string;
  modulo: string;
  accion: string;
  descripcion: string;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  motivo: string | null;
};

export function formatoPesos(n: number | null | undefined): string {
  // Muestra hasta 2 decimales solo cuando el valor los tiene; los enteros
  // se ven sin decimales (no redondea para no ocultar centavos).
  return "$" + (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Compara fecha programada vs. fecha real de entrega. null si falta alguna. */
export function cumplimientoEntrega(programada: string | null | undefined, real: string | null | undefined): "A tiempo" | "Con retraso" | null {
  if (!programada || !real) return null;
  return real <= programada ? "A tiempo" : "Con retraso";
}

export function formatoFecha(f: string | null | undefined): string {
  if (!f) return "-";
  const d = new Date(f.length <= 10 ? f + "T00:00:00" : f);
  if (isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}
