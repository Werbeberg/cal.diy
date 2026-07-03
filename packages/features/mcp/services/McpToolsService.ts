import type { CreateRegularBookingData } from "@calcom/features/bookings/lib/dto/types";
import type { BookingCancelService } from "@calcom/features/bookings/lib/handleCancelBooking";
import type { RegularBookingService } from "@calcom/features/bookings/lib/service/RegularBookingService";
import type { getEventTypesPublic } from "@calcom/features/eventtypes/lib/getEventTypesPublic";
import { ErrorWithCode } from "@calcom/lib/errors";
import { CreationSource } from "@calcom/prisma/enums";
import type { PrismaMcpBookingRepository } from "../repositories/PrismaMcpBookingRepository";
import type { PrismaMcpUserRepository } from "../repositories/PrismaMcpUserRepository";
import type {
  McpAuthContext,
  McpAvailabilityDto,
  McpBookingDto,
  McpBookingStatusDto,
  McpCancelBookingResultDto,
  McpCreatedBookingDto,
  McpEventTypeDto,
  McpUserDto,
} from "../types";

const MAX_AVAILABILITY_RANGE_DAYS = 62;
const DEFAULT_BOOKINGS_LIMIT = 50;
const MAX_BOOKINGS_LIMIT = 250;

type GetAvailableSlotsInput = {
  usernameList: string[];
  eventTypeSlug: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
  isTeamEvent: boolean;
  orgSlug: string | null;
};

/**
 * Structural interface for the AvailableSlotsService so this feature does not
 * depend on `@calcom/trpc`, where the concrete class currently lives.
 */
export interface IMcpAvailableSlotsService {
  getAvailableSlots(args: { input: GetAvailableSlotsInput }): Promise<{
    slots: Record<string, { time: string }[]>;
  }>;
}

export interface IMcpToolsServiceDeps {
  userRepository: PrismaMcpUserRepository;
  bookingRepository: PrismaMcpBookingRepository;
  availableSlotsService: IMcpAvailableSlotsService;
  regularBookingService: RegularBookingService;
  bookingCancelService: BookingCancelService;
  getEventTypesPublic: typeof getEventTypesPublic;
}

export class McpToolsService {
  constructor(private readonly deps: IMcpToolsServiceDeps) {}

  async listEventTypes({ username }: { username: string }): Promise<{
    user: McpUserDto;
    eventTypes: McpEventTypeDto[];
  }> {
    const user = await this.requireUserByUsername(username);
    const eventTypes = await this.deps.getEventTypesPublic(user.id);

    return {
      user: { username: user.username, name: user.name, timeZone: user.timeZone },
      eventTypes: eventTypes.map((eventType) => ({
        id: eventType.id,
        slug: eventType.slug,
        title: eventType.title,
        description: eventType.description,
        lengthInMinutes: eventType.length,
        requiresConfirmation: eventType.requiresConfirmation,
        price: eventType.price,
        currency: eventType.currency,
      })),
    };
  }

  async getAvailableSlots({
    username,
    eventTypeSlug,
    startDate,
    endDate,
    timeZone,
  }: {
    username: string;
    eventTypeSlug: string;
    startDate: string;
    endDate: string;
    timeZone?: string;
  }): Promise<McpAvailabilityDto> {
    const user = await this.requireUserByUsername(username);

    const start = this.parseDate(startDate, "startDate");
    const end = this.parseDate(endDate, "endDate", { endOfDay: true });

    if (end.getTime() <= start.getTime()) {
      throw ErrorWithCode.Factory.BadRequest("endDate must be after startDate.");
    }

    const rangeInDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeInDays > MAX_AVAILABILITY_RANGE_DAYS) {
      throw ErrorWithCode.Factory.BadRequest(
        `The requested range is too large. Request at most ${MAX_AVAILABILITY_RANGE_DAYS} days at a time.`
      );
    }

    const effectiveTimeZone = timeZone ?? user.timeZone;
    const result = await this.deps.availableSlotsService.getAvailableSlots({
      input: {
        usernameList: [username],
        eventTypeSlug,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timeZone: effectiveTimeZone,
        isTeamEvent: false,
        orgSlug: null,
      },
    });

