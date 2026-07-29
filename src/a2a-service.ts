import type {
  AgentCard,
  CancelTaskRequest,
  DeleteTaskPushNotificationConfigRequest,
  GetTaskPushNotificationConfigRequest,
  GetTaskRequest,
  ListTaskPushNotificationConfigsRequest,
  ListTasksRequest,
  SendMessageRequest,
  SubscribeToTaskRequest,
  TaskPushNotificationConfig,
} from "@a2a-js/sdk";
import {
  toCancelTaskRequest,
  toDeleteTaskPushNotificationConfigRequest,
  toGetTaskPushNotificationConfigRequest,
  toGetTaskRequest,
  toListTaskPushNotificationConfigsRequest,
  toListTasksRequest,
  toSendMessageRequest,
  toSubscribeToTaskRequest,
  toTaskPushNotificationConfig,
} from "./a2a-json.js";
import type { BridgeConfig } from "./config.js";
import { BridgeError, normalizeError } from "./errors.js";
import { StreamSessionManager } from "./stream-session.js";

export interface A2AClientLike {
  readonly protocolVersion: string;
  readonly transport: {
    readonly protocolName: string;
  };
  getAgentCard(): Promise<AgentCard>;
  sendMessage(request: SendMessageRequest): Promise<unknown>;
  sendMessageStream(request: SendMessageRequest): AsyncGenerator<unknown, void, undefined>;
  getTask(request: GetTaskRequest): Promise<unknown>;
  listTasks(request: ListTasksRequest): Promise<unknown>;
  cancelTask(request: CancelTaskRequest): Promise<unknown>;
  resubscribeTask(request: SubscribeToTaskRequest): AsyncGenerator<unknown, void, undefined>;
  createTaskPushNotificationConfig(request: TaskPushNotificationConfig): Promise<unknown>;
  getTaskPushNotificationConfig(request: GetTaskPushNotificationConfigRequest): Promise<unknown>;
  listTaskPushNotificationConfig(request: ListTaskPushNotificationConfigsRequest): Promise<unknown>;
  deleteTaskPushNotificationConfig(request: DeleteTaskPushNotificationConfigRequest): Promise<void>;
}

export interface A2AClientBundleLike {
  readonly client: A2AClientLike;
  readonly agentCard: AgentCard;
}

export interface A2AClientBundleProvider {
  create(agent: string): Promise<A2AClientBundleLike>;
}

export interface BridgeResult {
  readonly result?: unknown;
  readonly error?: {
    readonly message: string;
    readonly code?: number | undefined;
    readonly category: string;
    readonly retriable: boolean;
    readonly ambiguousOutcome: boolean;
    readonly details?: unknown | undefined;
  };
  readonly _bridge: Record<string, unknown>;
}

export class A2ABridgeService {
  constructor(
    private readonly config: BridgeConfig,
    private readonly clientFactory: A2AClientBundleProvider,
    private readonly streams = new StreamSessionManager(),
  ) {}

  listAgents(): BridgeResult {
    return this.ok({
      result: Object.entries(this.config.agents).map(([alias, agent]) => ({
        alias,
        cardUrl: agent.cardUrl,
        allowedBindings: agent.allowedBindings,
        authProfile: agent.authProfile,
        signaturePolicy: agent.signaturePolicy,
      })),
      bridge: { operation: "listAgents" },
    });
  }

  async getAgentCard(agent: string): Promise<BridgeResult> {
    return this.run(agent, "getAgentCard", async (bundle) => bundle.agentCard);
  }

  async getExtendedAgentCard(agent: string, _request: unknown): Promise<BridgeResult> {
    return this.run(agent, "getExtendedAgentCard", async (bundle) => {
      if (bundle.agentCard.capabilities?.extendedAgentCard !== true) {
        throw new BridgeError({
          message: "Agent Card does not advertise extendedAgentCard support",
          category: "protocol",
          code: -32007,
        });
      }

      return bundle.client.getAgentCard();
    });
  }

