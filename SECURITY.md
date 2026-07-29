# Security Policy

## Supported versions

This project has not been publicly released yet. After the first release, security fixes will target the latest published minor version unless otherwise noted.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting for `CognicellAI/a2a-mcp` when available.

Do not open public issues for suspected credential leaks, authentication bypasses, request-smuggling behavior, or denial-of-service vulnerabilities.

## Credential handling expectations

- Do not commit `.env` files or machine credentials.
- Configure credentials through environment variables referenced by `authProfiles`.
- Do not pass bearer tokens, API keys, OAuth client secrets, or refresh tokens as MCP tool arguments.
- Keep local, agent-specific configs out of public commits unless they are sanitized examples.

## Network safety expectations

Production configs should keep `network.requireHttps: true` and should not enable private-address access unless the target A2A agent is explicitly trusted and local.
