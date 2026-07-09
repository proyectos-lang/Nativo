export type Permisos = {
  dashboard: boolean;
  ventas: boolean;
  pagos: boolean;
  entregas: boolean;
  seguimiento: boolean;
  prospectos: boolean;
  clientes: boolean;
  configuracion: boolean;
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
  comentario_entrega: string | null;
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
  valor_unitario: number;
  valor_total: number;
};

export type Pago = {
  id: number;
  venta_id: number;
  fecha: string;
  abono: number;
  retencion: number;
  comentario: string | null;
  usuario: string | null;
  creado_en: string;
};

export type HistorialEntrega = {
  id: number;
  venta_id: number;
  fecha: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  comentario: string | null;
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
  { clave: "seguimiento", nombre: "Seguimiento" },
  { clave: "prospectos", nombre: "Prospectos" },
  { clave: "clientes", nombre: "Clientes" },
  { clave: "configuracion", nombre: "Configuración" },
];

export function formatoPesos(n: number | null | undefined): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
}

export function formatoFecha(f: string | null | undefined): string {
  if (!f) return "-";
  const d = new Date(f.length <= 10 ? f + "T00:00:00" : f);
  if (isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
}
