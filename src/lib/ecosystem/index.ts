/**
 * Omni ecosystem integration blocks: broker + per-product connections a
 * surface-rendering product embeds (Halo buy, Crystal support, Herald email).
 *
 * This module is written to be extracted into a shared `@omnidotdev/ecosystem`
 * package (see plans/2026-09-19-omni-ecosystem-shared-lib-adr.md). Connections
 * take their transport by injection so it can repoint at Lattice's unified API
 * in one place; the broker/coalesce/cache/fail-soft contract is transport-
 * agnostic and belongs in the lib.
 */

export {
  type ArborConnection,
  createArborConnection,
} from "./arborConnection";
export {
  type BrokerResult,
  type BuyRequest,
  type SubscribeRequest,
  type SupportRequest,
  resolveBuyCheckout,
  resolveSubscribe,
  resolveSupportCheckout,
} from "./broker";
export { createCoalescer } from "./coalesce";
export {
  type CrystalConnection,
  createCrystalConnection,
} from "./crystalConnection";
export {
  type GraphqlRequest,
  type HaloConnection,
  createHaloConnection,
} from "./haloConnection";
export {
  type HeraldConnection,
  createHeraldConnection,
} from "./heraldConnection";
export { ecosystemRoutes } from "./routes";
export { ecosystemRuntime } from "./runtime";
export { type TtlCache, createTtlCache } from "./ttlCache";
