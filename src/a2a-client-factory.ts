import {
  ClientFactory,
  JsonRpcTransportFactory,
  RestTransportFactory,
  type Client,
} from "@a2a-js/sdk/client";
import { AgentCard as AgentCardCodec, type AgentCard, type AgentExtension, type AgentInterface } from "@a2a-js/sdk";
import { z } from "zod";
import type { AgentConfig, BridgeConfig, ProtocolBinding } from "./config.js";
import { createHeaderProvider, withStaticHeaders } from "./auth.js";
import { BridgeError } from "./errors.js";
import { assertAllowedUrl, createPolicyFetch } from "./policy.js";

export interface A2AClientBundle {
  readonly client: Client;
  readonly agentCard: AgentCard;
}

const MetadataSchema = z.record(z.unknown());

const AgentInterfaceSchema = z
  .object({
    url: z.string().url(),
    protocolBinding: z.string().min(1),
    protocolVersion: z.string().min(1),
    tenant: z.string().optional(),
  })
  .passthrough();

const AgentExtensionSchema = z
  .object({
    uri: z.string().url(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    params: MetadataSchema.optional(),
  })
  .passthrough();

const AgentCapabilitiesSchema = z
  .object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extensions: z.array(AgentExtensionSchema).default([]),
    extendedAgentCard: z.boolean().optional(),
  })
  .passthrough();

const AgentSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
    securityRequirements: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

const AgentCardSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    supportedInterfaces: z.array(AgentInterfaceSchema).min(1),
    provider: z.record(z.unknown()).optional(),
    version: z.string().min(1),
    documentationUrl: z.string().url().optional(),
    capabilities: AgentCapabilitiesSchema.default({ extensions: [] }),
    securitySchemes: z.record(z.unknown()).default({}),
    securityRequirements: z.array(z.record(z.unknown())).default([]),
    defaultInputModes: z.array(z.string()).default([]),
    defaultOutputModes: z.array(z.string()).default([]),
    skills: z.array(AgentSkillSchema).default([]),
    signatures: z.array(z.record(z.unknown())).default([]),
    iconUrl: z.string().url().optional(),
  })
  .passthrough();

export class SdkA2AClientFactory {
  private readonly cache = new Map<string, Promise<A2AClientBundle>>();

  constructor(private readonly config: BridgeConfig) {}

  async create(agent: string): Promise<A2AClientBundle> {
    const existing = this.cache.get(agent);
    if (existing) {
      return existing;
    }

    const created = this.createUncached(agent).catch((error: unknown) => {
      this.cache.delete(agent);
      throw error;
    });
    this.cache.set(agent, created);
    return created;
  }

  private async createUncached(agent: string): Promise<A2AClientBundle> {
    const agentConfig = this.config.agents[agent];
    if (!agentConfig) {
      throw new Error(`Unknown A2A agent alias: ${agent}`);
    }

    const cardUrl = assertAllowedUrl(agentConfig.cardUrl, this.config.network);
    const authProfile = resolveAuthProfile(this.config, agentConfig);
    const policyFetch = createPolicyFetch(fetch, this.config.network);
    const fetchImpl = withStaticHeaders(policyFetch, createHeaderProvider(authProfile, policyFetch));
    const resolver = new StrictAgentCardResolver(fetchImpl, agentConfig, this.config);
    const transports = [
      new JsonRpcTransportFactory({ fetchImpl }),
      new RestTransportFactory({ fetchImpl }),
    ];

    const factory = new ClientFactory({
      transports,
      cardResolver: resolver,
    });
    const path = `${cardUrl.pathname}${cardUrl.search}`;
    const baseUrl = `${cardUrl.protocol}//${cardUrl.host}`;
    const agentCard = await resolver.resolve(baseUrl, path);
    const client = await factory.createFromAgentCard(agentCard);

    return { client, agentCard };
  }
}

class StrictAgentCardResolver {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly agentConfig: AgentConfig,
    private readonly bridgeConfig: BridgeConfig,
  ) {}

  async resolve(baseUrl: string, path = "/.well-known/agent-card.json"): Promise<AgentCard> {
    const url = new URL(path, baseUrl).toString();
    assertAllowedUrl(url, this.bridgeConfig.network);

    const response = await this.fetchImpl(url, {
      headers: { "A2A-Version": "1.0" },
    });

    if (!response.ok) {
      throw new Error(`Fetch Agent Card failed: HTTP ${response.status}`);
    }

    const card = await response.json();
    return normalizeV1AgentCard(card, this.agentConfig, this.bridgeConfig);
  }
}

export function normalizeV1AgentCard(
  rawCard: unknown,
  agentConfig: AgentConfig,
  bridgeConfig: BridgeConfig,
): AgentCard {
  const card = parseAgentCard(rawCard);
  enforceSignaturePolicy(card, agentConfig.signaturePolicy);
  const supportedInterfaces = card.supportedInterfaces ?? [];
  const supported = supportedInterfaces.filter((agentInterface: AgentInterface) => {
    assertAllowedUrl(agentInterface.url, bridgeConfig.network);

    return (
      agentInterface.protocolVersion === "1.0" &&
      isAllowedBinding(agentInterface.protocolBinding, agentConfig.allowedBindings)
    );
  });

  if (supported.length === 0) {
    throw new BridgeError({
      message: "Agent Card does not expose an allowed A2A v1.0 interface",
      category: "protocol",
      code: -32009,
    });
  }

  const requiredUnsupportedExtensions = (card.capabilities?.extensions ?? []).filter((extension: AgentExtension) => {
    return extension.required;
  });

  if (requiredUnsupportedExtensions && requiredUnsupportedExtensions.length > 0) {
    const extensions = requiredUnsupportedExtensions.map((extension: AgentExtension) => extension.uri).join(", ");
    throw new BridgeError({
      message: `Agent requires unsupported A2A extensions: ${extensions}`,
      category: "protocol",
      code: -32008,
    });
  }

  return {
    ...card,
    supportedInterfaces: supported,
  };
}

function enforceSignaturePolicy(
  card: AgentCard,
  signaturePolicy: AgentConfig["signaturePolicy"],
): void {
  const signatureCount = card.signatures?.length ?? 0;

  if (signaturePolicy === "disabled") {
    return;
  }

  if (signaturePolicy === "required" && signatureCount === 0) {
    throw new BridgeError({
      message: "Agent Card signature is required by policy but the card is unsigned",
      category: "policy",
    });
  }

  if (signatureCount > 0) {
    throw new BridgeError({
      message: "Agent Card includes signatures, but signature verification is not configured",
      category: "policy",
    });
  }
}

export function parseAgentCard(rawCard: unknown): AgentCard {
  const parsed = AgentCardSchema.safeParse(rawCard);
  if (!parsed.success) {
    throw new BridgeError({
      message: "Invalid A2A Agent Card",
      category: "protocol",
      code: -32602,
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  return AgentCardCodec.fromJSON(parsed.data);
}

function resolveAuthProfile(config: BridgeConfig, agentConfig: AgentConfig) {
  if (!agentConfig.authProfile) {
    return undefined;
  }

  const profile = config.authProfiles[agentConfig.authProfile];
  if (!profile) {
    throw new BridgeError({
      message: `Unknown auth profile: ${agentConfig.authProfile}`,
      category: "configuration",
    });
  }

  return profile;
}

function isAllowedBinding(value: string, allowedBindings: readonly ProtocolBinding[]): boolean {
  return allowedBindings.some((binding) => binding === value);
}
