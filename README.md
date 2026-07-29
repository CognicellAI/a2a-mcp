# A2A MCP

`@cognicellai/a2a-mcp` is an MCP server that bridges local MCP hosts to A2A v1-compatible agents.

It exposes the A2A v1 client operation surface through MCP tools and routes A2A calls through the official `@a2a-js/sdk` client.

## Install From npm

Install it from the official npm registry:

```bash
npm install -g @cognicellai/a2a-mcp
```

Or run it directly with `npx`:

```bash
A2A_MCP_CONFIG=/absolute/path/to/a2a-mcp.config.yaml npx -y @cognicellai/a2a-mcp
```

For MCP host setup, see [docs/host-setup.md](./docs/host-setup.md). For end-to-end usage examples covering no-auth, API-key, and machine-to-machine OAuth A2A agents, see [docs/user-guide.md](./docs/user-guide.md).

The installed CLI command is `a2a-mcp`.

For maintainers preparing a release, see [docs/release.md](./docs/release.md).

## Development From Source

```bash
npm install
npm run build
npm test
npm run typecheck
npm run lint:docs
```

Start the MCP server over stdio:

```bash
A2A_MCP_CONFIG=./a2a-mcp.config.example.yaml npm run dev
```

## Configuration

Agents are configured by alias. Credentials are referenced by profile and resolved from the local environment; token values are never accepted as MCP tool arguments.

See [a2a-mcp.config.example.yaml](./a2a-mcp.config.example.yaml).

Agent Card signature handling is fail-closed by default: unsigned cards are accepted with `signaturePolicy: "ifPresent"`, but signed cards are rejected until trust-root-backed signature verification is implemented. Use `signaturePolicy: "disabled"` only for explicitly trusted local or development agents.
