# MCP Server

Exposes cal.diy scheduling as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server so AI assistants (Claude, Cursor, etc.) can check availability and book meetings.

## Endpoint

```
POST https://<your-instance>/api/mcp
```

The endpoint implements the stateless Streamable HTTP transport. Authentication uses the same API keys as the REST API (created under **Settings → Developer → API keys**):

```
Authorization: Bearer cal_xxxxxxxxxxxx
```

### Client configuration (e.g. Claude)

```json
{
  "mcpServers": {
    "cal-diy": {
      "type": "http",
      "url": "https://<your-instance>/api/mcp",
      "headers": {
        "Authorization": "Bearer cal_xxxxxxxxxxxx"
      }
    }
  }
}
```

## Key scopes

API keys stay user-level — no schema change was needed for a "global" level:

- **User keys** (default): can read public availability of any user, create bookings with any user (same as the public booking page), and list/cancel only *their own* bookings.
- **Global keys**: an API key owned by an instance admin (`role = ADMIN`) automatically acts as a global key and may additionally list bookings of *any* user.

## Tools

| Tool | Description | Scope |
|------|-------------|-------|
| `list_event_types` | Public (bookable) event types of a user | any key |
| `get_available_slots` | Free slots of a user for an event type in a date range (max 62 days) | any key |
| `create_booking` | Book a slot with a user; creates the booking with `creationSource = MCP` | any key |
| `list_bookings` | Bookings of the key owner, or of any user with a global key | own: any key, others: global |
| `cancel_booking` | Cancel a booking by uid | any key |

## Architecture

- `services/McpApiKeyAuthService.ts` — Bearer key verification (hashing, expiry, locked accounts, scope resolution) on top of the shared `ApiKeyService`.
- `services/McpToolsService.ts` — framework-agnostic tool logic delegating to the existing `AvailableSlotsService`, `RegularBookingService` and `BookingCancelService`.
- `repositories/` — Prisma access for user lookup and booking listing (select-only, minimal fields).
- `di/` — container factories used by the HTTP endpoint.

The HTTP layer (MCP transport + tool registration with zod schemas) lives in `apps/web/lib/mcp/buildMcpServer.ts` and `apps/web/pages/api/mcp.ts`.
