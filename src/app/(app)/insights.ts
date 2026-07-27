import { formatoPesos, formatoFecha, type Venta, type Prospecto, type CuentaBancaria } from "@/lib/tipos";

export type Insight = {
  id: string;
  severidad: "danger" | "warning" | "info" | "success";
  icono: "reloj" | "camion" | "dinero" | "usuario" | "tendencia" | "banco" | "chispa" | "devolucion" | "inventario";
  titulo: string;
  descripcion: string;
  href?: string;
};

type ParametrosInsights = {
  hoyStr: string;
  limiteProximosStr: string;
  ventas: Venta[];
  noEntregadas: Venta[];
  alertasDetalle: { v: Venta; dias: number }[];
  diasAlerta: number;
  prospectos: Prospecto[];
  variacion: number | null;
  totalVentasMes: number;
  cuentasActivas: CuentaBancaria[];
  esFinanciero: boolean;
  devolucionesPendientes: { id: number; estado: string; creado_en: string }[];
  inventario: {
    totalInventariados: number;
    agotados: number;
    bajoMinimo: number;
    proximosVencer: number;
    pendientesSurtir: number;
    pendienteMasAntiguaDias: number;
    frecuenciaConteo: string | null;
    diasSinConteo: number | null;
    conteoVencido: boolean;
  } | null;
  solicitudes: { asignadasActivas: number; vencidas: number } | null;
};

const ORDEN_SEVERIDAD: Record<Insight["severidad"], number> = { danger: 0, warning: 1, info: 2, success: 3 };

