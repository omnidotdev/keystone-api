import { describe, expect, it } from "bun:test";

import { pushFiles } from "./git";

import type { Spawn } from "./git";

/**
 * Fake spawn: records argv, never runs git, and reports success. `stderr` is a
 * no-op emitter; `close` fires 0 on the next tick.
 */
const fakeSpawn = () => {
  const calls: string[][] = [];
  const spawn = ((_cmd: string, args: string[]) => {
    calls.push(args);
    return {
      stderr: { on: () => {} },
      on: (event: string, cb: (code?: number) => void) => {
        if (event === "close") queueMicrotask(() => cb(0));
      },
    };
  }) as unknown as Spawn;
  return { spawn, calls };
};

describe("pushFiles", () => {
  it("inits, commits, and force-pushes to the branch with the token embedded", async () => {
    const { spawn, calls } = fakeSpawn();

    await pushFiles({
      files: { "index.html": "<h1>hi</h1>", Dockerfile: "FROM nginx" },
      remoteUrl: "https://api.arbor.omni.dev/git/ada/site-abc",
      branch: "master",
      token: "secret-token",
      spawn,
    });

    const verbs = calls.map((a) => a[0]);
    expect(verbs).toEqual(["init", "add", "commit", "push"]);

    const push = calls.find((a) => a[0] === "push");
    expect(push).toContain("--force");
    // token injected as basic-auth password, push targets the branch ref
    const remote = push?.find((a) => a.startsWith("https://"));
    expect(remote).toContain("x-access-token:secret-token@");
    expect(push).toContain("HEAD:refs/heads/master");
  });

  it("rejects (and scrubs the token) when git fails", async () => {
    const failing = ((_cmd: string, args: string[]) => ({
      stderr: {
        on: (_e: string, cb: (c: Buffer) => void) =>
          cb(Buffer.from("fatal: https://x-access-token:secret@host boom")),
      },
      on: (event: string, cb: (code?: number) => void) => {
        if (event === "close")
          queueMicrotask(() => cb(args[0] === "push" ? 1 : 0));
      },
    })) as unknown as Spawn;

    const err = await pushFiles({
      files: { a: "b" },
      remoteUrl: "https://api.arbor.omni.dev/git/ada/site-abc",
      branch: "master",
      token: "secret",
      spawn: failing,
    }).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("secret");
    expect((err as Error).message).toContain("x-access-token:***");
  });
});
