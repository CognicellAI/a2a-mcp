import { describe, expect, it } from "vitest";
import { createPolicyFetch } from "../src/policy.js";

const network = {
  allowPrivateAddresses: true,
  requireHttps: false,
  timeoutMs: 50,
  maxResponseBytes: 8,
};

describe("createPolicyFetch", () => {
  it("rejects responses larger than maxResponseBytes", async () => {
    const policyFetch = createPolicyFetch(
      async () =>
        new Response("this is too large", {
          headers: { "Content-Type": "application/json" },
        }),
      network,
    );

    await expect(policyFetch("http://127.0.0.1/a2a")).rejects.toMatchObject({
      message: expect.stringContaining("maxResponseBytes"),
      category: "transport",
    });
  });

  it("times out slow requests with ambiguous outcome metadata", async () => {
    const policyFetch = createPolicyFetch(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
      network,
    );

    await expect(policyFetch("http://127.0.0.1/a2a")).rejects.toMatchObject({
      message: expect.stringContaining("timed out"),
      category: "transport",
      retriable: true,
      ambiguousOutcome: true,
    });
  });
});
