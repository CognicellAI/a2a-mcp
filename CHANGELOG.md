# Changelog

All notable changes to this project will be documented in this file.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning once published.

## 0.1.0 - Unreleased

### Added

- MCP server that exposes A2A v1 client operations to MCP hosts over stdio.
- JSON-RPC and HTTP+JSON A2A transport support through the official `@a2a-js/sdk` client.
- Environment-backed auth profiles for no auth, bearer token, API key, and OAuth 2.0 client credentials.
- Agent Card validation, transport filtering, URL policy controls, timeout limits, and response-size limits.
- Local stream-session tools for A2A streaming responses.
- Conformance strategy documentation for SDK-backed A2A client bridge behavior.
