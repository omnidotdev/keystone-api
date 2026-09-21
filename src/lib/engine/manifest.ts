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

/** The generation mode a site's design system implies. */
export type GenerationMode = "freeform" | "themed" | "design-system";

/**
 * The generation mode implied by a design system: a manifest constrains
 * generation to whitelisted components (Design-System mode), tokens alone theme
 * otherwise-freeform output, and neither is plain Freeform.
 */
export const designSystemMode = (
  designSystem?: DesignSystem | null,
): GenerationMode => {
  if (designSystem?.manifest) return "design-system";
  if (designSystem?.tokens) return "themed";

  return "freeform";
};

/**
 * Validate and normalize a client-supplied design system before it is attached
 * to a site. A manifest, when present, must declare at least one component and
 * every component needs a hyphenated custom-element tag name plus a description
 * so the generator can compose from it. Throws with an actionable message so a
 * malformed manifest never reaches generation.
 */
export const parseDesignSystem = (input: unknown): DesignSystem => {
  if (typeof input !== "object" || input === null) {
    throw new Error("design system must be an object");
  }

  const { tokens, manifest } = input as {
    tokens?: unknown;
    manifest?: unknown;
  };

  if (tokens !== undefined && typeof tokens !== "string") {
    throw new Error("design system tokens must be a serialized string");
  }

  let parsedManifest: ComponentManifest | undefined;

  if (manifest !== undefined) {
    const components = (manifest as ComponentManifest | null)?.components;

    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !Array.isArray(components)
    ) {
      throw new Error("manifest must have a components array");
    }

    if (components.length === 0) {
      throw new Error("manifest must declare at least one component");
    }

    for (const component of components) {
      if (!component?.name || typeof component.name !== "string") {
        throw new Error("every manifest component needs a name");
      }

      if (!component.name.includes("-")) {
        throw new Error(
          `component "${component.name}" must be a custom-element tag (hyphenated)`,
        );
      }

      if (!component.description || typeof component.description !== "string") {
        throw new Error(`component "${component.name}" needs a description`);
      }
    }

    parsedManifest = { components };
  }

  if (tokens === undefined && parsedManifest === undefined) {
    throw new Error("design system must supply tokens and/or a manifest");
  }

  return {
    ...(tokens !== undefined ? { tokens } : {}),
    ...(parsedManifest ? { manifest: parsedManifest } : {}),
  };
};

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
