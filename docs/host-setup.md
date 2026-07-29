# MCP Host Setup

`a2a-mcp` runs as a local stdio MCP server. Any MCP host that can launch a command with environment variables can use it to reach configured A2A agents.

For a fuller walkthrough with no-auth, API-key, and machine-to-machine OAuth examples for Codex, Claude Code, OpenCode, and Cursor, see [A2A MCP User Guide](./user-guide.md).

## 1. Install the server from npm

After the package is published, install `a2a-mcp` from the official npm registry:

```bash
npm install -g a2a-mcp
```

You can also let the MCP host run the package through `npx`:

```bash
npx -y a2a-mcp
```

Note: the package name is declared by this project metadata, but `npm view a2a-mcp` currently returns 404 until publication. The examples below show the intended official npm package usage.

## 2. Create a config file

Start from `a2a-mcp.config.example.yaml`:

```yaml
agents:
  research:
    cardUrl: "https://agent.example.com/.well-known/agent-card.json"
    allowedBindings: ["JSONRPC", "HTTP+JSON"]
    authProfile: "research-prod"
    signaturePolicy: "ifPresent"
    directUrlPolicy: "disabled"

authProfiles:
  research-prod:
    type: "bearer-env"
    env: "A2A_RESEARCH_TOKEN"

network:
  allowPrivateAddresses: false
  requireHttps: true
  timeoutMs: 30000
  maxResponseBytes: 10485760
```

Keep token values in the local environment. Do not place them in the config file or in MCP tool arguments.

The default `signaturePolicy: "ifPresent"` is conservative: unsigned cards are allowed, but signed cards are rejected until signature verification is configured in the implementation. For local-only trusted development agents, set `signaturePolicy: "disabled"` deliberately.

## 3. Register the stdio MCP server with a host

Most MCP hosts have a JSON-style server registry. Use the host's current config location and shape, but the command should look like one of these patterns.

Run from npm with `npx`:

```json
{
  "mcpServers": {
    "a2a": {
      "command": "npx",
      "args": ["-y", "a2a-mcp"],
      "env": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml",
        "A2A_RESEARCH_TOKEN": "set-this-in-your-secret-store-if-supported"
      }
    }
  }
}
```

Run a global npm install:

```json
{
  "mcpServers": {
    "a2a": {
      "command": "a2a-mcp",
      "env": {
        "A2A_MCP_CONFIG": "/absolute/path/to/a2a-mcp.config.yaml"
      }
    }
  }
}
```

If your host supports environment-variable inheritance or secret references, prefer that over putting token values directly in the host config.

For contributor development from a local checkout, use:

```bash
npm install
npm run build
A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml node /absolute/path/to/a2a-mcp/dist/index.js
```

## 4. Smoke test from the host

After registering the server, call:

- `a2a_list_agents` to confirm aliases are loaded.
- `a2a_get_agent_card` with an `agent` alias to confirm Agent Card discovery.
- `a2a_send_message` with canonical A2A message JSON to send a message.

Example `a2a_send_message` request:

```json
{
  "agent": "research",
  "request": {
    "message": {
      "messageId": "user-message-1",
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

The bridge adds `configuration.returnImmediately = true` when omitted, injects the AgentInterface tenant when the Agent Card declares one, and sends `A2A-Version: 1.0` on outbound A2A requests.
