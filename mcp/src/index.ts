#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FlowboardClient } from './client.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

// stdout carries the MCP protocol: log only to stderr.
const config = loadConfig();
if (!config.token) {
  console.error(
    '[flowboard-mcp] FLOWBOARD_TOKEN is not set; tools will return an error until it is configured.',
  );
}

const server = createServer(new FlowboardClient(config));
await server.connect(new StdioServerTransport());
console.error(`[flowboard-mcp] connected (API: ${config.apiUrl})`);
