import type { McpToolsService } from "@calcom/features/mcp/services/McpToolsService";
import type { McpAuthContext } from "@calcom/features/mcp/types";
import logger from "@calcom/lib/logger";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const log = logger.getSubLogger({ prefix: ["mcp"] });

const listUsersInput = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().max(250).optional(),
});

const listEventTypesInput = z.object({
  username: z.string(),
});

const getAvailableSlotsInput = z.object({
  username: z.string(),
  eventTypeSlug: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  timeZone: z.string().optional(),
});

const createBookingInput = z.object({
  username: z.string(),
  eventTypeSlug: z.string(),
  start: z.string(),
  attendeeName: z.string(),
  attendeeEmail: z.string().email(),
  timeZone: z.string(),
  language: z.string().optional(),
  notes: z.string().optional(),
  guests: z.array(z.string().email()).optional(),
});

const listBookingsInput = z.object({
  username: z.string().optional(),
  status: z.enum(["ACCEPTED", "PENDING", "CANCELLED", "REJECTED", "AWAITING_HOST"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().positive().max(250).optional(),
});

const cancelBookingInput = z.object({
  bookingUid: z.string(),
  reason: z.string().optional(),
});

/**
 * Tool metadata is written as plain JSON Schema instead of being derived from the
 * zod schemas above: the SDK's zod type inference (`registerTool`) breaks down with
 * the zod version used in this repo (TS2589), so validation and schema are kept separate.
 */
const TOOL_DEFINITIONS = [
  {
    name: "list_users",
    description:
      "List the bookable people of this instance (users with at least one public event type). Use this to find out who a meeting can be booked with, e.g. when the requester has not named a specific person yet.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Optional filter, matches against username and display name (case-insensitive)",
        },
        limit: { type: "number", description: "Maximum number of users to return (default 50, max 250)" },
      },
      required: [],
    },
  },
  {
    name: "list_event_types",
    description:
      "List the publicly bookable event types (meeting types) of a user. Use this first to find out what kind of meetings a person offers and how long they are.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "The username of the person, as it appears in their booking page URL",
        },
      },
      required: ["username"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "Get the free time slots of a user for one of their event types within a date range (max 62 days). Returns bookable start times grouped by day.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "The username of the person to check availability for" },
        eventTypeSlug: { type: "string", description: "The slug of the event type, see list_event_types" },
        startDate: {
          type: "string",
          description: "Start of the range, ISO 8601 date or datetime, e.g. 2026-07-06",
        },
        endDate: { type: "string", description: "End of the range (inclusive), ISO 8601 date or datetime" },
        timeZone: {
          type: "string",
          description:
            "IANA time zone to render the slots in, e.g. Europe/Vienna. Defaults to the user's time zone",
        },
      },
      required: ["username", "eventTypeSlug", "startDate", "endDate"],
    },
  },
  {
    name: "create_booking",
    description:
      "Book a slot with a user. Pick a start time returned by get_available_slots. The attendee is the person the booking is made for.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "The username of the person to book with" },
        eventTypeSlug: { type: "string", description: "The slug of the event type to book" },
        start: {
          type: "string",
          description: "Start time of the booking as ISO 8601 datetime, from get_available_slots",
        },
        attendeeName: { type: "string", description: "Full name of the attendee the booking is for" },
        attendeeEmail: { type: "string", description: "Email address of the attendee" },
        timeZone: { type: "string", description: "IANA time zone of the attendee, e.g. Europe/Vienna" },
        language: {
          type: "string",
          description: "Locale for confirmation emails, e.g. 'de' or 'en'. Defaults to 'en'",
        },
        notes: { type: "string", description: "Additional notes for the host" },
        guests: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses of additional guests",
        },
      },
      required: ["username", "eventTypeSlug", "start", "attendeeName", "attendeeEmail", "timeZone"],
    },
  },
  {
    name: "list_bookings",
    description:
      "List existing bookings. Without a username it lists the bookings of the API key owner. Listing another user's bookings requires a global (admin) API key.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Username whose bookings to list. Defaults to the API key owner",
        },
        status: {
          type: "string",
          enum: ["ACCEPTED", "PENDING", "CANCELLED", "REJECTED", "AWAITING_HOST"],
          description: "Only return bookings with this status",
        },
        from: { type: "string", description: "Only bookings starting at or after this ISO 8601 date" },
        to: { type: "string", description: "Only bookings starting at or before this ISO 8601 date" },
        limit: { type: "number", description: "Maximum number of bookings to return (default 50, max 250)" },
      },
      required: [],
    },
  },
  {
    name: "cancel_booking",
    description: "Cancel an existing booking by its uid (as returned by create_booking or list_bookings).",
    inputSchema: {
      type: "object",
      properties: {
        bookingUid: { type: "string", description: "The uid of the booking to cancel" },
        reason: { type: "string", description: "Reason for the cancellation, shown to the participants" },
      },
      required: ["bookingUid"],
    },
  },
];

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const toToolResult = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const toToolError = (error: unknown): ToolResult => {
  let message = "Something went wrong.";
  if (error instanceof z.ZodError) {
    message = `Invalid arguments: ${error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ")}`;
  } else if (error instanceof Error) {
    message = error.message;
  }
  log.error("MCP tool call failed", message);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
};

export function buildMcpServer({
  auth,
  toolsService,
}: {
  auth: McpAuthContext;
  toolsService: McpToolsService;
}): Server {
  const server = new Server({ name: "cal-diy", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<ToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "list_users":
          return toToolResult(await toolsService.listUsers(listUsersInput.parse(args)));
        case "list_event_types":
          return toToolResult(await toolsService.listEventTypes(listEventTypesInput.parse(args)));
        case "get_available_slots":
          return toToolResult(await toolsService.getAvailableSlots(getAvailableSlotsInput.parse(args)));
        case "create_booking":
          return toToolResult(
            await toolsService.createBooking({ requester: auth, ...createBookingInput.parse(args) })
          );
        case "list_bookings":
          return toToolResult(
            await toolsService.listBookings({ requester: auth, ...listBookingsInput.parse(args) })
          );
        case "cancel_booking":
          return toToolResult(
            await toolsService.cancelBooking({ requester: auth, ...cancelBookingInput.parse(args) })
          );
        default:
          return toToolError(new Error(`Unknown tool: ${name}`));
      }
    } catch (error) {
      return toToolError(error);
    }
  });

  return server;
}
