export type BridgeErrorCategory =
  | "configuration"
  | "policy"
  | "protocol"
  | "transport"
  | "unknown";

export class BridgeError extends Error {
  readonly code: number | undefined;
  readonly category: BridgeErrorCategory;
  readonly details: unknown | undefined;
  readonly retriable: boolean;
  readonly ambiguousOutcome: boolean;

  constructor(args: {
    message: string;
    category: BridgeErrorCategory;
    code?: number;
    details?: unknown;
    retriable?: boolean;
    ambiguousOutcome?: boolean;
  }) {
    super(args.message);
    this.name = "BridgeError";
    this.category = args.category;
    this.code = args.code;
    this.details = args.details;
    this.retriable = args.retriable ?? false;
    this.ambiguousOutcome = args.ambiguousOutcome ?? false;
  }
}

const A2A_ERROR_CODE_BY_NAME: Readonly<Record<string, number>> = {
  TaskNotFoundError: -32001,
  TaskNotCancelableError: -32002,
  PushNotificationNotSupportedError: -32003,
  UnsupportedOperationError: -32004,
  ContentTypeNotSupportedError: -32005,
  InvalidAgentResponseError: -32006,
  ExtendedAgentCardNotConfiguredError: -32007,
  ExtensionSupportRequiredError: -32008,
  VersionNotSupportedError: -32009,
  RequestMalformedError: -32602,
  JsonRpcTaskNotFoundError: -32001,
  JsonRpcTaskNotCancelableError: -32002,
  JsonRpcPushNotificationNotSupportedError: -32003,
  JsonRpcUnsupportedOperationError: -32004,
  JsonRpcContentTypeNotSupportedError: -32005,
  JsonRpcInvalidAgentResponseError: -32006,
  JsonRpcExtendedAgentCardNotConfiguredError: -32007,
  JsonRpcExtensionSupportRequiredError: -32008,
  JsonRpcVersionNotSupportedError: -32009,
  RestTaskNotFoundError: -32001,
  RestTaskNotCancelableError: -32002,
  RestPushNotificationNotSupportedError: -32003,
  RestUnsupportedOperationError: -32004,
  RestContentTypeNotSupportedError: -32005,
  RestInvalidAgentResponseError: -32006,
  RestExtendedAgentCardNotConfiguredError: -32007,
  RestExtensionSupportRequiredError: -32008,
  RestVersionNotSupportedError: -32009,
};

export function normalizeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) {
    return error;
  }

  if (isJsonRpcA2AErrorShape(error)) {
    return new BridgeError({
      message: error.message,
      category: "protocol",
      code: error.envelopeCode,
      details: redactSecrets({
        transport: error.transport,
        data: error.data,
      }),
    });
  }

  if (isRestA2AErrorShape(error)) {
    const semanticCode = A2A_ERROR_CODE_BY_NAME[error.name];
    return new BridgeError({
      message: error.message,
      category: "protocol",
      details: redactSecrets({
        transport: error.transport,
        statusCode: error.statusCode,
        headers: error.headers,
        metadata: error.metadata,
      }),
      ...(semanticCode === undefined ? {} : { code: semanticCode }),
    });
  }

  if (error instanceof Error) {
    const maybeCode = "code" in error && typeof error.code === "number" ? error.code : undefined;
    return new BridgeError({
      message: error.message,
      category: maybeCode ? "protocol" : "unknown",
      details: redactSecrets(error),
      ...(maybeCode === undefined ? {} : { code: maybeCode }),
    });
  }

  return new BridgeError({
    message: "Unknown bridge error",
    category: "unknown",
    details: redactSecrets(error),
  });
}

interface JsonRpcA2AErrorShape {
  readonly name: string;
  readonly message: string;
  readonly transport: "jsonrpc";
  readonly envelopeCode: number;
  readonly data?: unknown;
}

interface RestA2AErrorShape {
  readonly name: string;
  readonly message: string;
  readonly transport: "rest";
  readonly statusCode: number;
  readonly headers?: unknown;
  readonly metadata?: unknown;
}

function isJsonRpcA2AErrorShape(error: unknown): error is JsonRpcA2AErrorShape {
  return (
    isRecord(error) &&
    error.transport === "jsonrpc" &&
    typeof error.message === "string" &&
    typeof error.name === "string" &&
    typeof error.envelopeCode === "number"
  );
}

function isRestA2AErrorShape(error: unknown): error is RestA2AErrorShape {
  return (
    isRecord(error) &&
    error.transport === "rest" &&
    typeof error.message === "string" &&
    typeof error.name === "string" &&
    typeof error.statusCode === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/authorization|cookie|token|secret|password|private|credentials/i.test(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, redactSecrets(entry)];
    }),
  );
}
