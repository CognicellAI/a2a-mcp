import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { SdkA2AClientFactory } from "../src/a2a-client-factory.js";
import { A2ABridgeService } from "../src/a2a-service.js";
import type { BridgeConfig } from "../src/config.js";

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly body?: unknown;
}

let restoreToken: string | undefined;

afterEach(() => {
  if (restoreToken === undefined) {
    delete process.env.A2A_WIRE_TOKEN;
  } else {
    process.env.A2A_WIRE_TOKEN = restoreToken;
  }
});

describe("JSON-RPC A2A wire behavior", () => {
  it("sends v1 headers, auth, tenant, and bridge defaults through the SDK transport", async () => {
    restoreToken = process.env.A2A_WIRE_TOKEN;
    process.env.A2A_WIRE_TOKEN = "test-token";

    const captured: CapturedRequest[] = [];
    const server = createServer(async (request, response) => {
      const body = await readJson(request);
      captured.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body,
      });

      if (request.url === "/.well-known/agent-card.json") {
        writeJson(response, agentCard(serverBaseUrl(server)));
        return;
      }

      writeJson(response, {
        jsonrpc: "2.0",
        id: isRecord(body) ? body.id : undefined,
        result: {
          message: {
            messageId: "agent-message-1",
            role: "ROLE_AGENT",
            parts: [{ text: "ok" }],
          },
        },
      });
    });

    await listen(server);

    try {
      const config = bridgeConfig(`${serverBaseUrl(server)}/.well-known/agent-card.json`);
      const service = new A2ABridgeService(config, new SdkA2AClientFactory(config));

      const result = await service.sendMessage("demo", {
        tenant: "caller-tenant-must-not-win",
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "hello" }],
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toMatchObject({
        messageId: "agent-message-1",
        parts: [{ content: { $case: "text", value: "ok" } }],
      });

      const cardRequest = captured.find((entry) => entry.url === "/.well-known/agent-card.json");
      const sendRequest = captured.find((entry) => entry.url === "/a2a");

      expect(cardRequest?.headers["a2a-version"]).toBe("1.0");
      expect(cardRequest?.headers.authorization).toBe("Bearer test-token");
      expect(sendRequest?.headers["a2a-version"]).toBe("1.0");
      expect(sendRequest?.headers.authorization).toBe("Bearer test-token");
      expect(sendRequest?.body).toMatchObject({
        method: "SendMessage",
        params: {
          tenant: "tenant-a",
          message: {
            messageId: "user-message-1",
            role: "ROLE_USER",
            parts: [{ text: "hello" }],
          },
          configuration: {
            returnImmediately: true,
          },
        },
      });
    } finally {
      await close(server);
    }
  });

  it("preserves JSON-RPC A2A error codes and details", async () => {
    restoreToken = process.env.A2A_WIRE_TOKEN;
    process.env.A2A_WIRE_TOKEN = "test-token";

    const server = createServer(async (request, response) => {
      const body = await readJson(request);

      if (request.url === "/.well-known/agent-card.json") {
        writeJson(response, agentCard(serverBaseUrl(server)));
        return;
      }

      writeJson(response, {
        jsonrpc: "2.0",
        id: isRecord(body) ? body.id : undefined,
        error: {
          code: -32001,
          message: "Task task-missing was not found",
          data: {
            taskId: "task-missing",
            authorization: "secret-token",
          },
        },
      });
    });

    await listen(server);

    try {
      const config = bridgeConfig(`${serverBaseUrl(server)}/.well-known/agent-card.json`);
      const service = new A2ABridgeService(config, new SdkA2AClientFactory(config));

      const result = await service.sendMessage("demo", {
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "hello" }],
        },
      });

      expect(result).toMatchObject({
        error: {
          code: -32001,
          message: "Task task-missing was not found",
          category: "protocol",
          retriable: false,
          ambiguousOutcome: false,
          details: {
            transport: "jsonrpc",
            data: {
              taskId: "task-missing",
              authorization: "[REDACTED]",
            },
          },
        },
      });
    } finally {
      await close(server);
    }
  });

  it("streams JSON-RPC SSE events through local stream sessions", async () => {
    restoreToken = process.env.A2A_WIRE_TOKEN;
    process.env.A2A_WIRE_TOKEN = "test-token";

    const captured: CapturedRequest[] = [];
    const server = createServer(async (request, response) => {
      const body = await readJson(request);
      captured.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body,
      });

      if (request.url === "/.well-known/agent-card.json") {
        writeJson(response, agentCard(serverBaseUrl(server), { streaming: true }));
        return;
      }

      if (request.headers.accept === "text/event-stream") {
        writeSse(response, [
          {
            jsonrpc: "2.0",
            id: isRecord(body) ? body.id : undefined,
            result: streamMessage("agent-stream-1", "first"),
          },
          {
            jsonrpc: "2.0",
            id: isRecord(body) ? body.id : undefined,
            result: streamMessage("agent-stream-2", "second"),
          },
        ]);
        return;
      }

      writeJson(response, {
        jsonrpc: "2.0",
        id: isRecord(body) ? body.id : undefined,
        result: streamMessage("agent-message-1", "ok"),
      });
    });

    await listen(server);

    try {
      const config = bridgeConfig(`${serverBaseUrl(server)}/.well-known/agent-card.json`);
      const service = new A2ABridgeService(config, new SdkA2AClientFactory(config));

      const started = await service.sendStreamingMessage("demo", {
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "stream" }],
        },
      });

      expect(started.error).toBeUndefined();
      expect(started.result).toMatchObject({
        firstEvent: {
          payload: {
            $case: "message",
            value: {
              messageId: "agent-stream-1",
              parts: [{ content: { $case: "text", value: "first" } }],
            },
          },
        },
        cursor: 1,
      });

      const streamId = getStreamId(started.result);
      const next = await readUntilClosed(service, streamId, 1);

      expect(next).toMatchObject({
        events: [
          {
            payload: {
              $case: "message",
              value: {
                messageId: "agent-stream-2",
                parts: [{ content: { $case: "text", value: "second" } }],
              },
            },
          },
        ],
        closed: true,
      });

      const streamRequest = captured.find((entry) => entry.headers.accept === "text/event-stream");
      expect(streamRequest?.headers["a2a-version"]).toBe("1.0");
      expect(streamRequest?.headers.authorization).toBe("Bearer test-token");
      expect(streamRequest?.body).toMatchObject({
        method: "SendStreamingMessage",
        params: {
          tenant: "tenant-a",
          message: {
            messageId: "user-message-1",
            role: "ROLE_USER",
            parts: [{ text: "stream" }],
          },
          configuration: {
            returnImmediately: true,
          },
        },
      });
    } finally {
      await close(server);
    }
  });
});