    return {
      username,
      eventTypeSlug,
      timeZone: effectiveTimeZone,
      days: Object.entries(result.slots).map(([date, slots]) => ({
        date,
        slots: slots.map((slot) => slot.time),
      })),
    };
  }

  async createBooking({
    requester,
    username,
    eventTypeSlug,
    start,
    attendeeName,
    attendeeEmail,
    timeZone,
    language,
    notes,
    guests,
  }: {
    requester: McpAuthContext;
    username: string;
    eventTypeSlug: string;
    start: string;
    attendeeName: string;
    attendeeEmail: string;
    timeZone: string;
    language?: string;
    notes?: string;
    guests?: string[];
  }): Promise<McpCreatedBookingDto> {
    const user = await this.requireUserByUsername(username);

    const eventTypes = await this.deps.getEventTypesPublic(user.id);
    const eventType = eventTypes.find((et) => et.slug === eventTypeSlug);
    if (!eventType) {
      throw ErrorWithCode.Factory.EventTypeNotFound(
        `User '${username}' has no bookable event type with slug '${eventTypeSlug}'.`
      );
    }

    const startDate = this.parseDate(start, "start");
    const endDate = new Date(startDate.getTime() + eventType.length * 60 * 1000);

    // `responses` is validated dynamically against the event type's booking fields inside the booking flow
    const bookingData: CreateRegularBookingData & { responses: Record<string, unknown> } = {
      eventTypeId: eventType.id,
      eventTypeSlug: eventType.slug,
      user: username,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      timeZone,
      language: language ?? "en",
      metadata: {},
      creationSource: CreationSource.MCP,
      responses: {
        name: attendeeName,
        email: attendeeEmail,
        ...(notes ? { notes } : {}),
        ...(guests?.length ? { guests } : {}),
      },
    };

    const booking = await this.deps.regularBookingService.createBooking({
      bookingData,
      bookingMeta: {
        userId: requester.userId,
      },
    });

    return {
      uid: booking.uid ?? null,
      title: booking.title ?? null,
      start: booking.startTime ? new Date(booking.startTime).toISOString() : null,
      end: booking.endTime ? new Date(booking.endTime).toISOString() : null,
      status: booking.status ?? null,
      location: booking.location ?? null,
    };
  }

  async listBookings({
    requester,
    username,
    status,
    from,
    to,
    limit,
  }: {
    requester: McpAuthContext;
    username?: string;
    status?: McpBookingStatusDto;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ bookings: McpBookingDto[] }> {
    let targetUserId = requester.userId;

    if (username) {
      const user = await this.requireUserByUsername(username);
      if (user.id !== requester.userId && requester.scope !== "global") {
        throw ErrorWithCode.Factory.Forbidden(
          "This API key can only list its owner's bookings. Listing bookings of other users requires a global API key (a key created by an instance admin)."
        );
      }
      targetUserId = user.id;
    }

    const bookings = await this.deps.bookingRepository.findManyByUserIdIncludeAttendees({
      userId: targetUserId,
      status,
      from: from ? this.parseDate(from, "from") : undefined,
      to: to ? this.parseDate(to, "to", { endOfDay: true }) : undefined,
      limit: Math.min(limit ?? DEFAULT_BOOKINGS_LIMIT, MAX_BOOKINGS_LIMIT),
    });

    return {
      bookings: bookings.map((booking) => ({
        id: booking.id,
        uid: booking.uid,
        title: booking.title,
        description: booking.description,
        status: booking.status,
        start: booking.startTime.toISOString(),
        end: booking.endTime.toISOString(),
        location: booking.location,
        eventTypeSlug: booking.eventType?.slug ?? null,
        attendees: booking.attendees.map((attendee) => ({
          name: attendee.name,
          email: attendee.email,
          timeZone: attendee.timeZone,
        })),
      })),
    };
  }

  async cancelBooking({
    requester,
    bookingUid,
    reason,
  }: {
    requester: McpAuthContext;
    bookingUid: string;
    reason?: string;
  }): Promise<McpCancelBookingResultDto> {
    const result = await this.deps.bookingCancelService.cancelBooking({
      bookingData: {
        uid: bookingUid,
        cancellationReason: reason,
        cancelledBy: requester.userEmail,
      },
      bookingMeta: {
        userId: requester.userId,
      },
    });

    return {
      success: result.success,
      message: result.message,
    };
  }

  private async requireUserByUsername(username: string) {
    const user = await this.deps.userRepository.findByUsername(username);
    if (!user) {
      throw ErrorWithCode.Factory.NotFound(`No user found with username '${username}'.`);
    }
    return user;
  }

  private parseDate(value: string, fieldName: string, opts?: { endOfDay: boolean }): Date {
    // A date without a time component ("2026-07-04") should cover the whole day
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const normalized = isDateOnly && opts?.endOfDay ? `${value}T23:59:59.999Z` : value;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw ErrorWithCode.Factory.BadRequest(`'${fieldName}' is not a valid ISO 8601 date: ${value}`);
    }
    return parsed;
  }
}