/** Genera las alertas/insights dinámicos del dashboard a partir de datos ya calculados en la página. */
export function construirInsights(p: ParametrosInsights): Insight[] {
  const insights: Insight[] = [];

  const vencidos = p.noEntregadas.filter(v => v.fecha_entrega && v.fecha_entrega < p.hoyStr);
  if (vencidos.length > 0) {
    const masAntiguo = [...vencidos].sort((a, b) => (a.fecha_entrega || "").localeCompare(b.fecha_entrega || ""))[0];
    insights.push({
      id: "vencidos",
      severidad: "danger",
      icono: "camion",
      titulo: `${vencidos.length} pedido${vencidos.length > 1 ? "s" : ""} vencido${vencidos.length > 1 ? "s" : ""}`,
      descripcion: `El ticket #${masAntiguo.ticket} (${masAntiguo.clientes?.nombre || "sin cliente"}) debía entregarse el ${formatoFecha(masAntiguo.fecha_entrega)} y sigue sin salir.`,
      href: "/entregas",
    });
  }

  const proximos = p.noEntregadas.filter(v => v.fecha_entrega && v.fecha_entrega >= p.hoyStr && v.fecha_entrega <= p.limiteProximosStr);
  if (proximos.length > 0) {
    insights.push({
      id: "proximos",
      severidad: "warning",
      icono: "reloj",
      titulo: `${proximos.length} pedido${proximos.length > 1 ? "s" : ""} por vencer`,
      descripcion: "Tienen fecha de entrega programada en los próximos 3 días. Revisa que estén listos a tiempo.",
      href: "/entregas",
    });
  }

  const entregadosConSaldo = p.ventas.filter(v => (v.estado_entrega || "").trim().toLowerCase() === "entregado" && v.saldo > 0);
  if (entregadosConSaldo.length > 0) {
    const totalSaldo = entregadosConSaldo.reduce((s, v) => s + v.saldo, 0);
    insights.push({
      id: "entregados-saldo",
      severidad: "warning",
      icono: "dinero",
      titulo: `${entregadosConSaldo.length} pedido${entregadosConSaldo.length > 1 ? "s" : ""} entregado${entregadosConSaldo.length > 1 ? "s" : ""} sin cobrar`,
      descripcion: `Ya se entregaron pero suman ${formatoPesos(totalSaldo)} pendientes de pago.`,
      href: "/pagos",
    });
  }

  if (p.alertasDetalle.length > 0) {
    const peor = p.alertasDetalle[0];
    insights.push({
      id: "sin-movimiento",
      severidad: peor.dias >= p.diasAlerta * 2 ? "danger" : "warning",
      icono: "camion",
      titulo: `${p.alertasDetalle.length} pedido${p.alertasDetalle.length > 1 ? "s" : ""} estancado${p.alertasDetalle.length > 1 ? "s" : ""}`,
      descripcion: `El ticket #${peor.v.ticket} lleva ${peor.dias} días sin ningún movimiento de estado.`,
      href: "/seguimiento",
    });
  }

  const prospectosSinAtender = p.prospectos
    .filter(pr => pr.estado === "Pendiente")
    .map(pr => {
      const base = pr.fecha_contacto || pr.fecha;
      const dias = Math.floor((new Date(p.hoyStr + "T00:00:00").getTime() - new Date(base + "T00:00:00").getTime()) / 86400000);
      return { pr, dias };
    })
    .filter(x => x.dias >= 5)
    .sort((a, b) => b.dias - a.dias);
  if (prospectosSinAtender.length > 0) {
    const peor = prospectosSinAtender[0];
    insights.push({
      id: "prospectos",
      severidad: "warning",
      icono: "usuario",
      titulo: `${prospectosSinAtender.length} prospecto${prospectosSinAtender.length > 1 ? "s" : ""} sin atender`,
      descripcion: `${peor.pr.nombre} lleva ${peor.dias} días sin seguimiento. No dejes que se enfríe.`,
      href: "/prospectos",
    });
  }

  if (p.variacion !== null) {
    insights.push({
      id: "tendencia",
      severidad: p.variacion >= 0 ? "success" : "info",
      icono: "tendencia",
      titulo: p.variacion >= 0 ? `Ventas al alza: +${p.variacion.toFixed(1)}%` : `Ventas a la baja: ${p.variacion.toFixed(1)}%`,
      descripcion: p.variacion >= 0
        ? `Vas ${formatoPesos(p.totalVentasMes)} este mes, mejor que el anterior. ¡Buen ritmo!`
        : `Vas ${formatoPesos(p.totalVentasMes)} este mes, por debajo del anterior. Puede ser buen momento para reactivar clientes.`,
    });
  }

  if (p.devolucionesPendientes.length > 0) {
    const masAntigua = [...p.devolucionesPendientes].sort((a, b) => a.creado_en.localeCompare(b.creado_en))[0];
    const dias = Math.floor((new Date(p.hoyStr + "T00:00:00").getTime() - new Date(masAntigua.creado_en).getTime()) / 86400000);
    insights.push({
      id: "devoluciones-pendientes",
      severidad: dias >= p.diasAlerta ? "danger" : "warning",
      icono: "devolucion",
      titulo: `${p.devolucionesPendientes.length} devolución${p.devolucionesPendientes.length > 1 ? "es" : ""} sin resolver`,
      descripcion: `Hay prendas devueltas pendientes o en reproceso; la más antigua lleva ${dias} día${dias === 1 ? "" : "s"} sin resolverse.`,
      href: "/devoluciones",
    });
  }

  if (p.inventario && p.inventario.totalInventariados > 0) {
    const inv = p.inventario;
    if (inv.agotados > 0) {
      insights.push({
        id: "inv-agotados",
        severidad: "danger",
        icono: "inventario",
        titulo: `${inv.agotados} referencia${inv.agotados > 1 ? "s" : ""} agotada${inv.agotados > 1 ? "s" : ""}`,
        descripcion: "Hay productos del inventario en cero. Revisa si necesitas generar órdenes de compra.",
        href: "/inventario",
      });
    }
    if (inv.bajoMinimo > 0) {
      insights.push({
        id: "inv-bajo-minimo",
        severidad: "warning",
        icono: "inventario",
        titulo: `${inv.bajoMinimo} referencia${inv.bajoMinimo > 1 ? "s" : ""} en o bajo el stock mínimo`,
        descripcion: "Se recomienda realizar compra antes de que se agoten.",
        href: "/inventario",
      });
    }
    if (inv.pendientesSurtir > 0) {
      insights.push({
        id: "inv-pendientes-surtir",
        severidad: inv.pendienteMasAntiguaDias >= p.diasAlerta ? "danger" : "warning",
        icono: "inventario",
        titulo: `${inv.pendientesSurtir} pedido${inv.pendientesSurtir > 1 ? "s" : ""} pendiente${inv.pendientesSurtir > 1 ? "s" : ""} por surtir`,
        descripcion: `Ventas sin inventario esperando mercancía; el más antiguo lleva ${inv.pendienteMasAntiguaDias} día${inv.pendienteMasAntiguaDias === 1 ? "" : "s"}.`,
        href: "/inventario",
      });
    }
    if (inv.proximosVencer > 0) {
      insights.push({
        id: "inv-por-vencer",
        severidad: "warning",
        icono: "inventario",
        titulo: `${inv.proximosVencer} producto${inv.proximosVencer > 1 ? "s" : ""} vence${inv.proximosVencer > 1 ? "n" : ""} en menos de 30 días`,
        descripcion: "Revisa el reporte de próximos a vencer para rotarlos a tiempo.",
        href: "/inventario",
      });
    }
    if (inv.conteoVencido && inv.frecuenciaConteo) {
      insights.push({
        id: "inv-conteo-vencido",
        severidad: "info",
        icono: "inventario",
        titulo: "Toca hacer conteo físico de inventario",
        descripcion: inv.diasSinConteo == null
          ? `La frecuencia configurada es ${inv.frecuenciaConteo.toLowerCase()} y aún no se ha cerrado ningún arqueo.`
          : `El último arqueo cerrado fue hace ${inv.diasSinConteo} días (frecuencia: ${inv.frecuenciaConteo.toLowerCase()}).`,
        href: "/inventario",
      });
    }
  }

  if (p.esFinanciero) {
    const enRojo = p.cuentasActivas.filter(c => (c.saldo_actual || 0) < 0);
    if (enRojo.length > 0) {
      insights.push({
        id: "cuentas-rojo",
        severidad: "danger",
        icono: "banco",
        titulo: `${enRojo.length} cuenta${enRojo.length > 1 ? "s" : ""} en números rojos`,
        descripcion: `${enRojo.map(c => c.nombre).join(", ")} ${enRojo.length > 1 ? "tienen" : "tiene"} saldo negativo.`,
        href: "/financiero",
      });
    }
  }

  if (p.solicitudes) {
    if (p.solicitudes.vencidas > 0) {
      insights.push({
        id: "solicitudes-vencidas",
        severidad: "danger",
        icono: "chispa",
        titulo: `${p.solicitudes.vencidas} solicitud${p.solicitudes.vencidas > 1 ? "es" : ""} vencida${p.solicitudes.vencidas > 1 ? "s" : ""}`,
        descripcion: "Tienes solicitudes asignadas cuya fecha límite ya pasó.",
        href: "/solicitudes",
      });
    } else if (p.solicitudes.asignadasActivas > 0) {
      insights.push({
        id: "solicitudes-pendientes",
        severidad: "info",
        icono: "chispa",
        titulo: `${p.solicitudes.asignadasActivas} solicitud${p.solicitudes.asignadasActivas > 1 ? "es" : ""} por atender`,
        descripcion: "Tienes solicitudes internas asignadas pendientes de resolver.",
        href: "/solicitudes",
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: "todo-bien",
      severidad: "success",
      icono: "chispa",
      titulo: "Todo al día",
      descripcion: "No hay pedidos vencidos, prospectos abandonados ni alertas pendientes. Buen trabajo.",
    });
  }

  return insights.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
}
