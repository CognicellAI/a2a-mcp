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
    delete process.env.A2A_REST_WIRE_TOKEN;
  } else {
    process.env.A2A_REST_WIRE_TOKEN = restoreToken;
  }
});

describe("HTTP+JSON A2A wire behavior", () => {
  it("sends v1 headers, auth, tenant path, and bridge defaults through the SDK transport", async () => {
    restoreToken = process.env.A2A_REST_WIRE_TOKEN;
    process.env.A2A_REST_WIRE_TOKEN = "rest-test-token";

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
        message: {
          messageId: "agent-message-1",
          role: "ROLE_AGENT",
          parts: [{ text: "ok" }],
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
          parts: [{ text: "hello over rest" }],
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toMatchObject({
        messageId: "agent-message-1",
        parts: [{ content: { $case: "text", value: "ok" } }],
      });

      const cardRequest = captured.find((entry) => entry.url === "/.well-known/agent-card.json");
      const sendRequest = captured.find((entry) => entry.url === "/tenant-a/message:send");

      expect(cardRequest?.headers["a2a-version"]).toBe("1.0");
      expect(cardRequest?.headers.authorization).toBe("Bearer rest-test-token");
      expect(sendRequest?.method).toBe("POST");
      expect(sendRequest?.headers["a2a-version"]).toBe("1.0");
      expect(sendRequest?.headers.authorization).toBe("Bearer rest-test-token");
      expect(sendRequest?.body).toMatchObject({
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "hello over rest" }],
        },
        configuration: {
          returnImmediately: true,
        },
      });
    } finally {
      await close(server);
    }
  });

  it("preserves HTTP+JSON A2A semantic error codes and transport details", async () => {
    restoreToken = process.env.A2A_REST_WIRE_TOKEN;
    process.env.A2A_REST_WIRE_TOKEN = "rest-test-token";

    const server = createServer(async (request, response) => {
      await readJson(request);

      if (request.url === "/.well-known/agent-card.json") {
        writeJson(response, agentCard(serverBaseUrl(server)));
        return;
      }

      writeJson(
        response,
        {
          error: {
            code: 404,
            status: "NOT_FOUND",
            message: "Task task-missing was not found",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                reason: "TASK_NOT_FOUND",
                domain: "a2a-protocol.org",
                metadata: {
                  taskId: "task-missing",
                  authorization: "secret-token",
                },
              },
            ],
          },
        },
        404,
      );
    });

    await listen(server);

    try {
      const config = bridgeConfig(`${serverBaseUrl(server)}/.well-known/agent-card.json`);
      const service = new A2ABridgeService(config, new SdkA2AClientFactory(config));

      const result = await service.sendMessage("demo", {
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "hello over rest" }],
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
            transport: "rest",
            statusCode: 404,
          },
        },
      });
    } finally {
      await close(server);
    }
  });

  it("streams HTTP+JSON SSE events through local stream sessions", async () => {
    restoreToken = process.env.A2A_REST_WIRE_TOKEN;
    process.env.A2A_REST_WIRE_TOKEN = "rest-test-token";

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
          streamMessage("rest-stream-1", "first"),
          streamMessage("rest-stream-2", "second"),
        ]);
        return;
      }

      writeJson(response, streamMessage("rest-message-1", "ok"));
    });

    await listen(server);

    try {
      const config = bridgeConfig(`${serverBaseUrl(server)}/.well-known/agent-card.json`);
      const service = new A2ABridgeService(config, new SdkA2AClientFactory(config));

      const started = await service.sendStreamingMessage("demo", {
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "stream over rest" }],
        },
      });

      expect(started.error).toBeUndefined();
      expect(started.result).toMatchObject({
        firstEvent: {
          payload: {
            $case: "message",
            value: {
              messageId: "rest-stream-1",
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
                messageId: "rest-stream-2",
                parts: [{ content: { $case: "text", value: "second" } }],
              },
            },
          },
        ],
        closed: true,
      });

      const streamRequest = captured.find((entry) => entry.headers.accept === "text/event-stream");
      expect(streamRequest?.url).toBe("/tenant-a/message:stream");
      expect(streamRequest?.method).toBe("POST");
      expect(streamRequest?.headers["a2a-version"]).toBe("1.0");
      expect(streamRequest?.headers.authorization).toBe("Bearer rest-test-token");
      expect(streamRequest?.body).toMatchObject({
        message: {
          messageId: "user-message-1",
          role: "ROLE_USER",
          parts: [{ text: "stream over rest" }],
        },
        configuration: {
          returnImmediately: true,
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
        allowedBindings: ["HTTP+JSON"],
        authProfile: "rest-wire-token",
        signaturePolicy: "ifPresent",
        directUrlPolicy: "disabled",
      },
    },
    authProfiles: {
      "rest-wire-token": {
        type: "bearer-env",
        env: "A2A_REST_WIRE_TOKEN",
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
    name: "REST Wire Demo",
    description: "Wire test A2A HTTP+JSON agent",
    supportedInterfaces: [
      {
        url: baseUrl,
        protocolBinding: "HTTP+JSON",
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

function writeJson(response: ServerResponse, body: unknown, statusCode = 200): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
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
