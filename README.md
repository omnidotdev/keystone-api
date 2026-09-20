# keystone-api

🗝️ Keystone is an AI web builder: describe a site, Keystone generates it, you
refine it turn by turn, then publish it. This is the API and generation engine
(the builder UI lives in `keystone-app`). Apache-2.0.

Stack: Bun, Elysia, Postgraphile v5 + Drizzle (GraphQL), graphql-yoga, Anthropic
SDK. Scaffolded from `template-elysia`.

## Run locally

```bash
bun install
cp .env.local.template .env.local   # then set DATABASE_URL, ensure Postgres is up
bun db:migrate                       # apply schema + regenerate GraphQL
bun dev                              # https://localhost:4000 (self-signed cert)
```

AI generation resolves Anthropic credentials from `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` profile.

Flagship demo (prompt to a browsable site, no UI needed):

```bash
bun demo "a bold landing page for an artisanal coffee roaster"
# writes ~/Downloads/keystone-demo.html
```

## Surface

- **GraphQL** at `/graphql` (Postgraphile; Site CRUD auto-generated). GraphiQL in dev.
- **REST builder actions** (MVP; `generate`/`publish` to become Grafast mutations,
  CRUD to move to the GraphQL client):
  - `POST /sites` -> `{ siteId }`
  - `GET /sites/:id` -> `{ files, transcript, publishState }`
  - `POST /generate` `{ siteId, request, model? }` -> `{ reply, credits }` (real Claude, persisted)
  - `POST /publish` `{ siteId }` -> `{ url }`
  - `GET /published/:id` -> the sanitized site (scripts stripped) + a "Built with
    Keystone / Live on Fractal" badge + the ecosystem runtime
- **Ecosystem broker** at `/api/ecosystem/{support,buy}/checkout` and `/subscribe`.

## Architecture

- `src/lib/engine/` — pure, provider-agnostic generation core: `types` (site
  model), mode-aware `generator` (Freeform vs Design-System), `manifest` (the
  design-system contract), `models`/`credits`, `entitlement`, preview/publish
  `assemble`, server-side `sanitize`.
- `src/lib/publish/` — static bundle + nginx image context, and the Fractal deploy
  adapter (`deployStaticSite` / `attachCustomDomain`) + real graphql-request client.
- `src/lib/site/` — Drizzle `site` store + `runSiteGeneration` orchestration.
- `src/lib/ecosystem/` — integration blocks broker (Halo buy, Crystal support,
  Herald email, Arbor repo). Reuses Blink's fail-soft pattern; **written for
  extraction to `@omnidotdev/providers/ecosystem`** (see the ADR in
  `~/projects/omni/plans/2026-09-19-omni-ecosystem-shared-lib-adr.md`).

## Ecosystem blocks

The generator emits declarative markup; Keystone wires it at publish time (the
site HTML is sanitized, so the runtime script is injected by Keystone, not the
model). Every block is fail-soft.

- Buy (Halo): `<button data-kx-buy="PRODUCT_ID">Buy</button>`
- Support (Crystal): `<button data-kx-support="HANDLE" data-kx-amount="500">Support</button>`
- Newsletter (Herald): `<form data-kx-subscribe="AUDIENCE_ID"><input type="email" name="email" required>...</form>`
- Repo showcase (Arbor): a card wrapped in `<a href="https://arbor.omni.dev/@OWNER/REPO" data-kx-repo="OWNER/REPO">`

Without the matching upstream env (see `.env.local.template`) buy/support degrade
to a link-out, email reports "not configured" (never a silent drop), and the repo
card is always a link-out.

## Status

Working locally end-to-end (generate → preview → publish). Typechecks, unit tests
green, Biome-clean. Not yet deployed. Remaining: GraphQL data-layer migration,
live Fractal publish (registry + token), real ecosystem service keys, shared-lib
extraction, infra provisioning. See
`~/projects/omni/plans/2026-09-19-keystone-web-builder-implementation.md`.
