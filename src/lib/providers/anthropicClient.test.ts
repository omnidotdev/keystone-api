import { describe, expect, it } from "bun:test";

import { createAnthropicProviderClient } from "./anthropicClient";

describe("createAnthropicProviderClient", () => {
  it("returns a client implementing the ProviderClient contract", () => {
    const client = createAnthropicProviderClient({ apiKey: "sk-ant-test-key" });

    expect(typeof client.complete).toBe("function");
  });
});
