import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { ParalleaxApiClient } from '../api-client.js';
import { silentToolLogger } from '../logger.js';
import { createParalleaxMcpServer } from '../server.js';
import { e2eUrl } from './e2e-api.js';

export interface McpSession {
  call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ isError: boolean; data: Record<string, unknown> | undefined }>;
  ok(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

/** Connects an MCP client to a server that talks to a running Paralleax API. */
export async function connectToApi(sessionToken: string): Promise<McpSession> {
  const server = createParalleaxMcpServer({
    api: new ParalleaxApiClient({ apiUrl: e2eUrl(), sessionToken }),
    logger: silentToolLogger,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'paralleax-mcp-e2e', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call: McpSession['call'] = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    return { isError: result.isError === true, data: result.structuredContent };
  };
  return {
    call,
    async ok(name, args) {
      const result = await call(name, args);
      if (result.isError || result.data === undefined) {
        throw new Error(`${name} failed: ${JSON.stringify(result.data)}`);
      }
      return result.data;
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}
