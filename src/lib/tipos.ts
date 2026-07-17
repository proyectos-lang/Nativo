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
  contacto: string | null;
  correo: string | null;
  direccion: string | null;
  ciudad: string | null;
  departamento: string | null;
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
  usuario: string | null;
  creado_en: string;
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
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
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
