# A2A MCP User Guide

This guide shows how to run `@cognicellai/a2a-mcp` as a local stdio MCP server and connect MCP hosts such as Codex, Claude Code, OpenCode, and Cursor to A2A-compatible agents.

`@cognicellai/a2a-mcp` is an MCP-to-A2A bridge:

- Your MCP host talks to the local `a2a-mcp` CLI over stdio.
- The bridge talks to configured A2A agents over A2A v1 JSON-RPC or HTTP+JSON.
- A2A credentials stay in environment variables owned by the local machine or host secret store.

## Prerequisites

- Node.js 20 or newer.
- At least one A2A v1-compatible agent with an Agent Card URL.
- `@cognicellai/a2a-mcp` installed from the official npm registry, or run through `npx`.

Install the package globally:

```bash
npm install -g @cognicellai/a2a-mcp
```

Or run it without a global install:

```bash
npx -y @cognicellai/a2a-mcp
```

The installed CLI command is `a2a-mcp`.

Start it manually once to catch configuration errors early:

```bash
A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml npx -y @cognicellai/a2a-mcp
```

The process uses stdio, so a successful start usually waits silently for an MCP host to connect.

## Configure A2A agents

Create a YAML config file, then point your MCP host at it with `A2A_MCP_CONFIG`.

### Variant 1: no-auth A2A endpoint

Use this for public or local development A2A agents that do not require an auth header.

```yaml
agents:
  public_agent:
    cardUrl: "https://agent.example.com/.well-known/agent-card.json"
    allowedBindings: ["JSONRPC", "HTTP+JSON"]
    signaturePolicy: "ifPresent"
    directUrlPolicy: "disabled"

authProfiles: {}

network:
  allowPrivateAddresses: false
  requireHttps: true
  timeoutMs: 30000
  maxResponseBytes: 10485760
```

For a local development agent on `localhost`, relax network policy deliberately:

```yaml
agents:
  local_agent:
    cardUrl: "http://localhost:9999/.well-known/agent-card.json"
    allowedBindings: ["JSONRPC", "HTTP+JSON"]
    signaturePolicy: "disabled"
    directUrlPolicy: "disabled"

network:
  allowPrivateAddresses: true
  requireHttps: false
  timeoutMs: 30000
  maxResponseBytes: 10485760
```

### Variant 2: API-key A2A endpoint

Use `api-key-env` when the A2A agent expects a custom header such as `X-API-Key`.

```yaml
agents:
  api_key_agent:
    cardUrl: "https://agent.example.com/.well-known/agent-card.json"
    allowedBindings: ["JSONRPC", "HTTP+JSON"]
    authProfile: "agent-api-key"
    signaturePolicy: "ifPresent"
    directUrlPolicy: "disabled"

authProfiles:
  agent-api-key:
    type: "api-key-env"
    env: "A2A_AGENT_API_KEY"
    header: "X-API-Key"

network:
  allowPrivateAddresses: false
  requireHttps: true
  timeoutMs: 30000
  maxResponseBytes: 10485760
```

Set the secret in your shell or host secret store:

```bash
export A2A_AGENT_API_KEY="replace-with-your-api-key"
```

If the endpoint expects an API key in an `Authorization` header instead, configure the header explicitly:

```yaml
authProfiles:
  agent-api-key:
    type: "api-key-env"
    env: "A2A_AGENT_API_KEY"
    header: "Authorization"
```

In that case the environment value must include the complete header value, for example `ApiKey abc123` or `Bearer abc123`, depending on the agent.

### Variant 3: machine-to-machine OAuth A2A endpoint

Use `oauth-client-credentials-env` when the A2A agent is protected by OAuth 2.0 client credentials. The bridge requests an access token from the configured token endpoint, caches it in memory until shortly before expiry, and sends it to the A2A agent as `Authorization: Bearer ...`.

