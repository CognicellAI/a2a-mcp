import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { A2ABridgeService } from "../src/a2a-service.js";
import type { BridgeConfig } from "../src/config.js";
import { createMcpServer } from "../src/mcp-server.js";

const config: BridgeConfig = {
  agents: {
    demo: {
      cardUrl: "https://agent.example.com/.well-known/agent-card.json",
      allowedBindings: ["JSONRPC", "HTTP+JSON"],
      signaturePolicy: "ifPresent",
      directUrlPolicy: "disabled",
    },
  },
  authProfiles: {},
  network: {
    allowPrivateAddresses: false,
    requireHttps: true,
    timeoutMs: 30_000,
    maxResponseBytes: 10 * 1024 * 1024,
  },
};

const openClients: Client[] = [];

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

describe("MCP server", () => {
  it("lists A2A tools and calls list agents over the MCP protocol", async () => {
    const { client } = await createConnectedClient();

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "a2a_list_agents",
        "a2a_send_message",
        "a2a_send_streaming_message",
        "a2a_get_task",
        "a2a_cancel_task",
        "a2a_stream_next",
        "a2a_stream_close",
      ]),
    );

    const sendMessageTool = tools.tools.find((tool) => tool.name === "a2a_send_message");
    expect(sendMessageTool?.inputSchema.required).toContain("agent");
    expect(sendMessageTool?.inputSchema.required).toContain("request");

    const result = await client.callTool({
      name: "a2a_list_agents",
      arguments: {},
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      result: [
        {
          alias: "demo",
          allowedBindings: ["JSONRPC", "HTTP+JSON"],
        },
      ],
      _bridge: {
        operation: "listAgents",
      },
    });
  });

  it("rejects malformed MCP tool arguments before invoking A2A service code", async () => {
    const { client } = await createConnectedClient();

    const result = await client.callTool({
      name: "a2a_send_message",
      arguments: {
        agent: "demo",
        request: {},
      },
    });

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result)).toMatchObject({
      type: "text",
      text: expect.stringContaining("Invalid arguments for tool a2a_send_message"),
    });
  });
});

async function createConnectedClient(): Promise<{ client: Client }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const service = new A2ABridgeService(config, {
    async create() {
      throw new Error("client factory should not be called by these MCP tests");
    },
  });
  const server = createMcpServer(service);
  const client = new Client(
    {
      name: "mcp-test-client",
      version: "0.1.0",
    },
    {
      capabilities: {},
    },
  );

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openClients.push(client);

  return { client };
}

function getFirstTextContent(result: Awaited<ReturnType<Client["callTool"]>>) {
  if (
    !("content" in result) ||
    !Array.isArray(result.content) ||
    !result.content[0] ||
    result.content[0].type !== "text"
  ) {
    throw new Error("expected first text content item");
  }

  return result.content[0];
}
