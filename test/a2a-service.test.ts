import { describe, expect, it } from "vitest";
import { Role, type AgentCard } from "@a2a-js/sdk";
import { A2ABridgeService } from "../src/a2a-service.js";
import type { BridgeConfig } from "../src/config.js";

const config: BridgeConfig = {
  agents: {
    demo: {
      cardUrl: "https://agent.example.com/.well-known/agent-card.json",
      allowedBindings: ["JSONRPC"],
      signaturePolicy: "ifPresent",
      directUrlPolicy: "disabled",
    },
  },
  authProfiles: {},
  network: {
    allowPrivateAddresses: false,
    requireHttps: true,
    timeoutMs: 30_000,
    maxResponseBytes: 10 * 1024 * 1024,
  },
};

describe("A2ABridgeService", () => {
  it("lists configured agents without secrets", () => {
    const service = new A2ABridgeService(config, fakeFactory());

    expect(service.listAgents().result).toEqual([
      {
        alias: "demo",
        cardUrl: "https://agent.example.com/.well-known/agent-card.json",
        allowedBindings: ["JSONRPC"],
        authProfile: undefined,
        signaturePolicy: "ifPresent",
      },
    ]);
  });

  it("applies the nonblocking send default at the bridge layer", async () => {
    const calls: unknown[] = [];
    const service = new A2ABridgeService(config, fakeFactory(calls));

    const result = await service.sendMessage("demo", {
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [{ text: "hi" }],
      },
    });

    expect(result.error).toBeUndefined();
    expect(calls[0]).toMatchObject({
      configuration: {
        returnImmediately: true,
      },
    });
  });

  it("returns the first streaming event and does not cancel the remote task on local close", async () => {
    const service = new A2ABridgeService(config, fakeFactory());

    const started = await service.sendStreamingMessage("demo", {
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [{ text: "stream please" }],
      },
    });

    expect(started.error).toBeUndefined();
    expect(started.result).toMatchObject({
      cursor: 1,
      firstEvent: {
        payload: {
          $case: "message",
          value: {
            messageId: "stream-message-1",
            parts: [{ content: { $case: "text", value: "first" } }],
          },
        },
      },
      closed: false,
    });

    const streamId = getStreamId(started.result);
    expect(service.streamClose(streamId).error).toBeUndefined();
  });

  it("returns structured errors for unknown local stream sessions", () => {
    const service = new A2ABridgeService(config, fakeFactory());

    expect(service.streamNext("missing-stream")).toMatchObject({
      error: {
        message: "Unknown stream session: missing-stream",
      },
      _bridge: {
        operation: "streamNext",
      },
    });

    expect(service.streamClose("missing-stream")).toMatchObject({
      error: {
        message: "Unknown stream session: missing-stream",
      },
      _bridge: {
        operation: "streamClose",
      },
    });
  });
});

function fakeFactory(calls: unknown[] = []) {
  return {
    async create() {
      const agentCard: AgentCard = {
        name: "Demo",
        description: "Demo agent",
        supportedInterfaces: [
          {
            url: "https://agent.example.com/a2a",
            protocolBinding: "JSONRPC",
            protocolVersion: "1.0",
            tenant: "",
          },
        ],
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

      return {
        agentCard,
        client: {
          protocolVersion: "1.0",
          transport: { protocolName: "JSONRPC" },
          getAgentCard: async () => agentCard,
          getExtendedAgentCard: async () => agentCard,
          sendMessage: async (request: unknown) => {
            calls.push(request);
            return { messageId: "m2", role: "ROLE_AGENT", parts: [{ text: "ok" }] };
          },
          sendMessageStream: async function* () {
            yield {
              payload: {
                $case: "message",
                value: {
                  messageId: "stream-message-1",
                  role: Role.ROLE_AGENT,
                  parts: [{ content: { $case: "text", value: "first" } }],
                  contextId: "",
                  taskId: "",
                  metadata: undefined,
                  extensions: [],
                  referenceTaskIds: [],
                },
              },
            };
            yield {
              payload: {
                $case: "message",
                value: {
                  messageId: "stream-message-2",
                  role: Role.ROLE_AGENT,
                  parts: [{ content: { $case: "text", value: "second" } }],
                  contextId: "",
                  taskId: "",
                  metadata: undefined,
                  extensions: [],
                  referenceTaskIds: [],
                },
              },
            };
          },
          getTask: async () => ({ id: "task-1" }),
          listTasks: async () => ({ tasks: [] }),
          cancelTask: async () => ({ id: "task-1" }),
          resubscribeTask: async function* () {},
          createTaskPushNotificationConfig: async (request: unknown) => request,
          getTaskPushNotificationConfig: async () => ({ id: "push-1" }),
          listTaskPushNotificationConfig: async () => ({ configs: [] }),
          deleteTaskPushNotificationConfig: async () => undefined,
        },
      };
    },
  };
}

function getStreamId(value: unknown): string {
  if (!value || typeof value !== "object" || !("streamId" in value)) {
    throw new Error("expected stream result");
  }

  const streamId = value.streamId;
  if (typeof streamId !== "string") {
    throw new Error("expected string stream id");
  }

  return streamId;
}
