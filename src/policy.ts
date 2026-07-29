import { isIP } from "node:net";
import type { BridgeConfig } from "./config.js";
import { BridgeError } from "./errors.js";

const PRIVATE_V4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

export function assertAllowedUrl(rawUrl: string, options: {
  requireHttps: boolean;
  allowPrivateAddresses: boolean;
}): URL {
  const url = new URL(rawUrl);

  if (options.requireHttps && url.protocol !== "https:") {
    throw new BridgeError({
      message: `A2A agent URL must use https: ${rawUrl}`,
      category: "policy",
    });
  }

  if (!options.allowPrivateAddresses && isPrivateHost(url.hostname)) {
    throw new BridgeError({
      message: `A2A agent URL targets a private or local host: ${rawUrl}`,
      category: "policy",
    });
  }

  return url;
}

export function createPolicyFetch(
  fetchImpl: typeof fetch,
  network: BridgeConfig["network"],
): typeof fetch {
  return async (input, init) => {
    const url = urlFromRequest(input);
    assertAllowedUrl(url, network);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new BridgeError({
        message: `A2A request timed out after ${network.timeoutMs}ms: ${url}`,
        category: "transport",
        retriable: true,
        ambiguousOutcome: true,
      }));
    }, network.timeoutMs);

    const forwardAbort = () => {
      controller.abort(init?.signal?.reason);
    };

    if (init?.signal?.aborted) {
      forwardAbort();
    } else {
      init?.signal?.addEventListener("abort", forwardAbort, { once: true });
    }

    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });

      if (isStreamingResponse(response, init)) {
        clearTimeout(timeout);
        return response;
      }

      const body = await readLimitedBody(response, network.maxResponseBytes, url);
      clearTimeout(timeout);

      return new Response(body === null ? null : Buffer.from(body), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (controller.signal.reason instanceof BridgeError) {
        throw controller.signal.reason;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", forwardAbort);
    }
  };
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (isIP(normalized) === 4) {
    return PRIVATE_V4_RANGES.some((range) => range.test(normalized));
  }

  return false;
}

function urlFromRequest(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function isStreamingResponse(response: Response, init: RequestInit | undefined): boolean {
  const acceptHeader = new Headers(init?.headers).get("accept") ?? "";
  const contentType = response.headers.get("content-type") ?? "";

  return (
    acceptHeader.toLowerCase().includes("text/event-stream") ||
    contentType.toLowerCase().startsWith("text/event-stream")
  );
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
  url: string,
): Promise<Uint8Array | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new BridgeError({
      message: `A2A response exceeded maxResponseBytes (${maxBytes}): ${url}`,
      category: "transport",
    });
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const read = await reader.read();
      if (read.done) {
        break;
      }

      total += read.value.byteLength;
      if (total > maxBytes) {
        throw new BridgeError({
          message: `A2A response exceeded maxResponseBytes (${maxBytes}): ${url}`,
          category: "transport",
        });
      }

      chunks.push(read.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return body;
}
