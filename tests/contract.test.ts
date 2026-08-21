import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Express } from "express";
import { createApp } from "../server/app";
import { enumerateRoutes } from "./support/introspect-routes";

describe("openapi contract", () => {
  let app: Express;

  beforeAll(async () => {
    ({ app } = await createApp());
  });

  it("every registered route is documented, and every documented path has a route", () => {
    const registered = new Set(
      enumerateRoutes(app).map((route) =>
        // Express "/badges/:id" -> OpenAPI "/badges/{id}", and strip the
        // /api/v1 prefix baked into every route registration (the spec's
        // `servers: [{url: /api/v1}]` already accounts for it).
        route
          .replace(/^([A-Z]+) \/api\/v1/, "$1 ")
          .replace(/:([a-zA-Z0-9_]+)/g, "{$1}"),
      ),
    );

    const spec = parse(readFileSync("openapi/openapi.yaml", "utf-8")) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const documented = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }

    const undocumented = Array.from(registered).filter(
      (r) => !documented.has(r),
    );
    const nonexistent = Array.from(documented).filter(
      (d) => !registered.has(d),
    );

    expect(
      undocumented,
      "routes registered but missing from openapi.yaml",
    ).toEqual([]);
    expect(
      nonexistent,
      "openapi.yaml paths with no matching registered route",
    ).toEqual([]);
  });
});
