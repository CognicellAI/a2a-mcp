import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { A2ABridgeService, BridgeResult } from "./a2a-service.js";
import {
  CancelTaskRequestSchema,
  GetTaskRequestSchema,
  ListTaskPushNotificationConfigsRequestSchema,
  ListTasksRequestSchema,
  PushNotificationConfigIdRequestSchema,
  SendMessageRequestSchema,
  SubscribeToTaskRequestSchema,
  TaskPushNotificationConfigSchema,
} from "./a2a-json.js";

const StreamNextInputShape = {
  streamId: z.string().min(1),
  cursor: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(100).optional(),
};

const StreamCloseInputShape = {
  streamId: z.string().min(1),
};

export function createMcpServer(service: A2ABridgeService): McpServer {
  const server = new McpServer({
    name: "a2a-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "a2a_list_agents",
    {
      title: "List configured A2A agents",
      description: "Lists locally configured A2A agent aliases and non-secret settings.",
      inputSchema: {},
    },
    async () => asMcpResult(service.listAgents()),
  );

  registerProtocolTool(
    server,
    "a2a_get_agent_card",
    "Fetch an A2A Agent Card.",
    z.record(z.unknown()).default({}),
    (args) => service.getAgentCard(args.agent),
  );

  registerProtocolTool(
    server,
    "a2a_get_extended_agent_card",
    "Fetch an authenticated extended A2A Agent Card when supported.",
    z.record(z.unknown()).default({}),
    (args) => service.getExtendedAgentCard(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_send_message",
    "Send an A2A message.",
    SendMessageRequestSchema,
    (args) => service.sendMessage(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_send_streaming_message",
    "Send an A2A streaming message and create a local stream session.",
    SendMessageRequestSchema,
    (args) => service.sendStreamingMessage(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_get_task",
    "Get an A2A task.",
    GetTaskRequestSchema,
    (args) => service.getTask(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_list_tasks",
    "List A2A tasks.",
    ListTasksRequestSchema.default({}),
    (args) => service.listTasks(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_cancel_task",
    "Cancel an A2A task.",
    CancelTaskRequestSchema,
    (args) => service.cancelTask(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_subscribe_to_task",
    "Subscribe to an A2A task and create a local stream session.",
    SubscribeToTaskRequestSchema,
    (args) => service.subscribeToTask(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_create_push_notification_config",
    "Create an A2A task push notification config.",
    TaskPushNotificationConfigSchema,
    (args) => service.createPushNotificationConfig(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_get_push_notification_config",
    "Get an A2A task push notification config.",
    PushNotificationConfigIdRequestSchema,
    (args) => service.getPushNotificationConfig(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_list_push_notification_configs",
    "List A2A task push notification configs.",
    ListTaskPushNotificationConfigsRequestSchema,
    (args) => service.listPushNotificationConfigs(args.agent, args.request),
  );

  registerProtocolTool(
    server,
    "a2a_delete_push_notification_config",
    "Delete an A2A task push notification config.",
    PushNotificationConfigIdRequestSchema,
    (args) => service.deletePushNotificationConfig(args.agent, args.request),
  );

  server.registerTool(
    "a2a_stream_next",
    {
      title: "Read A2A stream events",
      description: "Reads ordered events from a local A2A stream session.",
      inputSchema: StreamNextInputShape,
    },
    async (args) => asMcpResult(service.streamNext(args.streamId, args.cursor, args.limit)),
  );

  server.registerTool(
    "a2a_stream_close",
    {
      title: "Close A2A stream session",
      description: "Closes the local stream session without canceling the remote A2A task.",
      inputSchema: StreamCloseInputShape,
    },
    async (args) => asMcpResult(service.streamClose(args.streamId)),
  );

  return server;
}

function registerProtocolTool(
  server: McpServer,
  name: string,
  description: string,
  requestSchema: z.ZodTypeAny,
  handler: (args: { agent: string; request: unknown }) => Promise<BridgeResult>,
): void {
  server.registerTool(
    name,
    {
      title: name,
      description,
      inputSchema: {
        agent: z.string().min(1),
        request: requestSchema,
      },
    },
    async (args) => asMcpResult(await handler(args)),
  );
}

function asMcpResult(result: BridgeResult) {
  const text = result.error
    ? result.error.message
    : JSON.stringify(result.result ?? {}, null, 2);

  return {
    isError: Boolean(result.error),
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}
