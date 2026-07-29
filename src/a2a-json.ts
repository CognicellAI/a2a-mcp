import * as A2A from "@a2a-js/sdk";
import { z } from "zod";
import { BridgeError } from "./errors.js";

const MetadataSchema = z.record(z.unknown());
const ObjectSchema = z.record(z.unknown());

export const SendMessageRequestSchema = z
  .object({
    tenant: z.string().optional(),
    message: ObjectSchema,
    configuration: ObjectSchema.optional(),
    metadata: MetadataSchema.optional(),
  })
  .passthrough();

const TaskIdRequestSchema = z
  .object({
    tenant: z.string().optional(),
    id: z.string().min(1),
    metadata: MetadataSchema.optional(),
  })
  .passthrough();

export const CancelTaskRequestSchema = TaskIdRequestSchema;

export const GetTaskRequestSchema = TaskIdRequestSchema.extend({
  historyLength: z.number().int().nonnegative().optional(),
});

export const ListTasksRequestSchema = z
  .object({
    tenant: z.string().optional(),
  })
  .passthrough();

export const SubscribeToTaskRequestSchema = z
  .object({
    tenant: z.string().optional(),
    id: z.string().min(1),
  })
  .passthrough();

export const TaskPushNotificationConfigSchema = z
  .object({
    tenant: z.string().optional(),
    id: z.string().min(1),
    taskId: z.string().min(1),
  })
  .passthrough();

export const PushNotificationConfigIdRequestSchema = z
  .object({
    tenant: z.string().optional(),
    taskId: z.string().min(1),
    id: z.string().min(1),
  })
  .passthrough();

export const ListTaskPushNotificationConfigsRequestSchema = z
  .object({
    tenant: z.string().optional(),
    taskId: z.string().min(1),
  })
  .passthrough();

export function toSendMessageRequest(request: unknown): A2A.SendMessageRequest {
  const value = parseRequest(SendMessageRequestSchema, request, "SendMessageRequest");
  const configuration = { ...(value.configuration ?? {}) };

  if (!("returnImmediately" in configuration)) {
    configuration.returnImmediately = true;
  }

  return A2A.SendMessageRequest.fromJSON({
    ...value,
    configuration,
  });
}

export function toGetTaskRequest(request: unknown): A2A.GetTaskRequest {
  return A2A.GetTaskRequest.fromJSON(parseRequest(GetTaskRequestSchema, request, "GetTaskRequest"));
}

export function toListTasksRequest(request: unknown): A2A.ListTasksRequest {
  return A2A.ListTasksRequest.fromJSON(
    parseRequest(ListTasksRequestSchema, request ?? {}, "ListTasksRequest"),
  );
}

export function toCancelTaskRequest(request: unknown): A2A.CancelTaskRequest {
  return A2A.CancelTaskRequest.fromJSON(
    parseRequest(TaskIdRequestSchema, request, "CancelTaskRequest"),
  );
}

export function toSubscribeToTaskRequest(request: unknown): A2A.SubscribeToTaskRequest {
  return A2A.SubscribeToTaskRequest.fromJSON(
    parseRequest(SubscribeToTaskRequestSchema, request, "SubscribeToTaskRequest"),
  );
}

export function toTaskPushNotificationConfig(request: unknown): A2A.TaskPushNotificationConfig {
  return A2A.TaskPushNotificationConfig.fromJSON(
    parseRequest(TaskPushNotificationConfigSchema, request, "TaskPushNotificationConfig"),
  );
}

export function toGetTaskPushNotificationConfigRequest(
  request: unknown,
): A2A.GetTaskPushNotificationConfigRequest {
  return A2A.GetTaskPushNotificationConfigRequest.fromJSON(
    parseRequest(
      PushNotificationConfigIdRequestSchema,
      request,
      "GetTaskPushNotificationConfigRequest",
    ),
  );
}

export function toListTaskPushNotificationConfigsRequest(
  request: unknown,
): A2A.ListTaskPushNotificationConfigsRequest {
  return A2A.ListTaskPushNotificationConfigsRequest.fromJSON(
    parseRequest(
      ListTaskPushNotificationConfigsRequestSchema,
      request,
      "ListTaskPushNotificationConfigsRequest",
    ),
  );
}

export function toDeleteTaskPushNotificationConfigRequest(
  request: unknown,
): A2A.DeleteTaskPushNotificationConfigRequest {
  return A2A.DeleteTaskPushNotificationConfigRequest.fromJSON(
    parseRequest(
      PushNotificationConfigIdRequestSchema,
      request,
      "DeleteTaskPushNotificationConfigRequest",
    ),
  );
}

function parseRequest<T extends z.ZodTypeAny>(
  schema: T,
  request: unknown,
  requestName: string,
): z.output<T> {
  const parsed = schema.safeParse(request);
  if (parsed.success) {
    return parsed.data;
  }

  throw new BridgeError({
    message: `Invalid A2A ${requestName}`,
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
