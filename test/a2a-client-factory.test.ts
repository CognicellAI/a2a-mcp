import type { AgentCard } from "@a2a-js/sdk";
import { describe, expect, it } from "vitest";
import { SdkA2AClientFactory, normalizeV1AgentCard, parseAgentCard } from "../src/a2a-client-factory.js";
import type { AgentConfig, BridgeConfig } from "../src/config.js";

const baseConfig: BridgeConfig = {
  agents: {},
  authProfiles: {},
  network: {
    allowPrivateAddresses: false,
    requireHttps: true,
    timeoutMs: 30_000,
    maxResponseBytes: 10 * 1024 * 1024,
  },
};

const agentConfig: AgentConfig = {
  cardUrl: "https://agent.example.com/.well-known/agent-card.json",
  allowedBindings: ["JSONRPC", "HTTP+JSON"],
  signaturePolicy: "ifPresent",
  directUrlPolicy: "disabled",
};

describe("normalizeV1AgentCard", () => {
  it("rejects malformed Agent Cards before transport selection", () => {
    expect(() =>
      normalizeV1AgentCard(
        {
          description: "Missing name",
          version: "1.0.0",
          supportedInterfaces: [interfaceFor("https://agent.example.com/a2a", "JSONRPC", "1.0")],
        },
        agentConfig,
        baseConfig,
      ),
    ).toThrow("Invalid A2A Agent Card");
  });

  it("accepts valid lean Agent Cards and applies protocol defaults", () => {
    const card = parseAgentCard({
      name: "Lean",
      description: "Lean but valid",
      version: "1.0.0",
      supportedInterfaces: [interfaceFor("https://agent.example.com/a2a", "JSONRPC", "1.0")],
    });

    expect(card.capabilities?.extensions).toEqual([]);
    expect(card.securitySchemes).toEqual({});
    expect(card.securityRequirements).toEqual([]);
    expect(card.skills).toEqual([]);
  });

  it("filters to allowed A2A v1 interfaces while preserving agent preference order", () => {
    const normalized = normalizeV1AgentCard(
      agentCard([
        interfaceFor("https://agent.example.com/rest", "HTTP+JSON", "1.0"),
        interfaceFor("https://agent.example.com/jsonrpc", "JSONRPC", "1.0"),
        interfaceFor("https://agent.example.com/old", "JSONRPC", "0.3"),
        interfaceFor("https://agent.example.com/custom", "CUSTOM", "1.0"),
      ]),
      {
        ...agentConfig,
        allowedBindings: ["JSONRPC", "HTTP+JSON"],
      },
      baseConfig,
    );

    expect(normalized.supportedInterfaces.map((item) => item.protocolBinding)).toEqual([
      "HTTP+JSON",
      "JSONRPC",
    ]);
  });

  it("rejects cards without allowed A2A v1 interfaces", () => {
    expect(() =>
      normalizeV1AgentCard(
        agentCard([interfaceFor("https://agent.example.com/old", "JSONRPC", "0.3")]),
        agentConfig,
        baseConfig,
      ),
    ).toThrow("Agent Card does not expose an allowed A2A v1.0 interface");
  });

  it("rejects required extensions until explicit handlers exist", () => {
    const card = agentCard([interfaceFor("https://agent.example.com/jsonrpc", "JSONRPC", "1.0")]);
    card.capabilities?.extensions.push({
      uri: "https://extensions.example.com/required",
      description: "Required extension",
      required: true,
      params: undefined,
    });

    expect(() => normalizeV1AgentCard(card, agentConfig, baseConfig)).toThrow(
      "Agent requires unsupported A2A extensions",
    );
  });

  it("rejects private or local interface URLs by default", () => {
    expect(() =>
      normalizeV1AgentCard(
        agentCard([interfaceFor("https://127.0.0.1/a2a", "JSONRPC", "1.0")]),
        agentConfig,
        baseConfig,
      ),
    ).toThrow("private or local host");
  });

  it("rejects unsigned cards when signatures are required", () => {
    expect(() =>
      normalizeV1AgentCard(
        agentCard([interfaceFor("https://agent.example.com/a2a", "JSONRPC", "1.0")]),
        {
          ...agentConfig,
          signaturePolicy: "required",
        },
        baseConfig,
      ),
    ).toThrow("signature is required");
  });

  it("rejects signed cards when verification is requested but not configured", () => {
    const card = agentCard([interfaceFor("https://agent.example.com/a2a", "JSONRPC", "1.0")]);
    card.signatures.push({
      protected: "eyJhbGciOiJFUzI1NiJ9",
      signature: "not-a-real-signature",
      header: undefined,
    });

    expect(() => normalizeV1AgentCard(card, agentConfig, baseConfig)).toThrow(
      "signature verification is not configured",
    );
  });

  it("allows signed cards when signature policy is disabled", () => {
    const card = agentCard([interfaceFor("https://agent.example.com/a2a", "JSONRPC", "1.0")]);
    card.signatures.push({
      protected: "eyJhbGciOiJFUzI1NiJ9",
      signature: "not-a-real-signature",
      header: undefined,
    });

    const normalized = normalizeV1AgentCard(
      card,
      {
        ...agentConfig,
        signaturePolicy: "disabled",
      },
      baseConfig,
    );

    expect(normalized.signatures).toHaveLength(1);
  });
});

describe("SdkA2AClientFactory", () => {
  it("fails fast when an agent references an unknown auth profile", async () => {
    const factory = new SdkA2AClientFactory({
      ...baseConfig,
      agents: {
        demo: {
          ...agentConfig,
          authProfile: "missing-profile",
        },
      },
    });

    await expect(factory.create("demo")).rejects.toThrow("Unknown auth profile");
  });

  it("does not cache failed client creation attempts", async () => {
    const factory = new SdkA2AClientFactory({
      ...baseConfig,
      agents: {
        demo: {
          ...agentConfig,
          authProfile: "missing-profile",
        },
      },
    });

    await expect(factory.create("demo")).rejects.toThrow("Unknown auth profile");
    await expect(factory.create("demo")).rejects.toThrow("Unknown auth profile");
  });
});

function interfaceFor(url: string, protocolBinding: string, protocolVersion: string) {
  return {
    url,
    protocolBinding,
    protocolVersion,
    tenant: "",
  };
}

function agentCard(supportedInterfaces: AgentCard["supportedInterfaces"]): AgentCard {
  return {
    name: "Demo",
    description: "Demo A2A agent",
    supportedInterfaces,
    provider: undefined,
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: true,
      extensions: [],
      extendedAgentCard: true,
    },
    securitySchemes: {},
    securityRequirements: [],
    skills: [],
    defaultInputModes: [],
    defaultOutputModes: [],
    signatures: [],
  };
}
