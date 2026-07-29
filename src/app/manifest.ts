import type { MetadataRoute } from "next";

/**
 * Manifest de la aplicación. Es lo que permite "agregar a la pantalla de inicio"
 * e (en iOS) es requisito para que lleguen las notificaciones push.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nativo — Control de Pedidos y Despachos",
    short_name: "Nativo",
    description: "Gestión de ventas, pagos, entregas, inventario y solicitudes internas",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1f7a5a",
    lang: "es-CO",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
      { src: "/logo.png", sizes: "any", type: "image/png" },
    ],
  };
}
