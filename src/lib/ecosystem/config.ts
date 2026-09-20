/**
 * Ecosystem integration config, read from the environment. When an upstream
 * URL/key is absent the corresponding connection degrades to link-out mode, so
 * blocks still work (as links) before service keys are wired.
 */
const env = process.env;

export const HALO_API_URL = env.HALO_API_URL;
export const HALO_SERVICE_KEY = env.HALO_SERVICE_KEY;
export const HALO_STOREFRONT_BASE =
  env.HALO_STOREFRONT_BASE ?? "https://halo.omni.dev";

export const CRYSTAL_API_URL = env.CRYSTAL_API_URL;
export const CRYSTAL_APP_URL =
  env.CRYSTAL_APP_URL ?? "https://crystal.omni.dev";

export const HERALD_API_URL = env.HERALD_API_URL;
export const HERALD_API_KEY = env.HERALD_API_KEY;
