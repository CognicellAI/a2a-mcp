# Contributing

Thanks for helping improve `a2a-mcp`.

## Development setup

```bash
npm install
npm run check
```

The main source files live in `src/`, and tests live in `test/`.

## Pull request expectations

Before opening a pull request, run:

```bash
npm run release:check
```

For behavior changes, include focused tests. For user-facing changes, update `README.md`, `docs/`, or `CHANGELOG.md` as appropriate.

## A2A compatibility

Detailed A2A request serialization is delegated to `@a2a-js/sdk`. Bridge tests should focus on behavior owned by this package: MCP tool validation, auth injection, tenant handling, transport selection, URL policy, stream-session handling, and error mapping.
