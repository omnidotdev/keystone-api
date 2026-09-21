import { readFileSync } from "node:fs";

import { cors } from "@elysiajs/cors";
import { yoga } from "@elysiajs/graphql-yoga";
import { useOpenTelemetry } from "@envelop/opentelemetry";
import { useParserCache } from "@envelop/parser-cache";
import { useValidationCache } from "@envelop/validation-cache";
import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
import { eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { schema } from "generated/graphql/schema.executable";
import { useGrafast } from "grafast/envelop";
import webhooks from "webhooks";

import appConfig from "lib/config/app.config";
import {
  CORS_ALLOWED_ORIGINS,
  PORT,
  isDevEnv,
  isProdEnv,
} from "lib/config/env.config";
import { dbPool, pgPool } from "lib/db";
import ensureDatabase from "lib/db/ensureDatabase";
import { siteTable } from "lib/db/schema/site.table";
import { ecosystemRoutes } from "lib/ecosystem/routes";
import { ecosystemRuntime } from "lib/ecosystem/runtime";
import { designSystemMode, parseDesignSystem } from "lib/engine/manifest";
import { publishDocument } from "lib/engine/publish";
import createGraphqlContext from "lib/graphql/createGraphqlContext";
import { armorPlugin, createAuthenticationPlugin } from "lib/graphql/plugins";
import { createGenerateRateLimiter } from "lib/middleware/generateRateLimit";
import { billing } from "lib/providers";
import { createAnthropicProviderClient } from "lib/providers/anthropicClient";
import { hostedPublisherFromEnv } from "lib/publish/config";
import {
  allowsCustomDomain,
  resolvePublishEntitlement,
} from "lib/publish/publishGate";
import { publishToFractal } from "lib/publish/publishToFractal";
import { createDrizzleSiteStore } from "lib/site/drizzleSiteStore";
import { runSiteGeneration } from "lib/site/siteService";

/** Public base for served/published URLs */
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? `https://localhost:${PORT}`;

/**
 * Credit + connector badge injected into published sites: a "Built with
 * Keystone" mark plus a live-on-Fractal status pill. Shown on the Free tier;
 * removable on paid tiers (gate on plan when billing is wired). The live dot
 * reflects that the site is being served; wire it to the FractalService status
 * (phase/conditions) once real Fractal deploys land.
 */
const KEYSTONE_BADGE = `<a href="https://keystone.omni.dev" target="_blank" rel="noreferrer" style="position:fixed;bottom:16px;right:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border-radius:999px;background:#17130f;color:#f6f1e8;font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-decoration:none;box-shadow:0 8px 22px -8px rgba(0,0,0,.55)">🗝️ Built with Keystone <span style="opacity:.45">·</span> <span style="color:#7ec98a">● Live on Fractal</span></a>`;

/** Trusted scripts/markup Keystone injects into published output */
const PUBLISHED_INJECT = `${ecosystemRuntime(PUBLIC_BASE)}${KEYSTONE_BADGE}`;

/**
 * Extra abuse guard for the expensive /generate route (each turn spends Synapse
 * credits). Complements the global request-rate limiter and Synapse's central
 * spend cap by bounding generations per client IP. The builder at /build is
 * intentionally public (no login), so this keeps one abuser from burning the
 * shared budget without gating anonymous use.
 */
const generateRateLimiter = createGenerateRateLimiter();

/**
 * Hosted publisher (per-site FractalService on an isolated domain), assembled
 * from env. Null when hosted publishing is not configured, in which case
 * publishing degrades to the read-only preview served at /published/:id.
 */
const hostedPublisher = hostedPublisherFromEnv();

/** Best-effort client IP: the gateway forwards the real client in x-forwarded-for */
const clientIp = (request: Request, address?: string): string =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  address ??
  "unknown";

const withBadge = (html: string): string =>
  html.includes("</body>")
    ? html.replace("</body>", `${PUBLISHED_INJECT}</body>`)
    : html + PUBLISHED_INJECT;

const commit = (() => {
  try {
    return readFileSync("/app/.git-sha", "utf-8").trim();
  } catch {
    return "unknown";
  }
})();

// ensure database exists before starting
await ensureDatabase();

/**
 * Elysia server.
 */
const app = new Elysia({
  ...(isDevEnv && {
    serve: {
      // https://elysiajs.com/patterns/configuration#serve-tls
      // https://bun.sh/guides/http/tls
      // NB: Elysia (and Bun) trust the well-known CA list curated by Mozilla (https://wiki.mozilla.org/CA/Included_Certificates), but they can be customized here if needed (`tls.ca` option)
      tls: {
        certFile: "cert.pem",
        keyFile: "key.pem",
      },
    },
  }),
})
  // security headers
  .onAfterHandle(({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["X-XSS-Protection"] = "1; mode=block";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  })
  .use(
    cors({
      origin: CORS_ALLOWED_ORIGINS!.split(","),
      methods: ["GET", "POST"],
    }),
  )
  // rate limiting
  .use(
    rateLimit({
      max: 100,
      duration: 60_000,
    }),
  )
  // health check endpoint
  .get("/health", () => ({
    status: "ok",
    timestamp: Date.now(),
    service: appConfig.name,
    commit,
  }))
  // readiness endpoint
  .get("/ready", async ({ set }) => {
    try {
      await dbPool.execute(sql`SELECT 1`);

      return {
        status: "ready",
        database: "connected",
        timestamp: Date.now(),
      };
    } catch {
      set.status = 503;

      return {
        status: "not ready",
        database: "disconnected",
        timestamp: Date.now(),
      };
    }
  })
  // MVP builder API (create/read/generate). CRUD duplicates the auto-generated
  // GraphQL and generate should become a Grafast mutation; kept as simple REST
  // so the builder UI is trivial fetch calls while the product takes shape.
  .post("/sites", async ({ body, set }) => {
    const { displayName } = (body ?? {}) as { displayName?: string };

    try {
      const [row] = await dbPool
        .insert(siteTable)
        .values({
          organizationId: "demo-org",
          name: `site-${Date.now()}`,
          displayName: displayName ?? "Untitled site",
          files: {
            theme: "",
            shell: { header: "", footer: "" },
            pages: { home: { html: "", css: "" } },
          },
        })
        .returning({ id: siteTable.id });

      return { siteId: row?.id };
    } catch {
      set.status = 500;

      return { error: "could not create site" };
    }
  })
  .get("/sites/:id", async ({ params, set }) => {
    const [row] = await dbPool
      .select({
        files: siteTable.files,
        transcript: siteTable.transcript,
        publishState: siteTable.publishState,
        designSystem: siteTable.designSystem,
      })
      .from(siteTable)
      .where(eq(siteTable.id, params.id))
      .limit(1);

    if (!row) {
      set.status = 404;

      return { error: "site not found" };
    }

    // Surface the generation mode the attached design system implies, so the
    // builder can show whether generation is grounded in a design system.
    return { ...row, mode: designSystemMode(row.designSystem) };
  })
  // Attach (or, with `{ detach: true }`, remove) a design system on a site.
  // A manifest switches subsequent generation into Design-System mode (output
  // constrained to the whitelisted components); tokens alone theme freeform
  // output. The engine reads site.designSystem on every /generate turn.
  .post("/sites/:id/design-system", async ({ params, body, set }) => {
    const [row] = await dbPool
      .select({ id: siteTable.id })
      .from(siteTable)
      .where(eq(siteTable.id, params.id))
      .limit(1);

    if (!row) {
      set.status = 404;

      return { error: "site not found" };
    }

    const detach = (body as { detach?: boolean } | null)?.detach === true;

    try {
      const designSystem = detach ? null : parseDesignSystem(body);

      await dbPool
        .update(siteTable)
        .set({ designSystem, updatedAt: new Date().toISOString() })
        .where(eq(siteTable.id, params.id));

      return { mode: designSystemMode(designSystem) };
    } catch (error) {
      set.status = 400;

      return {
        error: error instanceof Error ? error.message : "invalid design system",
      };
    }
  })
  // AI generation turn for an existing site.
  // Pragmatic REST action for now; migrate to a Postgraphile Grafast mutation
  // (makeExtendSchemaPlugin) once the plan wiring is settled.
  .post("/generate", async ({ body, set, request, server }) => {
    const {
      siteId,
      request: prompt,
      model,
    } = (body ?? {}) as {
      siteId?: string;
      request?: string;
      model?: string;
    };

    if (!siteId || !prompt) {
      set.status = 400;

      return { error: "siteId and request are required" };
    }

    const { allowed, retryAfterSeconds } = generateRateLimiter.check(
      clientIp(request, server?.requestIP(request)?.address),
    );

    if (!allowed) {
      set.status = 429;
      set.headers["Retry-After"] = String(retryAfterSeconds);

      return { error: "too many generation requests, please slow down" };
    }

    try {
      const result = await runSiteGeneration({
        store: createDrizzleSiteStore(dbPool),
        siteId,
        request: prompt,
        client: createAnthropicProviderClient(),
        model,
      });

      return { siteId, reply: result.reply, credits: result.credits };
    } catch (error) {
      const notFound =
        error instanceof Error && error.message === "site not found";

      if (!notFound) console.error("[generate] failed:", error);

      set.status = notFound ? 404 : 500;

      return { error: notFound ? "site not found" : "generation failed" };
    }
  })
  // Publish a site. Hosted publishing (a dedicated staticSite FractalService on
  // an isolated fractal.dev domain, scale to zero, optional custom domain) is a
  // paid feature: it runs only when the owning workspace is entitled AND the
  // hosted publisher is configured. Otherwise the site gets a read-only preview
  // link served at /published/:id (the free experience). Publishing never fails
  // to the user for lack of entitlement; it degrades to the preview.
  .post("/publish", async ({ body, request, set }) => {
    const { siteId, customDomain } = (body ?? {}) as {
      siteId?: string;
      customDomain?: string;
    };

    if (!siteId) {
      set.status = 400;

      return { error: "siteId is required" };
    }

    const [row] = await dbPool
      .select({
        id: siteTable.id,
        organizationId: siteTable.organizationId,
        files: siteTable.files,
        displayName: siteTable.displayName,
      })
      .from(siteTable)
      .where(eq(siteTable.id, siteId))
      .limit(1);

    if (!row) {
      set.status = 404;

      return { error: "site not found" };
    }

    const previewUrl = `${PUBLIC_BASE}/published/${siteId}`;

    // Decide between hosted deploy and preview based on the workspace's plan.
    const accessToken = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    const entitlement = hostedPublisher
      ? await resolvePublishEntitlement(
          billing,
          row.organizationId,
          accessToken,
        )
      : { hostedPublish: false, customDomains: 0 };

    if (hostedPublisher && entitlement.hostedPublish) {
      try {
        const wantsDomain =
          typeof customDomain === "string" && customDomain.length > 0;
        const domain =
          wantsDomain && allowsCustomDomain(entitlement)
            ? customDomain
            : undefined;

        const result = await publishToFractal({
          contentRepo: hostedPublisher.contentRepo,
          client: hostedPublisher.client,
          project: hostedPublisher.project,
          siteId,
          site: row.files,
          displayName: row.displayName ?? undefined,
          customDomain: domain,
        });

        await dbPool
          .update(siteTable)
          .set({
            publishState: "published",
            deployedUrl: result.url,
            ...(domain ? { domain } : {}),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(siteTable.id, siteId));

        return {
          url: result.url,
          hosted: true,
          customDomainRecords: result.customDomainRecords,
        };
      } catch {
        // Never surface deploy internals; fall through to the preview so the
        // user still gets a working link, and log server-side for triage.
        console.error(`hosted publish failed for site ${siteId}`);

        set.status = 502;

        return { error: "publish failed, please try again" };
      }
    }

    // Free / preview path.
    await dbPool
      .update(siteTable)
      .set({
        publishState: "published",
        deployedUrl: previewUrl,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(siteTable.id, siteId));

    return { url: previewUrl, hosted: false };
  })
  // Serve a published site's sanitized home page
  .get("/published/:id", async ({ params, set }) => {
    const [row] = await dbPool
      .select({ files: siteTable.files, publishState: siteTable.publishState })
      .from(siteTable)
      .where(eq(siteTable.id, params.id))
      .limit(1);

    if (!row || row.publishState !== "published") {
      set.status = 404;

      return "Not found";
    }

    set.headers["content-type"] = "text/html; charset=utf-8";

    return withBadge(publishDocument(row.files, "home"));
  })
  .use(ecosystemRoutes(PUBLIC_BASE))
  .use(webhooks)
  .use(
    yoga({
      schema,
      context: createGraphqlContext,
      graphiql: isDevEnv,
      plugins: [
        ...armorPlugin,
        createAuthenticationPlugin(),
        // disable GraphQL schema introspection in production to mitigate reverse engineering
        isProdEnv && useDisableIntrospection(),
        useOpenTelemetry({
          variables: true,
          result: true,
        }),
        // parser and validation caches recommended for Grafast (https://grafast.org/grafast/servers#envelop)
        useParserCache(),
        useValidationCache(),
        useGrafast(),
      ],
    }),
  )
  .listen(PORT);

// biome-ignore lint/suspicious/noConsole: root logging
console.log(
  `🦊 ${appConfig.name} Elysia server running at ${app.server?.url.toString().slice(0, -1)}`,
);

// biome-ignore lint/suspicious/noConsole: root logging
console.log(
  `🧘 ${appConfig.name} GraphQL Yoga API running at ${app.server?.url}graphql`,
);

/**
 * Graceful shutdown handler.
 */
const shutdown = async (signal: string) => {
  // biome-ignore lint/suspicious/noConsole: shutdown logging
  console.log(`[Server] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  app.stop();

  // Close database pool
  await pgPool.end();

  // biome-ignore lint/suspicious/noConsole: shutdown logging
  console.log("[Server] Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