```yaml
agents:
  m2m_oauth_agent:
    cardUrl: "https://agent.example.com/.well-known/agent-card.json"
    allowedBindings: ["JSONRPC", "HTTP+JSON"]
    authProfile: "agent-m2m-oauth"
    signaturePolicy: "ifPresent"
    directUrlPolicy: "disabled"

authProfiles:
  agent-m2m-oauth:
    type: "oauth-client-credentials-env"
    tokenUrl: "https://auth.example.com/oauth/token"
    clientIdEnv: "A2A_AGENT_CLIENT_ID"
    clientSecretEnv: "A2A_AGENT_CLIENT_SECRET"
    scope: "a2a:send a2a:read"
    audience: "https://agent.example.com"
    authMethod: "client_secret_basic"

network:
  allowPrivateAddresses: false
  requireHttps: true
  timeoutMs: 30000
  maxResponseBytes: 10485760
```

Set the OAuth client credentials before starting the MCP host:

```bash
export A2A_AGENT_CLIENT_ID="replace-with-client-id"
export A2A_AGENT_CLIENT_SECRET="replace-with-client-secret"
```

Some OAuth providers require the client credentials in the request body instead of HTTP Basic authentication:

```yaml
authProfiles:
  agent-m2m-oauth:
    type: "oauth-client-credentials-env"
    tokenUrl: "https://auth.example.com/oauth/token"
    clientIdEnv: "A2A_AGENT_CLIENT_ID"
    clientSecretEnv: "A2A_AGENT_CLIENT_SECRET"
    scope: "a2a:send a2a:read"
    authMethod: "client_secret_post"
```

Provider-specific token parameters can be added with `extraParams`:

```yaml
authProfiles:
  agent-m2m-oauth:
    type: "oauth-client-credentials-env"
    tokenUrl: "https://auth.example.com/oauth/token"
    clientIdEnv: "A2A_AGENT_CLIENT_ID"
    clientSecretEnv: "A2A_AGENT_CLIENT_SECRET"
    extraParams:
      resource: "https://agent.example.com"
```

For user-delegated OAuth, device-code, PKCE, or refresh-token flows, acquire or refresh the access token outside the bridge and pass it through a `bearer-env` profile. Do not put refresh tokens in MCP tool arguments or checked-in config files.

## Register with MCP hosts

The examples below assume:

- config path: `/absolute/path/to/a2a-mcp.config.yaml`
- server command: `npx -y @cognicellai/a2a-mcp` or globally installed `a2a-mcp`

Replace the config path with your real path.

### Codex and ChatGPT desktop-style MCP

Codex can add stdio MCP servers with `codex mcp add`, including environment variables:

```bash
codex mcp add a2a \
  --env A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml \
  --env A2A_AGENT_API_KEY="$A2A_AGENT_API_KEY" \
  -- npx -y @cognicellai/a2a-mcp
```

For the machine-to-machine OAuth variant, pass the OAuth client credential environment variables instead:

```bash
codex mcp add a2a \
  --env A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml \
  --env A2A_AGENT_CLIENT_ID="$A2A_AGENT_CLIENT_ID" \
  --env A2A_AGENT_CLIENT_SECRET="$A2A_AGENT_CLIENT_SECRET" \
  -- npx -y @cognicellai/a2a-mcp
```

You can also configure Codex with `~/.codex/config.toml` or a project `.codex/config.toml`:

```toml
[mcp_servers.a2a]
command = "npx"
args = ["-y", "@cognicellai/a2a-mcp"]
env = { A2A_MCP_CONFIG = "/absolute/path/to/a2a-mcp.config.yaml" }
```

For ChatGPT web, local Codex MCP config is not read directly. Use ChatGPT Work plugins or a hosted remote MCP deployment when that is available.

### Claude Code

Add the server with the Claude Code CLI:

```bash
claude mcp add --transport stdio a2a \
  --env A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml \
  --env A2A_AGENT_API_KEY="$A2A_AGENT_API_KEY" \
  -- npx -y @cognicellai/a2a-mcp
```

Project-scoped `.mcp.json` example:

