import type { McpToolsService } from "@calcom/features/mcp/services/McpToolsService";
import type { McpAuthContext } from "@calcom/features/mcp/types";
import logger from "@calcom/lib/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const log = logger.getSubLogger({ prefix: ["mcp"] });

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const toToolResult = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const toToolError = (error: unknown): ToolResult => {
  const message = error instanceof Error ? error.message : "Something went wrong.";
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
}): McpServer {
  const server = new McpServer({ name: "cal-diy", version: "1.0.0" });

  server.registerTool(
    "list_event_types",
    {
      title: "List event types",
      description:
        "List the publicly bookable event types (meeting types) of a user. Use this first to find out what kind of meetings a person offers and how long they are.",
      inputSchema: {
        username: z.string().describe("The username of the person, as it appears in their booking page URL"),
      },
    },
    async ({ username }) => {
      try {
        return toToolResult(await toolsService.listEventTypes({ username }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_available_slots",
    {
      title: "Get available slots",
      description:
        "Get the free time slots of a user for one of their event types within a date range (max 62 days). Returns bookable start times grouped by day.",
      inputSchema: {
        username: z.string().describe("The username of the person to check availability for"),
        eventTypeSlug: z.string().describe("The slug of the event type, see list_event_types"),
        startDate: z.string().describe("Start of the range, ISO 8601 date or datetime, e.g. 2026-07-06"),
        endDate: z.string().describe("End of the range (inclusive), ISO 8601 date or datetime"),
        timeZone: z
          .string()
          .optional()
          .describe(
            "IANA time zone to render the slots in, e.g. Europe/Vienna. Defaults to the user's time zone"
          ),
      },
    },
    async (input) => {
      try {
        return toToolResult(await toolsService.getAvailableSlots(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "create_booking",
    {
      title: "Create booking",
      description:
        "Book a slot with a user. Pick a start time returned by get_available_slots. The attendee is the person the booking is made for.",
      inputSchema: {
        username: z.string().describe("The username of the person to book with"),
        eventTypeSlug: z.string().describe("The slug of the event type to book, see list_event_types"),
        start: z
          .string()
          .describe("Start time of the booking as ISO 8601 datetime, from get_available_slots"),
        attendeeName: z.string().describe("Full name of the attendee the booking is for"),
        attendeeEmail: z.string().email().describe("Email address of the attendee"),
        timeZone: z.string().describe("IANA time zone of the attendee, e.g. Europe/Vienna"),
        language: z
          .string()
          .optional()
          .describe("Locale for confirmation emails, e.g. 'de' or 'en'. Defaults to 'en'"),
        notes: z.string().optional().describe("Additional notes for the host"),
        guests: z.array(z.string().email()).optional().describe("Email addresses of additional guests"),
      },
    },
    async (input) => {
      try {
        return toToolResult(await toolsService.createBooking({ requester: auth, ...input }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "list_bookings",
    {
      title: "List bookings",
      description:
        "List existing bookings. Without a username it lists the bookings of the API key owner. Listing another user's bookings requires a global (admin) API key.",
      inputSchema: {
        username: z
          .string()
          .optional()
          .describe("Username whose bookings to list. Defaults to the API key owner"),
        status: z
          .enum(["ACCEPTED", "PENDING", "CANCELLED", "REJECTED", "AWAITING_HOST"])
          .optional()
          .describe("Only return bookings with this status"),
        from: z.string().optional().describe("Only bookings starting at or after this ISO 8601 date"),
        to: z.string().optional().describe("Only bookings starting at or before this ISO 8601 date"),
        limit: z
          .number()
          .int()
          .positive()
          .max(250)
          .optional()
          .describe("Maximum number of bookings to return (default 50)"),
      },
    },
    async (input) => {
      try {
        return toToolResult(await toolsService.listBookings({ requester: auth, ...input }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel booking",
      description: "Cancel an existing booking by its uid (as returned by create_booking or list_bookings).",
      inputSchema: {
        bookingUid: z.string().describe("The uid of the booking to cancel"),
        reason: z.string().optional().describe("Reason for the cancellation, shown to the participants"),
      },
    },
    async (input) => {
      try {
        return toToolResult(await toolsService.cancelBooking({ requester: auth, ...input }));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}
