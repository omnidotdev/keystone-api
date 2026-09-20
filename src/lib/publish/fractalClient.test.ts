import { describe, expect, it } from "bun:test";

import { createFractalGraphqlClient } from "./fractalClient";

describe("createFractalGraphqlClient", () => {
  it("returns a client implementing the FractalClient contract", () => {
    const client = createFractalGraphqlClient(
      "https://api.fractal.omni.dev/graphql",
      "token",
    );

    expect(typeof client.createFractalService).toBe("function");
    expect(typeof client.updateFractalService).toBe("function");
  });
});