```json
{
  "mcpServers": {
    "a2a": {
      "command": "npx",
      "args": ["-y", "@cognicellai/a2a-mcp"],
      "env": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml",
        "A2A_AGENT_API_KEY": "${A2A_AGENT_API_KEY}"
      }
    }
  }
}
```

For no-auth agents, remove the `A2A_AGENT_API_KEY` entry. For machine-to-machine OAuth agents, replace it with `A2A_AGENT_CLIENT_ID` and `A2A_AGENT_CLIENT_SECRET`.

### OpenCode

OpenCode local MCP servers use `type: "local"` and a command array.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "a2a": {
      "type": "local",
      "command": ["npx", "-y", "@cognicellai/a2a-mcp"],
      "enabled": true,
      "environment": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml",
        "A2A_AGENT_API_KEY": "{env:A2A_AGENT_API_KEY}"
      }
    }
  }
}
```

For machine-to-machine OAuth agents, use:

```jsonc
"environment": {
  "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml",
  "A2A_AGENT_CLIENT_ID": "{env:A2A_AGENT_CLIENT_ID}",
  "A2A_AGENT_CLIENT_SECRET": "{env:A2A_AGENT_CLIENT_SECRET}"
}
```

OpenCode's built-in OAuth flow applies to remote MCP servers. Because `a2a-mcp` currently runs as a local stdio server, user-delegated OAuth for the outbound A2A agent must be handled before launch and passed as an access-token environment variable. Machine-to-machine OAuth client credentials are handled by the bridge.

### Cursor

Create `.cursor/mcp.json` for a project or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "a2a": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cognicellai/a2a-mcp"],
      "env": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml",
        "A2A_AGENT_API_KEY": "${env:A2A_AGENT_API_KEY}"
      }
    }
  }
}
```

For no-auth agents, remove the API-key environment variable. For machine-to-machine OAuth agents, use `A2A_AGENT_CLIENT_ID` and `A2A_AGENT_CLIENT_SECRET`.

Cursor also supports `envFile` for stdio servers, which can be useful for local-only secrets:

```json
{
  "mcpServers": {
    "a2a": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cognicellai/a2a-mcp"],
      "envFile": "/absolute/path/to/.a2a-mcp.env",
      "env": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml"
      }
    }
  }
}
```

Do not commit `.env` files containing A2A tokens.

## Use the tools

After the MCP host starts the server, ask it to list tools or call these smoke-test operations:

1. `a2a_list_agents`
2. `a2a_get_agent_card` with an `agent` alias
3. `a2a_send_message`

Example `a2a_send_message` arguments:

```json
{
  "agent": "api_key_agent",
  "request": {
    "message": {
      "messageId": "hello-1",
      "role": "ROLE_USER",
      "parts": [
        {
          "text": "Hello from my MCP host."
        }
      ]
    }
  }
}
```

For streaming, start with `a2a_send_streaming_message`, then poll the local session with `a2a_stream_next`. Close the local stream reader with `a2a_stream_close` when done. Closing the local stream reader does not cancel the remote A2A task.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Auth profile requires environment variable ...` | The config references an env var that the MCP server process cannot see. | Pass the env var through the host config or launch wrapper. |
| `Unknown auth profile` | An agent references an `authProfile` that is not declared. | Add the profile under `authProfiles` or remove the reference for no-auth agents. |
| Private/local URL rejected | Network policy blocks loopback and private addresses by default. | For trusted local development only, set `allowPrivateAddresses: true` and `requireHttps: false`. |
| Signed Agent Card rejected | Signature policy is fail-closed until verification is configured. | Use an unsigned card, configure verification when implemented, or set `signaturePolicy: "disabled"` only for trusted development. |
| Host shows server failed immediately | Bad path, missing Node.js, invalid YAML, or missing env var. | Run the manual startup command from a terminal to see the startup error. |

## Source docs checked

- [ChatGPT/Codex MCP docs](https://learn.chatgpt.com/docs/extend/mcp?surface=app)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [OpenCode MCP server docs](https://opencode.ai/docs/mcp-servers/)
- [Cursor MCP docs](https://cursor.com/docs/mcp)
