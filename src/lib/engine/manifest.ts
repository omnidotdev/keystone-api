import type { SiteFiles } from "./types";

export type ManifestPropType = "string" | "number" | "boolean" | "enum";

export interface ManifestComponentProp {
  name: string;
  type: ManifestPropType;
  /** Allowed values when `type` is "enum" */
  enumValues?: string[];
  description?: string;
  default?: string | number | boolean;
}

export interface ManifestComponent {
  /** The custom-element tag the model may emit (must contain a hyphen) */
  name: string;
  description: string;
  props?: ManifestComponentProp[];
  slots?: string[];
  examples?: string[];
}

export interface ComponentManifest {
  components: ManifestComponent[];
}

/**
 * A design system optionally attached to a site. Supplying a `manifest`
 * switches generation into Design-System mode; supplying only `tokens` themes
 * freeform output. Both absent is Freeform mode.
 */
export interface DesignSystem {
  /** Design tokens compiled into the theme (DTCG-shaped, serialized) */
  tokens?: string;
  manifest?: ComponentManifest;
}

// Custom-element-style tags contain a hyphen; standard HTML tags do not
const CUSTOM_TAG = /<([a-z][a-z0-9]*-[a-z0-9-]*)/gi;

/**
 * Returns the unique custom-element tag names used in a fragment of HTML.
 */
export const extractCustomTags = (html: string): string[] => {
  const tags = new Set<string>();

  for (const match of html.matchAll(CUSTOM_TAG)) {
    const tag = match[1];

    if (tag) tags.add(tag.toLowerCase());
  }

  return [...tags];
};

/**
 * Enforces the Design-System contract: every custom-element tag used by any
 * page must be a component declared in the manifest. Throws on the first
 * violation so invalid generations are never persisted.
 */
export const validateAgainstManifest = (
  site: SiteFiles,
  manifest: ComponentManifest,
): void => {
  const allowed = new Set(
    manifest.components.map((component) => component.name.toLowerCase()),
  );

  for (const [pageId, page] of Object.entries(site.pages)) {
    for (const tag of extractCustomTags(page.html)) {
      if (!allowed.has(tag)) {
        throw new Error(
          `page "${pageId}" uses component "${tag}" which is not in the design system manifest`,
        );
      }
    }
  }
};