function bridgeConfig(cardUrl: string): BridgeConfig {
  return {
    agents: {
      demo: {
        cardUrl,
        allowedBindings: ["JSONRPC"],
        authProfile: "wire-token",
        signaturePolicy: "ifPresent",
        directUrlPolicy: "disabled",
      },
    },
    authProfiles: {
      "wire-token": {
        type: "bearer-env",
        env: "A2A_WIRE_TOKEN",
      },
    },
    network: {
      allowPrivateAddresses: true,
      requireHttps: false,
      timeoutMs: 30_000,
      maxResponseBytes: 10 * 1024 * 1024,
    },
  };
}

function agentCard(baseUrl: string, capabilities: { streaming?: boolean } = {}) {
  return {
    name: "Wire Demo",
    description: "Wire test A2A agent",
    supportedInterfaces: [
      {
        url: `${baseUrl}/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
        tenant: "tenant-a",
      },
    ],
    provider: undefined,
    version: "1.0.0",
    capabilities: {
      streaming: capabilities.streaming ?? false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    skills: [],
    defaultInputModes: [],
    defaultOutputModes: [],
    signatures: [],
  };
}

function streamMessage(messageId: string, text: string) {
  return {
    message: {
      messageId,
      role: "ROLE_AGENT",
      parts: [{ text }],
    },
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function writeSse(response: ServerResponse, events: readonly unknown[]): void {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  events.forEach((event) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  response.end();
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function serverBaseUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStreamId(value: unknown): string {
  if (!isRecord(value) || typeof value.streamId !== "string") {
    throw new Error("expected streamId");
  }

  return value.streamId;
}

async function readUntilClosed(
  service: A2ABridgeService,
  streamId: string,
  cursor: number,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = service.streamNext(streamId, cursor, 10);
    if (isRecord(result.result) && result.result.closed === true) {
      return result.result;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const result = service.streamNext(streamId, cursor, 10);
  if (!isRecord(result.result)) {
    throw new Error("expected stream read result");
  }

  return result.result;
}
