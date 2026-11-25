import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HeremitaClient } from './api-client.js';
import { registerAccountTools, registerPublicTools } from './tools.js';

export const SERVER_INFO = { name: 'heremita', version: '0.1.0' } as const;

const INSTRUCTIONS = `Heremita is a trip planner: trips have days, each day an ordered list of places, plus ideas (places on no day).
Public tools read trips other travellers published. With an account configured you can also plan your own trips: create_trip, then search_places or suggest_places, then add_place.
Places are OpenStreetMap places identified by a key such as osm:W:1370081491. Never invent a key: take it from search_places or suggest_places.`;

/** The MCP server: public tools always, account tools only when an account is configured. */
export function createServer(client: HeremitaClient): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerPublicTools(server, client);
  if (client.canSignIn) {
    registerAccountTools(server, client);
  }
  return server;
}
