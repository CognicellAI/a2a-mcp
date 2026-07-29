import { afterEach, describe, expect, it } from "vitest";
import { createHeaderProvider } from "../src/auth.js";
import type { AuthProfile } from "../src/config.js";

const ENV_NAMES = ["A2A_OAUTH_CLIENT_ID", "A2A_OAUTH_CLIENT_SECRET"] as const;

afterEach(() => {
  ENV_NAMES.forEach((name) => {
    delete process.env[name];
  });
});

describe("createHeaderProvider", () => {
  it("fetches and caches OAuth client credentials tokens with client_secret_basic", async () => {
    process.env.A2A_OAUTH_CLIENT_ID = "client-id";
    process.env.A2A_OAUTH_CLIENT_SECRET = "client-secret";

    const requests: CapturedTokenRequest[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push(captureTokenRequest(input, init));
      return jsonResponse({
        access_token: "machine-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    };

    const headers = createHeaderProvider(
      {
        type: "oauth-client-credentials-env",
        tokenUrl: "https://auth.example.com/oauth/token",
        clientIdEnv: "A2A_OAUTH_CLIENT_ID",
        clientSecretEnv: "A2A_OAUTH_CLIENT_SECRET",
        scope: "a2a:send a2a:read",
        audience: "https://agent.example.com",
        authMethod: "client_secret_basic",
        extraParams: {},
      },
      fetchImpl,
    );

    await expect(headers()).resolves.toEqual({ Authorization: "Bearer machine-token" });
    await expect(headers()).resolves.toEqual({ Authorization: "Bearer machine-token" });

    expect(requests).toEqual([
      {
        url: "https://auth.example.com/oauth/token",
        method: "POST",
        authorization: "Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ=",
        body: "grant_type=client_credentials&scope=a2a%3Asend+a2a%3Aread&audience=https%3A%2F%2Fagent.example.com",
      },
    ]);
  });

  it("supports OAuth client credentials with client_secret_post and extra token params", async () => {
    process.env.A2A_OAUTH_CLIENT_ID = "post-client";
    process.env.A2A_OAUTH_CLIENT_SECRET = "post-secret";

    const requests: CapturedTokenRequest[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push(captureTokenRequest(input, init));
      return jsonResponse({
        access_token: "post-token",
        token_type: "bearer",
        expires_in: 3600,
      });
    };

    const profile: AuthProfile = {
      type: "oauth-client-credentials-env",
      tokenUrl: "https://auth.example.com/token",
      clientIdEnv: "A2A_OAUTH_CLIENT_ID",
      clientSecretEnv: "A2A_OAUTH_CLIENT_SECRET",
      authMethod: "client_secret_post",
      extraParams: {
        resource: "https://agent.example.com",
      },
    };

    const headers = createHeaderProvider(profile, fetchImpl);

    await expect(headers()).resolves.toEqual({ Authorization: "Bearer post-token" });

    expect(requests).toEqual([
      {
        url: "https://auth.example.com/token",
        method: "POST",
        authorization: null,
        body: "grant_type=client_credentials&resource=https%3A%2F%2Fagent.example.com&client_id=post-client&client_secret=post-secret",
      },
    ]);
  });

  it("fails before token requests when OAuth client credential env vars are missing", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({ access_token: "unused", token_type: "Bearer" });
    };

    const headers = createHeaderProvider(
      {
        type: "oauth-client-credentials-env",
        tokenUrl: "https://auth.example.com/oauth/token",
        clientIdEnv: "A2A_OAUTH_CLIENT_ID",
        clientSecretEnv: "A2A_OAUTH_CLIENT_SECRET",
        authMethod: "client_secret_basic",
        extraParams: {},
      },
      fetchImpl,
    );

    await expect(headers()).rejects.toThrow("A2A_OAUTH_CLIENT_ID");
    expect(calls).toBe(0);
  });
});

interface CapturedTokenRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: string;
}

function captureTokenRequest(input: RequestInfo | URL, init: RequestInit | undefined): CapturedTokenRequest {
  const headers = new Headers(init?.headers);

  return {
    url: input.toString(),
    method: init?.method ?? "GET",
    authorization: headers.get("authorization"),
    body: stringifyBody(init?.body),
  };
}

function stringifyBody(body: BodyInit | null | undefined): string {
  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (typeof body === "string") {
    return body;
  }

  return "";
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
