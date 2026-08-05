import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // El panel se sirve bajo /panel/ en app.kineview.cl; la raíz es el sitio
    // público. Sin esto el router creería que vive en / y los links internos
    // saldrían del panel.
    basepath: "/panel",
  });

  return router;
};
