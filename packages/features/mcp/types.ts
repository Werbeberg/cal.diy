export type McpApiKeyScope = "user" | "global";

export type McpAuthContext = {
  apiKeyId: string;
  userId: number;
  userEmail: string;
  scope: McpApiKeyScope;
};

export type McpAuthResult = { valid: true; auth: McpAuthContext } | { valid: false; error: string };

export type McpEventTypeDto = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  lengthInMinutes: number;
  requiresConfirmation: boolean;
  price: number;
  currency: string;
};

export type McpUserDto = {
  username: string | null;
  name: string | null;
  timeZone: string;
};

export type McpAvailabilityDto = {
  username: string;
  eventTypeSlug: string;
  timeZone: string;
  days: {
    date: string;
    slots: string[];
  }[];
};

export type McpBookingStatusDto = "ACCEPTED" | "PENDING" | "CANCELLED" | "REJECTED" | "AWAITING_HOST";

export type McpBookingDto = {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  status: McpBookingStatusDto;
  start: string;
  end: string;
  location: string | null;
  eventTypeSlug: string | null;
  attendees: {
    name: string;
    email: string;
    timeZone: string;
  }[];
};

export type McpCreatedBookingDto = {
  uid: string | null;
  title: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
  location: string | null;
};

export type McpCancelBookingResultDto = {
  success: boolean;
  message: string;
};
