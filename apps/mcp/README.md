# Heremita MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI assistant (Claude Desktop, Claude Code, any MCP client) read Heremita trips and plan your own. It talks to the public REST API, typed by the same `@heremita/shared` contract as the web app.

## Tools

| Tool                  | Needs an account | What it does                                                                          |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `search_public_trips` | no               | Published trips by destination or title, with a link to each                          |
| `get_trip_plan`       | no               | A trip as days of places in visiting order, plus its ideas                            |
| `get_place`           | no               | A place's details, rating and latest reviews                                          |
| `list_my_trips`       | yes              | Your trips                                                                            |
| `create_trip`         | yes              | A new private trip with empty days and a destination                                  |
| `search_places`       | yes              | OpenStreetMap places by name, each with the `key` to add it                           |
| `suggest_places`      | yes              | Places that fit a request, from Heremita's AI, each one checked against OpenStreetMap |
| `add_place`           | yes              | Adds a place to a day of a trip, or to its ideas                                      |

Read tools carry `readOnlyHint`; nothing deletes. Without an account only the public tools are offered. A refusal of the API (a private trip, a full day, AI turned off) comes back as a tool error with its code, so the assistant can explain it.

## Run it

```sh
pnpm install
pnpm build:shared && pnpm --filter @heremita/mcp build
```

| Variable            | Default                       | Meaning                                          |
| ------------------- | ----------------------------- | ------------------------------------------------ |
| `HEREMITA_URL`      | `https://heremita.vercel.app` | Site to talk to (`http://localhost:3100` in dev) |
| `HEREMITA_EMAIL`    | unset                         | Your account, for the planning tools             |
| `HEREMITA_PASSWORD` | unset                         | Its password                                     |

The password stays on your machine: the server signs in once, keeps the session cookie in memory and signs in again when it expires.

**Claude Code:**

```sh
claude mcp add heremita -e HEREMITA_EMAIL=you@example.com -e HEREMITA_PASSWORD=… -- node /path/to/heremita/apps/mcp/dist/main.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "heremita": {
      "command": "node",
      "args": ["/path/to/heremita/apps/mcp/dist/main.js"],
      "env": { "HEREMITA_EMAIL": "you@example.com", "HEREMITA_PASSWORD": "…" }
    }
  }
}
```

Then ask, for example: _"Find a public trip to Paris, then create my own 2-day walking trip there and add three quiet museums to day 1."_

## Tests

`pnpm --filter @heremita/mcp test` connects a real MCP client to the server over an in-memory transport, with the API faked at `fetch`: which tools are offered with and without an account, the request each tool sends (session cookie and `Origin` on writes), signing in again after an expired session, and API refusals turned into tool errors.
