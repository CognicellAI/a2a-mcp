import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const ProtocolBindingSchema = z.enum(["JSONRPC", "HTTP+JSON"]);
export type ProtocolBinding = z.infer<typeof ProtocolBindingSchema>;

const SignaturePolicySchema = z.enum(["disabled", "ifPresent", "required"]);
const DirectUrlPolicySchema = z.enum(["disabled", "enabled"]);

export const AuthProfileSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),
  z.object({
    type: z.literal("bearer-env"),
    env: z.string().min(1),
  }),
  z.object({
    type: z.literal("api-key-env"),
    env: z.string().min(1),
    header: z.string().min(1).default("X-API-Key"),
  }),
  z.object({
    type: z.literal("oauth-client-credentials-env"),
    tokenUrl: z.string().url(),
    clientIdEnv: z.string().min(1),
    clientSecretEnv: z.string().min(1),
    scope: z.string().min(1).optional(),
    audience: z.string().min(1).optional(),
    authMethod: z.enum(["client_secret_basic", "client_secret_post"]).default("client_secret_basic"),
    extraParams: z.record(z.string()).default({}),
  }),
]);

export type AuthProfile = z.infer<typeof AuthProfileSchema>;

export const AgentConfigSchema = z.object({
  cardUrl: z.string().url(),
  allowedBindings: z.array(ProtocolBindingSchema).nonempty().default(["JSONRPC", "HTTP+JSON"]),
  authProfile: z.string().min(1).optional(),
  signaturePolicy: SignaturePolicySchema.default("ifPresent"),
  directUrlPolicy: DirectUrlPolicySchema.default("disabled"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const BridgeConfigSchema = z.object({
  agents: z.record(AgentConfigSchema).default({}),
  authProfiles: z.record(AuthProfileSchema).default({}),
  network: z
    .object({
      allowPrivateAddresses: z.boolean().default(false),
      requireHttps: z.boolean().default(true),
      timeoutMs: z.number().int().positive().default(30_000),
      maxResponseBytes: z.number().int().positive().default(10 * 1024 * 1024),
    })
    .default({}),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export async function loadConfig(path = process.env.A2A_MCP_CONFIG): Promise<BridgeConfig> {
  if (!path) {
    return BridgeConfigSchema.parse({});
  }

  const absolutePath = resolve(path);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = absolutePath.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);

  return BridgeConfigSchema.parse(parsed);
}
