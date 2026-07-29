import { describe, expect, it } from "vitest";
import { BridgeConfigSchema } from "../src/config.js";

describe("BridgeConfigSchema", () => {
  it("defaults to no configured agents", () => {
    const config = BridgeConfigSchema.parse({});

    expect(config.agents).toEqual({});
    expect(config.network.requireHttps).toBe(true);
  });

  it("keeps credentials behind auth profile references", () => {
    const config = BridgeConfigSchema.parse({
      agents: {
        demo: {
          cardUrl: "https://agent.example.com/.well-known/agent-card.json",
          authProfile: "demo-token",
        },
      },
      authProfiles: {
        "demo-token": {
          type: "bearer-env",
          env: "A2A_DEMO_TOKEN",
        },
      },
    });

    expect(config.agents.demo?.authProfile).toBe("demo-token");
    expect(config.authProfiles["demo-token"]).toEqual({
      type: "bearer-env",
      env: "A2A_DEMO_TOKEN",
    });
  });

  it("parses machine-to-machine OAuth client credentials profiles", () => {
    const config = BridgeConfigSchema.parse({
      agents: {
        demo: {
          cardUrl: "https://agent.example.com/.well-known/agent-card.json",
          authProfile: "demo-m2m",
        },
      },
      authProfiles: {
        "demo-m2m": {
          type: "oauth-client-credentials-env",
          tokenUrl: "https://auth.example.com/oauth/token",
          clientIdEnv: "A2A_DEMO_CLIENT_ID",
          clientSecretEnv: "A2A_DEMO_CLIENT_SECRET",
          scope: "a2a:send a2a:read",
          audience: "https://agent.example.com",
          extraParams: {
            resource: "https://agent.example.com",
          },
        },
      },
    });

    expect(config.authProfiles["demo-m2m"]).toEqual({
      type: "oauth-client-credentials-env",
      tokenUrl: "https://auth.example.com/oauth/token",
      clientIdEnv: "A2A_DEMO_CLIENT_ID",
      clientSecretEnv: "A2A_DEMO_CLIENT_SECRET",
      scope: "a2a:send a2a:read",
      audience: "https://agent.example.com",
      authMethod: "client_secret_basic",
      extraParams: {
        resource: "https://agent.example.com",
      },
    });
  });
});