  async sendMessage(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "sendMessage", async (bundle) => {
      return bundle.client.sendMessage(useSelectedInterfaceTenant(toSendMessageRequest(request)));
    });
  }

  async sendStreamingMessage(agent: string, request: unknown): Promise<BridgeResult> {
    return this.startStream(agent, "send", async (bundle) => {
      if (bundle.agentCard.capabilities?.streaming !== true) {
        throw new BridgeError({
          message: "Agent Card does not advertise streaming support",
          category: "protocol",
          code: -32004,
        });
      }

      return bundle.client.sendMessageStream(
        useSelectedInterfaceTenant(toSendMessageRequest(request)),
      );
    });
  }

  async subscribeToTask(agent: string, request: unknown): Promise<BridgeResult> {
    return this.startStream(agent, "subscribe", async (bundle) => {
      if (bundle.agentCard.capabilities?.streaming !== true) {
        throw new BridgeError({
          message: "Agent Card does not advertise streaming support",
          category: "protocol",
          code: -32004,
        });
      }

      return bundle.client.resubscribeTask(
        useSelectedInterfaceTenant(toSubscribeToTaskRequest(request)),
      );
    });
  }

  async getTask(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "getTask", async (bundle) => {
      return bundle.client.getTask(useSelectedInterfaceTenant(toGetTaskRequest(request)));
    });
  }

  async listTasks(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "listTasks", async (bundle) => {
      return bundle.client.listTasks(useSelectedInterfaceTenant(toListTasksRequest(request)));
    });
  }

  async cancelTask(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "cancelTask", async (bundle) => {
      return bundle.client.cancelTask(useSelectedInterfaceTenant(toCancelTaskRequest(request)));
    });
  }

  async createPushNotificationConfig(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "createPushNotificationConfig", async (bundle) => {
      this.assertPushNotifications(bundle.agentCard);
      return bundle.client.createTaskPushNotificationConfig(
        useSelectedInterfaceTenant(toTaskPushNotificationConfig(request)),
      );
    });
  }

  async getPushNotificationConfig(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "getPushNotificationConfig", async (bundle) => {
      this.assertPushNotifications(bundle.agentCard);
      return bundle.client.getTaskPushNotificationConfig(
        useSelectedInterfaceTenant(toGetTaskPushNotificationConfigRequest(request)),
      );
    });
  }

  async listPushNotificationConfigs(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "listPushNotificationConfigs", async (bundle) => {
      this.assertPushNotifications(bundle.agentCard);
      return bundle.client.listTaskPushNotificationConfig(
        useSelectedInterfaceTenant(toListTaskPushNotificationConfigsRequest(request)),
      );
    });
  }

  async deletePushNotificationConfig(agent: string, request: unknown): Promise<BridgeResult> {
    return this.run(agent, "deletePushNotificationConfig", async (bundle) => {
      this.assertPushNotifications(bundle.agentCard);
      await bundle.client.deleteTaskPushNotificationConfig(
        useSelectedInterfaceTenant(toDeleteTaskPushNotificationConfigRequest(request)),
      );
      return { deleted: true };
    });
  }

  streamNext(streamId: string, cursor?: number, limit?: number): BridgeResult {
    try {
      const read = this.streams.read(streamId, cursor, limit);
      return this.ok({
        result: read,
        bridge: { operation: "streamNext", streamId },
      });
    } catch (error) {
      return this.fail(undefined, "streamNext", error);
    }
  }

  streamClose(streamId: string): BridgeResult {
    try {
      this.streams.close(streamId);
      return this.ok({
        result: { closed: true },
        bridge: { operation: "streamClose", streamId },
      });
    } catch (error) {
      return this.fail(undefined, "streamClose", error);
    }
  }

  private async run(
    agent: string,
    operation: string,
    action: (bundle: A2AClientBundleLike) => Promise<unknown>,
  ): Promise<BridgeResult> {
    try {
      const bundle = await this.clientFactory.create(agent);
      const result = await action(bundle);

      return this.ok({
        result,
        bridge: {
          agent,
          operation,
          protocolVersion: bundle.client.protocolVersion,
          selectedBinding: bundle.client.transport.protocolName,
        },
      });
    } catch (error) {
      return this.fail(agent, operation, error);
    }
  }

  private async startStream(
    agent: string,
    operation: "send" | "subscribe",
    createGenerator: (
      bundle: A2AClientBundleLike,
    ) => Promise<AsyncGenerator<unknown, void, undefined>>,
  ): Promise<BridgeResult> {
    try {
      const bundle = await this.clientFactory.create(agent);
      const session = this.streams.create({ agent, operation });
      const generator = await createGenerator(bundle);
      const first = await generator.next();

      if (first.done === true) {
        this.streams.finish(session.id);
      } else {
        this.streams.append(session.id, first.value);
        void this.pump(session.id, generator);
      }

      const initialRead = this.streams.read(session.id, 0, 1);

      return this.ok({
        result: {
          streamId: session.id,
          firstEvent: initialRead.events[0],
          cursor: initialRead.nextCursor,
          createdAt: session.createdAt,
          closed: initialRead.closed,
        },
        bridge: {
          agent,
          operation,
          protocolVersion: bundle.client.protocolVersion,
          selectedBinding: bundle.client.transport.protocolName,
        },
      });
    } catch (error) {
      return this.fail(agent, operation, error);
    }
  }

  private async pump(streamId: string, generator: AsyncGenerator<unknown, void, undefined>): Promise<void> {
    try {
      for await (const event of generator) {
        this.streams.append(streamId, event);
      }
      this.streams.finish(streamId);
    } catch (error) {
      this.streams.fail(streamId, normalizeError(error));
    }
  }

  private assertPushNotifications(agentCard: AgentCard): void {
    if (agentCard.capabilities?.pushNotifications !== true) {
      throw new BridgeError({
        message: "Agent Card does not advertise pushNotifications support",
        category: "protocol",
        code: -32003,
      });
    }
  }

  private ok(args: { result: unknown; bridge: Record<string, unknown> }): BridgeResult {
    return {
      result: args.result,
      _bridge: {
        ambiguousOutcome: false,
        ...args.bridge,
      },
    };
  }

  private fail(agent: string | undefined, operation: string, error: unknown): BridgeResult {
    const bridgeError = normalizeError(error);
    const errorResult: NonNullable<BridgeResult["error"]> = {
      message: bridgeError.message,
      category: bridgeError.category,
      retriable: bridgeError.retriable,
      ambiguousOutcome: bridgeError.ambiguousOutcome,
      ...(bridgeError.code === undefined ? {} : { code: bridgeError.code }),
      ...(bridgeError.details === undefined ? {} : { details: bridgeError.details }),
    };

    return {
      error: {
        ...errorResult,
      },
      _bridge: {
        agent,
        operation,
        ambiguousOutcome: bridgeError.ambiguousOutcome,
      },
    };
  }
}

function useSelectedInterfaceTenant<T extends { tenant?: string }>(request: T): T & { tenant: string } {
  return {
    ...request,
    tenant: "",
  };
}
