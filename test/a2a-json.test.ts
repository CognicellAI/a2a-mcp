import { describe, expect, it } from "vitest";
import {
  toGetTaskRequest,
  toSendMessageRequest,
  toTaskPushNotificationConfig,
} from "../src/a2a-json.js";

describe("A2A request adapter", () => {
  it("applies the bridge-owned nonblocking send default", () => {
    const request = toSendMessageRequest({
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [{ text: "hello" }],
      },
    });

    expect(request.configuration?.returnImmediately).toBe(true);
    expect(request.message?.messageId).toBe("m1");
  });

  it("leaves detailed A2A message conversion to the SDK", () => {
    const request = toSendMessageRequest({
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [{ text: "hello" }],
      },
    });

    expect(request.message?.parts[0]?.content).toEqual({
      $case: "text",
      value: "hello",
    });
  });

  it("rejects requests missing bridge-required wrapper fields", () => {
    expect(() => toSendMessageRequest({})).toThrow("Invalid A2A SendMessageRequest");
    expect(() => toGetTaskRequest({ id: "" })).toThrow("Invalid A2A GetTaskRequest");
    expect(() =>
      toTaskPushNotificationConfig({
        taskId: "task-1",
      }),
    ).toThrow("Invalid A2A TaskPushNotificationConfig");
  });
});
