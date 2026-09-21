/**
 * Adapter that publishes a Keystone site onto Fractal through the fractal-api
 * GraphQL surface. Per the 2026-09-19 investigation (GATE B), a site is a
 * `staticSite` FractalService: `createFractalService` gives an instant
 * subdomain, and `updateFractalService` attaches a custom domain later. The
 * GraphQL client is injected so this adapter stays unit-testable.
 */

export interface ImageSource {
  image: { repository: string; tag: string };
}

export interface GitSource {
  git: { url: string; branch: string };
}

export type ServiceSource = ImageSource | GitSource;

export interface CustomDomainRecord {
  /** Record host, e.g. "app.example.com" */
  name: string;
  /** Record type, e.g. "CNAME" */
  recordType: string;
  /** Record target */
  value: string;
  /** "traffic" (routes to Fractal) or "acme" (DNS-01 delegation) */
  purpose: string;
}

export interface FractalServiceResult {
  service: {
    status?: {
      url?: string;
      customDomainRecords?: CustomDomainRecord[];
    };
  };
}

export interface FractalClient {
  createFractalService(
    input: Record<string, unknown>,
  ): Promise<FractalServiceResult>;
  updateFractalService(
    input: Record<string, unknown>,
  ): Promise<FractalServiceResult>;
}

export interface DeployStaticSiteArgs {
  client: FractalClient;
  project: string;
  name: string;
  displayName?: string;
  source: ServiceSource;
  /**
   * Request-driven scale to zero via the KEDA HTTP add-on. Defaults to true:
   * published sites idle down to zero replicas (no standing pod cost) and cold
   * start on the next request. Set false to keep the site warm.
   */
  scaleToZero?: boolean;
  /** Idle seconds before scaling to zero (only when scaleToZero) */
  idleTimeoutSeconds?: number;
}

const isImageSource = (source: ServiceSource): source is ImageSource =>
  "image" in source;

/**
 * Creates (or provisions) a static-site FractalService and returns its live
 * subdomain (`<name>-<project>.fractal.dev`, an isolated apps domain, never a
 * keystone.omni.dev subdomain). A prebuilt image deploys with no build step; a
 * git source is built by Fractal's auto (kiln) pipeline. Sites scale to zero
 * when idle by default, so an unvisited published site costs nothing to host.
 */
export const deployStaticSite = async (
  args: DeployStaticSiteArgs,
): Promise<{ url: string }> => {
  const scaleToZero = args.scaleToZero ?? true;

  const input = {
    project: args.project,
    name: args.name,
    displayName: args.displayName ?? args.name,
    serviceType: "staticSite",
    source: args.source,
    build: { mode: isImageSource(args.source) ? "none" : "auto" },
    deploy: {
      replicas: 1,
      ...(scaleToZero
        ? {
            autoscale: {
              minReplicas: 0,
              maxReplicas: 3,
              scaleToZero: true,
              idleTimeoutSeconds: args.idleTimeoutSeconds ?? 300,
            },
          }
        : {}),
    },
    expose: { port: 80, tls: true },
  };

  const result = await args.client.createFractalService(input);

  const url = result.service.status?.url;

  if (!url) throw new Error("Fractal did not return a service url");

  return { url };
};

export interface AttachCustomDomainArgs {
  client: FractalClient;
  project: string;
  name: string;
  domain: string;
  /** Custom-hostname provider; edge TLS via Cloudflare-for-SaaS by default */
  provider?: "cloudflareForSaas" | "catchall";
}

/**
 * Attaches a custom domain to an existing site and returns the DNS records the
 * user must set. Defaults to Cloudflare-for-SaaS (edge TLS), the recommended
 * path for a multi-tenant builder.
 */
export const attachCustomDomain = async (
  args: AttachCustomDomainArgs,
): Promise<{ records: CustomDomainRecord[] }> => {
  const result = await args.client.updateFractalService({
    project: args.project,
    name: args.name,
    expose: {
      domain: args.domain,
      tls: true,
      customHostname: { provider: args.provider ?? "cloudflareForSaas" },
    },
  });

  return { records: result.service.status?.customDomainRecords ?? [] };
};
