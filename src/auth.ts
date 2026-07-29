import type { AuthProfile } from "./config.js";
import { BridgeError } from "./errors.js";

export type HeaderProvider = () => Promise<Record<string, string>>;

interface CachedOAuthToken {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

const OAUTH_EXPIRY_SKEW_MS = 60_000;

export function createHeaderProvider(profile?: AuthProfile, fetchImpl: typeof fetch = fetch): HeaderProvider {
  if (!profile || profile.type === "none") {
    return async () => ({});
  }

  if (profile.type === "bearer-env") {
    return async () => {
      const token = process.env[profile.env];
      if (!token) {
        throw new BridgeError({
          message: `Auth profile requires environment variable ${profile.env}`,
          category: "configuration",
        });
      }

      return { Authorization: `Bearer ${token}` };
    };
  }

  if (profile.type === "api-key-env") {
    return async () => {
      const value = process.env[profile.env];
      if (!value) {
        throw new BridgeError({
          message: `Auth profile requires environment variable ${profile.env}`,
          category: "configuration",
        });
      }

      return { [profile.header]: value };
    };
  }

  return createOAuthClientCredentialsHeaderProvider(profile, fetchImpl);
}

export function withStaticHeaders(fetchImpl: typeof fetch, headers: HeaderProvider): typeof fetch {
  return async (input, init) => {
    const nextHeaders = new Headers(init?.headers);
    const authHeaders = await headers();

    Object.entries(authHeaders).forEach(([key, value]) => {
      nextHeaders.set(key, value);
    });

    return fetchImpl(input, {
      ...init,
      headers: nextHeaders,
    });
  };
}

function createOAuthClientCredentialsHeaderProvider(
  profile: Extract<AuthProfile, { type: "oauth-client-credentials-env" }>,
  fetchImpl: typeof fetch,
): HeaderProvider {
  let cachedToken: CachedOAuthToken | undefined;
  let inFlightToken: Promise<CachedOAuthToken> | undefined;

  return async () => {
    const nowMs = Date.now();
    if (cachedToken && cachedToken.expiresAtMs > nowMs) {
      return { Authorization: `Bearer ${cachedToken.accessToken}` };
    }

    inFlightToken ??= requestOAuthClientCredentialsToken(profile, fetchImpl).finally(() => {
      inFlightToken = undefined;
    });

    cachedToken = await inFlightToken;
    return { Authorization: `Bearer ${cachedToken.accessToken}` };
  };
}

async function requestOAuthClientCredentialsToken(
  profile: Extract<AuthProfile, { type: "oauth-client-credentials-env" }>,
  fetchImpl: typeof fetch,
): Promise<CachedOAuthToken> {
  const clientId = getRequiredEnv(profile.clientIdEnv);
  const clientSecret = getRequiredEnv(profile.clientSecretEnv);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    ...profile.extraParams,
  });

  if (profile.scope) {
    body.set("scope", profile.scope);
  }

  if (profile.audience) {
    body.set("audience", profile.audience);
  }

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  });

  if (profile.authMethod === "client_secret_basic") {
    headers.set("Authorization", `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`);
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const response = await fetchImpl(profile.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new BridgeError({
      message: `OAuth client credentials token request failed: HTTP ${response.status}`,
      category: "configuration",
    });
  }

  const tokenResponse = parseOAuthTokenResponse(await response.json());
  const tokenType = tokenResponse.token_type.toLowerCase();
  if (tokenType !== "bearer") {
    throw new BridgeError({
      message: `OAuth client credentials returned unsupported token type: ${tokenResponse.token_type}`,
      category: "configuration",
    });
  }

  return {
    accessToken: tokenResponse.access_token,
    expiresAtMs: calculateExpiryMs(tokenResponse.expires_in),
  };
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new BridgeError({
      message: `Auth profile requires environment variable ${name}`,
      category: "configuration",
    });
  }

  return value;
}

function parseOAuthTokenResponse(raw: unknown): {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
} {
  if (!raw || typeof raw !== "object") {
    throw new BridgeError({
      message: "OAuth client credentials token response was not a JSON object",
      category: "configuration",
    });
  }

  const response = raw as Record<string, unknown>;
  const accessToken = response.access_token;
  const tokenType = response.token_type;
  const expiresIn = response.expires_in;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new BridgeError({
      message: "OAuth client credentials token response did not include access_token",
      category: "configuration",
    });
  }

  if (typeof tokenType !== "string" || tokenType.length === 0) {
    throw new BridgeError({
      message: "OAuth client credentials token response did not include token_type",
      category: "configuration",
    });
  }

  if (expiresIn !== undefined && (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0)) {
    throw new BridgeError({
      message: "OAuth client credentials token response included invalid expires_in",
      category: "configuration",
    });
  }

  return {
    access_token: accessToken,
    token_type: tokenType,
    ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
  };
}

function calculateExpiryMs(expiresInSeconds: number | undefined): number {
  if (expiresInSeconds === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }

  const effectiveMs = Math.max(0, expiresInSeconds * 1000 - OAUTH_EXPIRY_SKEW_MS);
  return Date.now() + effectiveMs;
}
