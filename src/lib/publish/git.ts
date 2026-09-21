/**
 * Minimal git push over Smart HTTP. Hosted publishing writes a site's static
 * build context to its own repo by shelling out to the `git` binary: a fresh
 * work tree, one commit, one force-push. Force keeps each publish a single
 * snapshot (no accumulating history) and makes re-publishing idempotent.
 *
 * The push is authenticated by embedding a bearer credential as the HTTP basic
 * password (`https://x-access-token:<token>@host/...`), the same convention git
 * hosts use for token auth. `spawn` is injected so the orchestration is testable
 * without a real git binary or network.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Spawn = typeof nodeSpawn;

export interface PushFilesArgs {
  /** Relative path -> file contents (e.g. from buildImageContext) */
  files: Record<string, string>;
  /** Remote URL WITHOUT credentials (credentials are injected from `token`) */
  remoteUrl: string;
  /** Branch to force-push to */
  branch: string;
  /** Bearer credential embedded as the basic-auth password */
  token: string;
  /** Injected for testing; defaults to node's child_process.spawn */
  spawn?: Spawn;
}

/** Runs a git command in `cwd`, rejecting on a non-zero exit. Never logs argv (it can carry the token). */
const run = (
  spawn: Spawn,
  cwd: string,
  args: string[],
  env: Record<string, string>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      // Strip anything token-shaped from git's stderr before surfacing it.
      const safe = stderr.replace(
        /x-access-token:[^@\s]+/g,
        "x-access-token:***",
      );
      reject(new Error(`git ${args[0]} failed (${code}): ${safe.trim()}`));
    });
  });

/** Inject the token into the remote URL as the basic-auth password. */
const authedRemote = (remoteUrl: string, token: string): string => {
  const u = new URL(remoteUrl);
  u.username = "x-access-token";
  u.password = token;
  return u.toString();
};

/**
 * Writes `files` into a throwaway work tree and force-pushes them as a single
 * commit to `branch` on `remoteUrl`. Cleans up the work tree even on failure.
 */
export const pushFiles = async (args: PushFilesArgs): Promise<void> => {
  const spawn = args.spawn ?? nodeSpawn;
  const dir = await mkdtemp(join(tmpdir(), "keystone-publish-"));

  const env = {
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Keystone",
    GIT_AUTHOR_EMAIL: "keystone@omni.dev",
    GIT_COMMITTER_NAME: "Keystone",
    GIT_COMMITTER_EMAIL: "keystone@omni.dev",
  };

  try {
    for (const [path, content] of Object.entries(args.files)) {
      const full = join(dir, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, "utf8");
    }

    await run(spawn, dir, ["init", "-q", "-b", args.branch], env);
    await run(spawn, dir, ["add", "-A"], env);
    await run(spawn, dir, ["commit", "-q", "-m", "publish"], env);
    await run(
      spawn,
      dir,
      [
        "push",
        "--force",
        authedRemote(args.remoteUrl, args.token),
        `HEAD:refs/heads/${args.branch}`,
      ],
      env,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
