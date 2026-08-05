import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // El panel vive en app.kineview.cl/panel/ — la raíz es el sitio público.
  // Sin esto los assets se pedirían a /assets/… y darían 404.
  base: "/panel/",
  server: {
    host: true,
    port: 8888,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 8888,
    strictPort: true,
  },
  resolve: {
    // Resolves the "@/*" -> "./src/*" alias declared in tsconfig.json (Vite 8
    // does this natively; no vite-tsconfig-paths plugin needed).
    tsconfigPaths: true,
    // Keep a single copy of React and the TanStack runtime; two copies break hooks
    // and router context.
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-query",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR
      // error wrapper). nitro/vite builds from this.
      server: { entry: "server" },

      // El hosting de app.kineview.cl es FTP: sirve archivos, no ejecuta Node.
      // Se prerenderiza la carcasa a HTML plano en `.output/public`, que es lo
      // que se sube. Todo lo que muestra el panel es privado y llega del lado
      // del cliente después de iniciar sesión — el HTML prerenderizado no
      // contiene ni un dato de paciente, y eso es a propósito.
      prerender: {
        enabled: true,
        crawlLinks: false,
        failOnError: true,
        autoSubfolderIndex: true,
      },
      pages: [
        // Solo la raíz. `/paciente/$id` es dinámica y privada: la resuelve el
        // router en el navegador, con la sesión ya iniciada. Un .htaccess
        // reescribe cualquier ruta desconocida a index.html para que eso
        // funcione al recargar.
        { path: "/", sitemap: { exclude: true } },
      ],
      sitemap: { enabled: false },
    }),
    nitro(),
    viteReact(),
  ],
});
