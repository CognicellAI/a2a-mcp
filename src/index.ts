#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SdkA2AClientFactory } from "./a2a-client-factory.js";
import { A2ABridgeService } from "./a2a-service.js";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./mcp-server.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const clientFactory = new SdkA2AClientFactory(config);
  const service = new A2ABridgeService(config, clientFactory);
  const server = createMcpServer(service);

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`a2a-mcp failed to start: ${message}\n`);
  process.exitCode = 1;
});
