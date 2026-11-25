#!/usr/bin/env node
// Heremita MCP server over stdio. Configure it in an MCP client (Claude
// Desktop, Claude Code, …) with:
//   HEREMITA_URL       site to talk to (default https://heremita.vercel.app)
//   HEREMITA_EMAIL     } optional: your account, to plan your own trips;
//   HEREMITA_PASSWORD  } without them only public trips are readable.
// stdout carries the protocol: diagnostics go to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HeremitaClient } from './api-client.js';
import { createServer } from './server.js';

const email = process.env['HEREMITA_EMAIL']?.trim();
const password = process.env['HEREMITA_PASSWORD'];
const client = new HeremitaClient({
  baseUrl: process.env['HEREMITA_URL'] ?? 'https://heremita.vercel.app',
  credentials: email && password ? { email, password } : null,
});

const server = createServer(client);
await server.connect(new StdioServerTransport());
process.stderr.write(
  `heremita-mcp ready (${client.canSignIn ? 'account tools on' : 'public tools only'})\n`,
);
