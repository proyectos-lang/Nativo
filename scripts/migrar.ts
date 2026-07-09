/**
 * Migración de datos: Google Sheets (export .xlsx) → Supabase (esquema nativo)
 *
 * Uso:
 *   npx tsx scripts/migrar.ts [--limpiar]
 *
 * Requiere:
 *   - datos/registro-ventas.xlsx  (Google Sheets → Archivo → Descargar → .xlsx)
 *   - .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 *   - Opcional: ADMIN_USUARIO / ADMIN_CONTRASENA para el usuario inicial
 *
 * --limpiar: vacía las tablas de datos (no usuarios) antes de insertar,
 * lo que permite re-ejecutar la migración desde cero.
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// ---------- Configuración ----------
const RUTA_XLSX = path.join(__dirname, "..", "datos", "registro-ventas.xlsx");

function cargarEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const linea of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
cargarEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY || KEY.startsWith("PEGAR_AQUI")) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
if (!fs.existsSync(RUTA_XLSX)) {
  console.error(`❌ No se encontró ${RUTA_XLSX}\n   Exporta el Google Sheet como .xlsx y guárdalo ahí.`);
  process.exit(1);
}

const db = createClient(URL, KEY, { db: { schema: "nativo" } });

// ---------- Utilidades ----------
type Fila = (string | number | Date | null)[];

function celda(fila: Fila, idx: number): string {
  const v = fila[idx];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v).trim();
}
function numero(fila: Fila, idx: number): number {
  const v = fila[idx];
  if (typeof v === "number") return v;
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function fechaISO(fila: Fila, idx: number): string | null {
  const v = fila[idx];
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof v === "string" && v.trim()) {
    const p = v.trim().split(/[/\-]/);
    if (p.length === 3) {
      // dd/mm/yyyy
      const d = Number(p[0]), m = Number(p[1]), y = Number(p[2].length === 2 ? "20" + p[2] : p[2]);
      if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    const dt = new Date(v);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  return null;
}
function hoja(wb: XLSX.WorkBook, nombre: string): Fila[] {
  const ws = wb.Sheets[nombre];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Fila>(ws, { header: 1, defval: null, blankrows: false });
}
async function insertarLote<T extends object>(tabla: string, filas: T[], select?: string) {
  const resultados: Record<string, unknown>[] = [];
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    const q = db.from(tabla).insert(lote);
    const { data, error } = select ? await q.select(select) : await q.select();
    if (error) throw new Error(`Insertando en ${tabla}: ${error.message}`);
    if (data) resultados.push(...(data as Record<string, unknown>[]));
  }
  return resultados;
}

// ---------- Migración ----------
async function main() {
  const limpiar = process.argv.includes("--limpiar");
  console.log("📖 Leyendo", RUTA_XLSX);
  const wb = XLSX.readFile(RUTA_XLSX, { cellDates: true });
  console.log("   Hojas encontradas:", wb.SheetNames.join(", "));

  if (limpiar) {
    console.log("🧹 Limpiando tablas de datos (usuarios se conserva)...");
    for (const t of ["pagos", "historial_entregas", "ventas_detalle", "ventas", "prospectos", "productos", "listas_maestras", "clientes"]) {
      const { error } = await db.from(t).delete().gte("id", 0);
      if (error) throw new Error(`Limpiando ${t}: ${error.message}`);
    }
  }

  const reporte: string[] = [];
  const advertencias: string[] = [];

  // ===== 1. CLIENTES =====
  const filasClientes = hoja(wb, "CLIENTES").slice(1);
  type Cliente = { nombre: string; empresa: string | null; contacto: string | null; ciudad: string | null; departamento: string | null; direccion: string | null; correo: string | null; cedula_nit: string | null; rut: string | null };
  const clientes: Cliente[] = [];
  const claveCliente = (nombre: string, cedula: string) => (cedula ? `c:${cedula.toLowerCase()}` : `n:${nombre.toLowerCase()}`);
  const clientesVistos = new Set<string>();

  for (const f of filasClientes) {
    const nombre = celda(f, 0);
    const cedula = celda(f, 7);
    if (!nombre && !cedula) continue;
    const clave = claveCliente(nombre, cedula);
    if (clientesVistos.has(clave)) { advertencias.push(`Cliente duplicado en hoja CLIENTES: ${nombre} (${cedula})`); continue; }
    clientesVistos.add(clave);
    clientes.push({
      nombre: nombre || cedula, empresa: celda(f, 1) || null, contacto: celda(f, 2) || null,
      ciudad: celda(f, 3) || null, departamento: celda(f, 4) || null, direccion: celda(f, 5) || null,
      correo: celda(f, 6) || null, cedula_nit: cedula || null, rut: celda(f, 8) || null,
    });
  }

  // ===== 2. VENTAS GENERAL (parseo con descombinación) =====
  const filasVentas = hoja(wb, "VENTAS GENERAL").slice(1);
  type Linea = { producto: string; codigo_producto: string | null; cantidad: number; talla: string | null; color: string | null; sexo: string | null; estampado: string | null; bordado: string | null; guia_estampado: string | null; guia_bordado: string | null; valor_unitario: number; valor_total: number };
  type Cabecera = { ticket: number | null; fila: Fila; lineas: Linea[]; filaN: number };
  const cabeceras: Cabecera[] = [];
  let actual: Cabecera | null = null;

  const extraerLinea = (f: Fila): Linea | null => {
    const producto = celda(f, 12);
    if (!producto) return null;
    return {
      producto, codigo_producto: celda(f, 13) || null, cantidad: numero(f, 14) || 1,
      talla: celda(f, 15) || null, color: celda(f, 16) || null, sexo: celda(f, 17) || null,
      estampado: celda(f, 8) || null, bordado: celda(f, 9) || null,
      guia_bordado: celda(f, 10) || null, guia_estampado: celda(f, 11) || null,
      valor_unitario: numero(f, 18), valor_total: numero(f, 19),
    };
  };

  filasVentas.forEach((f, i) => {
    const ticketRaw = celda(f, 1);
    const tieneFechaOCliente = fechaISO(f, 0) !== null || celda(f, 6) !== "";
    if (ticketRaw !== "") {
      actual = { ticket: Math.trunc(numero(f, 1)), fila: f, lineas: [], filaN: i + 2 };
      cabeceras.push(actual);
    } else if (tieneFechaOCliente) {
      actual = { ticket: null, fila: f, lineas: [], filaN: i + 2 }; // venta sin ticket
      cabeceras.push(actual);
    }
    if (!actual) { advertencias.push(`Fila ${i + 2} de VENTAS GENERAL sin cabecera previa — omitida`); return; }
    const linea = extraerLinea(f);
    if (linea) actual.lineas.push(linea);
  });

  // Tickets: los existentes + generación de aleatorios de 6 dígitos para ventas sin ticket
  const ticketsUsados = new Set<number>(cabeceras.filter(c => c.ticket !== null).map(c => c.ticket as number));
  const gruposSinTicket = new Map<string, Cabecera[]>();
  for (const c of cabeceras.filter(c => c.ticket === null)) {
    const clave = `${celda(c.fila, 6).toLowerCase()}|${fechaISO(c.fila, 0) || "sin-fecha"}`;
    if (!gruposSinTicket.has(clave)) gruposSinTicket.set(clave, []);
    gruposSinTicket.get(clave)!.push(c);
  }
  const ticketsGenerados: string[] = [];
  for (const [clave, grupo] of gruposSinTicket) {
    let t: number;
    do { t = Math.floor(100000 + Math.random() * 900000); } while (ticketsUsados.has(t));
    ticketsUsados.add(t);
    for (const c of grupo) c.ticket = t;
    ticketsGenerados.push(`  ${clave.replace("|", "  fecha:")} → ticket ${t} (${grupo.length} cabecera(s))`);
  }
  // Si un mismo (cliente,fecha) tenía varias cabeceras sin ticket, quedan bajo el mismo ticket:
  // se fusionan sus líneas en una sola cabecera para respetar ticket UNIQUE.
  const porTicket = new Map<number, Cabecera>();
  for (const c of cabeceras) {
    const t = c.ticket as number;
    if (porTicket.has(t)) {
      porTicket.get(t)!.lineas.push(...c.lineas);
      advertencias.push(`Ticket ${t}: cabeceras fusionadas (filas ${porTicket.get(t)!.filaN} y ${c.filaN})`);
    } else {
      porTicket.set(t, c);
    }
  }

  // Clientes que solo existen en VENTAS GENERAL
  for (const c of porTicket.values()) {
    const nombre = celda(c.fila, 6);
    const cedula = celda(c.fila, 37);
    if (!nombre) continue;
    const clave = claveCliente(nombre, cedula);
    if (!clientesVistos.has(clave)) {
      clientesVistos.add(clave);
      clientes.push({
        nombre, empresa: celda(c.fila, 7) || null, contacto: celda(c.fila, 32) || null,
        ciudad: celda(c.fila, 33) || null, departamento: celda(c.fila, 34) || null,
        direccion: celda(c.fila, 35) || null, correo: celda(c.fila, 36) || null,
        cedula_nit: cedula || null, rut: celda(c.fila, 38) || null,
      });
    }
  }

  console.log(`👥 Insertando ${clientes.length} clientes...`);
  const clientesInsertados = await insertarLote("clientes", clientes, "id,nombre,cedula_nit");
  const idCliente = new Map<string, number>();
  for (const c of clientesInsertados) {
    idCliente.set(claveCliente(String(c.nombre), String(c.cedula_nit || "")), Number(c.id));
    if (c.cedula_nit) idCliente.set(`c:${String(c.cedula_nit).toLowerCase()}`, Number(c.id));
    idCliente.set(`n:${String(c.nombre).toLowerCase()}`, Number(c.id));
  }
  reporte.push(`Clientes: ${clientes.length} insertados`);

  // ===== Insertar ventas (cabecera + detalle) =====
  const cabecerasFinales = [...porTicket.values()];
  console.log(`🧾 Insertando ${cabecerasFinales.length} ventas (cabeceras)...`);
  const ventasRows = cabecerasFinales.map(c => {
    const f = c.fila;
    const nombre = celda(f, 6), cedula = celda(f, 37);
    const cliente_id = idCliente.get(cedula ? `c:${cedula.toLowerCase()}` : `n:${nombre.toLowerCase()}`) ?? null;
    if (!cliente_id && nombre) advertencias.push(`Ticket ${c.ticket}: cliente "${nombre}" no resuelto`);
    const total = numero(f, 20) || c.lineas.reduce((s, l) => s + l.valor_total, 0);
    const retencion = numero(f, 21);
    const abono = numero(f, 23);
    return {
      ticket: c.ticket, fecha: fechaISO(f, 0) || "2020-01-01", cliente_id,
      canal_venta: celda(f, 2) || null, campana: celda(f, 3) || null,
      vendedora: celda(f, 5) || null, profesional: celda(f, 40) || null, motivo_compra: celda(f, 39) || null,
      total_compra: total, retencion, total_a_pagar: numero(f, 22) || total - retencion,
      abono, saldo: numero(f, 24) || total - retencion - abono,
      estado_pago: celda(f, 25) || "Pendiente",
      fecha_pago: fechaISO(f, 26), tipo_pago: celda(f, 28) || null, medio_pago: celda(f, 31) || null,
      observaciones_pago: celda(f, 29) || null,
      estado_entrega: celda(f, 30) || "En Proceso",
      fecha_entrega: fechaISO(f, 27), comentario_entrega: celda(f, 41) || null,
    };
  });
  const ventasInsertadas = await insertarLote("ventas", ventasRows, "id,ticket");
  const idVenta = new Map<number, number>();
  for (const v of ventasInsertadas) idVenta.set(Number(v.ticket), Number(v.id));
  reporte.push(`Ventas (cabeceras): ${ventasRows.length} insertadas (${ticketsGenerados.length} tickets generados)`);

  const detalleRows = cabecerasFinales.flatMap(c =>
    c.lineas.map(l => ({ venta_id: idVenta.get(c.ticket as number), ...l }))
  );
  console.log(`📦 Insertando ${detalleRows.length} líneas de detalle...`);
  await insertarLote("ventas_detalle", detalleRows);
  reporte.push(`Detalle de ventas: ${detalleRows.length} líneas`);

  // Pagos iniciales (abonos acumulados de la migración)
  const pagosRows = ventasRows
    .filter(v => v.abono > 0 || v.retencion > 0)
    .map(v => ({
      venta_id: idVenta.get(v.ticket as number), fecha: v.fecha_pago || v.fecha,
      abono: v.abono, retencion: v.retencion,
      comentario: "Migración desde Google Sheets (acumulado)", usuario: "migracion",
    }));
  console.log(`💰 Insertando ${pagosRows.length} pagos iniciales...`);
  await insertarLote("pagos", pagosRows);
  reporte.push(`Pagos iniciales: ${pagosRows.length}`);

  // ===== 3. PRODUCTOS =====
  const productos = [...new Set(hoja(wb, "PRODUCTOS").slice(1).map(f => celda(f, 0)).filter(Boolean))]
    .map(nombre => ({ nombre }));
  console.log(`🛍️ Insertando ${productos.length} productos...`);
  await insertarLote("productos", productos);
  reporte.push(`Productos: ${productos.length}`);

  // ===== 4. MAESTROS =====
  const tiposMaestros = ["vendedora", "talla", "color", "campana", "motivo_compra", "profesional", "estado_entrega"];
  const maestrosRows: { tipo: string; valor: string }[] = [];
  const vistosMaestros = new Set<string>();
  for (const f of hoja(wb, "MAESTROS").slice(1)) {
    tiposMaestros.forEach((tipo, col) => {
      const valor = celda(f, col);
      if (valor && !vistosMaestros.has(`${tipo}|${valor}`)) {
        vistosMaestros.add(`${tipo}|${valor}`);
        maestrosRows.push({ tipo, valor });
      }
    });
  }
  // Listas fijas que en la app vieja estaban hardcodeadas en el HTML
  const fijas: Record<string, string[]> = {
    canal_venta: ["Físico", "Web"],
    estado_pago: ["Pendiente", "Abonado", "Pagado Total"],
    medio_pago: ["TRANSFERENCIA", "EFECTIVO"],
    tipo_pago: ["0 DIAS", "30 DIAS", "60 DIAS", "90 DIAS"],
    sexo: ["Hombre", "Mujer", "Unisex", "Niño/a"],
  };
  for (const [tipo, valores] of Object.entries(fijas)) {
    for (const valor of valores) {
      if (!vistosMaestros.has(`${tipo}|${valor}`)) maestrosRows.push({ tipo, valor });
    }
  }
  console.log(`📋 Insertando ${maestrosRows.length} valores de listas maestras...`);
  await insertarLote("listas_maestras", maestrosRows);
  reporte.push(`Listas maestras: ${maestrosRows.length} valores`);

  // ===== 5. HISTORIAL ENTREGAS =====
  const histRows: object[] = [];
  for (const f of hoja(wb, "HISTORIAL ENTREGAS").slice(1)) {
    const ticket = Math.trunc(numero(f, 0));
    if (!ticket) continue;
    const venta_id = idVenta.get(ticket);
    if (!venta_id) { advertencias.push(`Historial de entregas: ticket ${ticket} no existe en ventas — omitido`); continue; }
    const fechaRaw = f[1];
    histRows.push({
      venta_id,
      fecha: fechaRaw instanceof Date && !isNaN(fechaRaw.getTime()) ? fechaRaw.toISOString() : new Date().toISOString(),
      estado_anterior: celda(f, 2) || null, estado_nuevo: celda(f, 3) || "Sin Estado",
      comentario: celda(f, 4) || null, usuario: "migracion",
    });
  }
  console.log(`🚚 Insertando ${histRows.length} registros de historial de entregas...`);
  await insertarLote("historial_entregas", histRows);
  reporte.push(`Historial de entregas: ${histRows.length}`);

  // ===== 6. PROSPECTOS =====
  const prospectosRows = hoja(wb, "CLIENTES POR CONTACTAR").slice(1)
    .filter(f => celda(f, 3))
    .map(f => ({
      fecha: fechaISO(f, 0) || new Date().toISOString().slice(0, 10),
      referido_por: celda(f, 1) || null, evento_lugar: celda(f, 2) || null,
      nombre: celda(f, 3), telefono: celda(f, 4) || null, correo: celda(f, 5) || null,
      descripcion: celda(f, 6) || null, estado: celda(f, 7) || "Pendiente",
      fecha_contacto: fechaISO(f, 8), proximo_contacto: fechaISO(f, 9),
      observaciones: celda(f, 10) || null,
    }));
  console.log(`🤝 Insertando ${prospectosRows.length} prospectos...`);
  await insertarLote("prospectos", prospectosRows);
  reporte.push(`Prospectos: ${prospectosRows.length}`);

  // ===== 7. Usuario administrador inicial =====
  const adminUsuario = process.env.ADMIN_USUARIO || "admin";
  const adminContrasena = process.env.ADMIN_CONTRASENA || "admin123";
  const { data: existente } = await db.from("usuarios").select("id").eq("usuario", adminUsuario).maybeSingle();
  if (!existente) {
    const { error } = await db.from("usuarios").insert({
      nombre: "Administrador", usuario: adminUsuario, contrasena: adminContrasena,
      rol: "admin",
      permisos: { dashboard: true, ventas: true, pagos: true, entregas: true, seguimiento: true, prospectos: true, clientes: true, configuracion: true },
    });
    if (error) throw new Error(`Creando usuario admin: ${error.message}`);
    reporte.push(`Usuario admin creado: ${adminUsuario}${!process.env.ADMIN_CONTRASENA ? " (contraseña por defecto admin123 — CÁMBIALA)" : ""}`);
  } else {
    reporte.push(`Usuario admin ya existía: ${adminUsuario}`);
  }

  // ===== Reporte de conciliación =====
  const sumaTotales = ventasRows.reduce((s, v) => s + v.total_compra, 0);
  console.log("\n========== REPORTE DE CONCILIACIÓN ==========");
  reporte.forEach(r => console.log("✅ " + r));
  console.log(`📊 Suma total_compra migrada: $${sumaTotales.toLocaleString("es-CO")}`);
  if (ticketsGenerados.length) {
    console.log("\n🎫 Tickets generados para ventas sin ticket:");
    ticketsGenerados.forEach(t => console.log(t));
  }
  if (advertencias.length) {
    console.log("\n⚠️ Advertencias:");
    advertencias.forEach(a => console.log("  - " + a));
  }
  console.log("=============================================\n");
}

main().catch(err => { console.error("❌ Migración fallida:", err.message); process.exit(1); });
