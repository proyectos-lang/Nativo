/* Service worker de Nativo: solo notificaciones push.
   No hace caché de la app a propósito — la app siempre se sirve fresca desde
   el servidor y así no se corre el riesgo de mostrar datos viejos. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let datos = { titulo: "Nativo", cuerpo: "Tienes una novedad", url: "/solicitudes" };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    if (event.data) datos.cuerpo = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url: datos.url || "/solicitudes" },
      tag: "nativo-solicitud",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/solicitudes";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientes => {
      for (const cliente of clientes) {
        if ("focus" in cliente) {
          cliente.navigate(destino);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
