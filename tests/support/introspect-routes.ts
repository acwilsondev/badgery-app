import type { Express } from "express";

/**
 * Walks Express's internal router stack and returns every registered
 * route as "METHOD /path" (Express :param syntax, e.g. "GET /badges/:id").
 * `_router` isn't part of Express's public types, hence the local cast —
 * this is the same approach standalone route-listing packages use; no
 * such package is installed in this repo, and adding one for a single
 * enumeration is unwarranted here.
 */
export function enumerateRoutes(app: Express): string[] {
  const routes: string[] = [];
  const stack = (app as any)._router?.stack ?? [];

  for (const layer of stack) {
    if (!layer.route) continue;
    const routePath: string = layer.route.path;
    const methods: Record<string, boolean> = layer.route.methods;
    for (const method of Object.keys(methods)) {
      if (methods[method]) {
        routes.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  return routes;
}
