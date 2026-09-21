/**
 * Git content ingress for hosted publishing. Fractal builds a static site from
 * a git source (there is no upload-a-bundle source: `FractalServiceSourceInput`
 * is git or image only), so each published site's static build context (the
 * `buildImageContext` map: Dockerfile + nginx.conf + sanitized pages) is written
 * to a dedicated branch of a single content repo, one branch per site
 * (`site-<id>`). Fractal's webhook rebuilds the site's FractalService on push.
 *
 * The adapter is an interface so the publish orchestrator stays unit-testable;
 * the GitHub implementation is the network IO boundary.
 */

import type { GitSource } from "./fractal";

export interface ContentRepo {
  /**
   * Force-updates the site's isolated branch with its static build context and
   * returns the git source Fractal should build from. Force-update makes each
   * publish a single-commit snapshot, so a site's history never accumulates.
   */
  pushSite(siteId: string, files: Record<string, string>): Promise<GitSource>;
}

/** Branch name for a site. One branch per site keeps rebuilds isolated. */
export const branchForSite = (siteId: string): string => `site-${siteId}`;

export interface GithubContentRepoConfig {
  /** Repo owner, e.g. "omnidotdev" */
  owner: string;
  /** Repo name, e.g. "keystone-sites" */
  repo: string;
  /**
   * Token with contents:write on the content repo. Prefer a short-lived GitHub
   * App installation token minted per publish over a long-lived PAT.
   */
  token: string;
  /** Public clone URL Fractal builds from (defaults to the owner/repo https URL) */
  cloneUrl?: string;
  /** GitHub API base (override for GHE); defaults to the public API */
  apiBase?: string;
}

const GITHUB_API = "https://api.github.com";

/**
 * GitHub-backed {@link ContentRepo}. Uses the git-data API (blobs, tree,
 * commit, ref) to atomically publish a full file set to a site branch in one
 * force-update. The tree is built with no `base_tree`, so a re-publish fully
 * replaces the previous snapshot rather than layering onto it.
 */
export const createGithubContentRepo = (
  config: GithubContentRepoConfig,
): ContentRepo => {
  const apiBase = config.apiBase ?? GITHUB_API;
  const repoPath = `${config.owner}/${config.repo}`;
  const cloneUrl = config.cloneUrl ?? `https://github.com/${repoPath}`;

  const gh = async <T>(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
  ): Promise<T> => {
    const res = await fetch(`${apiBase}/repos/${repoPath}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      // Never surface GitHub's response body (may echo the token in a header
      // reflection or leak repo internals); log status only.
      throw new Error(`content repo ${method} ${path} failed (${res.status})`);
    }

    return (await res.json()) as T;
  };

  return {
    pushSite: async (siteId, files) => {
      const branch = branchForSite(siteId);

      // 1. Blobs for every file (base64 so binary-safe).
      const tree = await Promise.all(
        Object.entries(files).map(async ([path, content]) => {
          const blob = await gh<{ sha: string }>("/git/blobs", "POST", {
            content: Buffer.from(content, "utf8").toString("base64"),
            encoding: "base64",
          });

          return {
            path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          };
        }),
      );

      // 2. Tree with no base (full replace).
      const created = await gh<{ sha: string }>("/git/trees", "POST", { tree });

      // 3. Root commit (no parents: each publish is a fresh snapshot).
      const commit = await gh<{ sha: string }>("/git/commits", "POST", {
        message: `publish site ${siteId}`,
        tree: created.sha,
      });

      // 4. Force-update the site's ref (create it if absent).
      const ref = `refs/heads/${branch}`;

      try {
        await gh(`/git/${ref}`, "PATCH", { sha: commit.sha, force: true });
      } catch {
        await gh("/git/refs", "POST", { ref, sha: commit.sha });
      }

      return { git: { url: cloneUrl, branch } };
    },
  };
};
