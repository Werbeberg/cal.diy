import { describe, expect, it, vi } from "vitest";
import type { McpAuthContext } from "../types";
import type { IMcpToolsServiceDeps } from "./McpToolsService";
import { McpToolsService } from "./McpToolsService";

const host = { id: 7, username: "person-x", name: "Person X", timeZone: "Europe/Vienna" };

const publicEventType = {
  id: 100,
  slug: "30min",
  title: "30 Minute Meeting",
  description: "A quick chat",
  length: 30,
  requiresConfirmation: false,
  price: 0,
  currency: "usd",
};

const userAuth: McpAuthContext = {
  apiKeyId: "key-1",
  userId: 42,
  userEmail: "owner@example.com",
  scope: "user",
};

const globalAuth: McpAuthContext = { ...userAuth, scope: "global" };

const buildService = (overrides?: { user?: typeof host | null; eventTypes?: (typeof publicEventType)[] }) => {
  const deps = {
    userRepository: {
      findByUsername: vi.fn().mockResolvedValue(overrides?.user === undefined ? host : overrides.user),
      findManyBookable: vi.fn().mockResolvedValue([host]),
    },
    bookingRepository: {
      findManyByUserIdIncludeAttendees: vi.fn().mockResolvedValue([]),
    },
    availableSlotsService: {
      getAvailableSlots: vi.fn().mockResolvedValue({
        slots: {
          "2026-07-06": [{ time: "2026-07-06T09:00:00+02:00" }, { time: "2026-07-06T09:30:00+02:00" }],
        },
      }),
    },
    regularBookingService: {
      createBooking: vi.fn().mockResolvedValue({
        uid: "booking-uid",
        title: "30 Minute Meeting between Person X and Jane",
        startTime: new Date("2026-07-06T07:00:00.000Z"),
        endTime: new Date("2026-07-06T07:30:00.000Z"),
        status: "ACCEPTED",
        location: "integrations:daily",
      }),
    },
    bookingCancelService: {
      cancelBooking: vi.fn().mockResolvedValue({
        success: true,
        message: "Booking successfully cancelled.",
        onlyRemovedAttendee: false,
        bookingId: 1,
        bookingUid: "booking-uid",
        isPlatformManagedUserBooking: false,
      }),
    },
    getEventTypesPublic: vi.fn().mockResolvedValue(overrides?.eventTypes ?? [publicEventType]),
  };
  const service = new McpToolsService(deps as unknown as IMcpToolsServiceDeps);
  return { service, deps };
};

describe("McpToolsService", () => {
  describe("listUsers", () => {
    it("lists bookable users with a default limit", async () => {
      const { service, deps } = buildService();

      const result = await service.listUsers({});

      expect(deps.userRepository.findManyBookable).toHaveBeenCalledWith({ search: undefined, limit: 50 });
      expect(result.users).toEqual([{ username: "person-x", name: "Person X", timeZone: "Europe/Vienna" }]);
    });

    it("passes the search filter through and caps the limit at 250", async () => {
      const { service, deps } = buildService();

      await service.listUsers({ search: "markus", limit: 10000 });

      expect(deps.userRepository.findManyBookable).toHaveBeenCalledWith({ search: "markus", limit: 250 });
    });
  });

  describe("listEventTypes", () => {
    it("throws when the user does not exist", async () => {
      const { service } = buildService({ user: null });

      await expect(service.listEventTypes({ username: "ghost" })).rejects.toThrow(
        "No user found with username 'ghost'."
      );
    });

    it("maps public event types to DTOs", async () => {
      const { service } = buildService();

      const result = await service.listEventTypes({ username: "person-x" });

      expect(result.user).toEqual({ username: "person-x", name: "Person X", timeZone: "Europe/Vienna" });
      expect(result.eventTypes).toEqual([
        {
          id: 100,
          slug: "30min",
          title: "30 Minute Meeting",
          description: "A quick chat",
          lengthInMinutes: 30,
          requiresConfirmation: false,
          price: 0,
          currency: "usd",
        },
      ]);
    });
  });

  describe("getAvailableSlots", () => {
    it("rejects invalid dates", async () => {
      const { service } = buildService();

      await expect(
        service.getAvailableSlots({
          username: "person-x",
          eventTypeSlug: "30min",
          startDate: "not-a-date",
          endDate: "2026-07-10",
        })
      ).rejects.toThrow("'startDate' is not a valid ISO 8601 date");
    });

    it("rejects ranges where endDate is not after startDate", async () => {
      const { service } = buildService();

      await expect(
        service.getAvailableSlots({
          username: "person-x",
          eventTypeSlug: "30min",
          startDate: "2026-07-10T00:00:00.000Z",
          endDate: "2026-07-09T00:00:00.000Z",
        })
      ).rejects.toThrow("endDate must be after startDate.");
    });

    it("rejects ranges larger than 62 days", async () => {
      const { service } = buildService();

      await expect(
        service.getAvailableSlots({
          username: "person-x",
          eventTypeSlug: "30min",
          startDate: "2026-07-01",
          endDate: "2026-10-01",
        })
      ).rejects.toThrow("The requested range is too large.");
    });

    it("queries the slots service and maps the result", async () => {
      const { service, deps } = buildService();

      const result = await service.getAvailableSlots({
        username: "person-x",
        eventTypeSlug: "30min",
        startDate: "2026-07-06",
        endDate: "2026-07-07",
        timeZone: "Europe/Vienna",
      });

      expect(deps.availableSlotsService.getAvailableSlots).toHaveBeenCalledWith({
        input: {
          usernameList: ["person-x"],
          eventTypeSlug: "30min",
          startTime: "2026-07-06T00:00:00.000Z",
          endTime: "2026-07-07T23:59:59.999Z",
          timeZone: "Europe/Vienna",
          isTeamEvent: false,
          orgSlug: null,
        },
      });
      expect(result).toEqual({
        username: "person-x",
        eventTypeSlug: "30min",
        timeZone: "Europe/Vienna",
        days: [
          {
            date: "2026-07-06",
            slots: ["2026-07-06T09:00:00+02:00", "2026-07-06T09:30:00+02:00"],
          },
        ],
      });
    });

    it("falls back to the host's time zone", async () => {
      const { service, deps } = buildService();

      const result = await service.getAvailableSlots({
        username: "person-x",
        eventTypeSlug: "30min",
        startDate: "2026-07-06",
        endDate: "2026-07-07",
      });

      expect(result.timeZone).toBe("Europe/Vienna");
      expect(deps.availableSlotsService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ timeZone: "Europe/Vienna" }) })
      );
    });
  });

  describe("createBooking", () => {
    const bookingInput = {
      requester: userAuth,
      username: "person-x",
      eventTypeSlug: "30min",
      start: "2026-07-06T07:00:00.000Z",
      attendeeName: "Jane Doe",
      attendeeEmail: "jane@example.com",
      timeZone: "Europe/Vienna",
    };

    it("throws when the event type does not exist for the user", async () => {
      const { service } = buildService({ eventTypes: [] });

      await expect(service.createBooking(bookingInput)).rejects.toThrow(
        "User 'person-x' has no bookable event type with slug '30min'."
      );
    });

    it("computes the end time from the event type length and books via the booking service", async () => {
      const { service, deps } = buildService();

      const result = await service.createBooking({ ...bookingInput, notes: "Bring coffee" });

      expect(deps.regularBookingService.createBooking).toHaveBeenCalledWith({
        bookingData: expect.objectContaining({
          eventTypeId: 100,
          eventTypeSlug: "30min",
          user: "person-x",
          start: "2026-07-06T07:00:00.000Z",
          end: "2026-07-06T07:30:00.000Z",
          timeZone: "Europe/Vienna",
          language: "en",
          creationSource: "MCP",
          responses: {
            name: "Jane Doe",
            email: "jane@example.com",
            notes: "Bring coffee",
          },
        }),
        bookingMeta: { userId: userAuth.userId },
      });
      expect(result).toEqual({
        uid: "booking-uid",
        title: "30 Minute Meeting between Person X and Jane",
        start: "2026-07-06T07:00:00.000Z",
        end: "2026-07-06T07:30:00.000Z",
        status: "ACCEPTED",
        location: "integrations:daily",
      });
    });
  });

  describe("listBookings", () => {
    it("lists the key owner's bookings by default", async () => {
      const { service, deps } = buildService();

      await service.listBookings({ requester: userAuth });

      expect(deps.bookingRepository.findManyByUserIdIncludeAttendees).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userAuth.userId, limit: 50 })
      );
    });

    it("forbids user-scoped keys from listing other users' bookings", async () => {
      const { service } = buildService();

      await expect(service.listBookings({ requester: userAuth, username: "person-x" })).rejects.toThrow(
        "requires a global API key"
      );
    });

    it("allows global keys to list other users' bookings", async () => {
      const { service, deps } = buildService();

      await service.listBookings({ requester: globalAuth, username: "person-x" });

      expect(deps.bookingRepository.findManyByUserIdIncludeAttendees).toHaveBeenCalledWith(
        expect.objectContaining({ userId: host.id })
      );
    });

    it("allows user-scoped keys to list their own bookings by username", async () => {
      const { service, deps } = buildService({ user: { ...host, id: userAuth.userId } });

      await service.listBookings({ requester: userAuth, username: "person-x" });

      expect(deps.bookingRepository.findManyByUserIdIncludeAttendees).toHaveBeenCalledWith(
        expect.objectContaining({ userId: userAuth.userId })
      );
    });

    it("maps bookings to DTOs", async () => {
      const { service, deps } = buildService();
      deps.bookingRepository.findManyByUserIdIncludeAttendees.mockResolvedValue([
        {
          id: 1,
          uid: "booking-uid",
          title: "30 Minute Meeting",
          description: null,
          status: "ACCEPTED",
          startTime: new Date("2026-07-06T07:00:00.000Z"),
          endTime: new Date("2026-07-06T07:30:00.000Z"),
          location: null,
          eventType: { slug: "30min" },
          attendees: [{ name: "Jane Doe", email: "jane@example.com", timeZone: "Europe/Vienna" }],
        },
      ]);

      const result = await service.listBookings({ requester: userAuth });

      expect(result.bookings).toEqual([
        {
          id: 1,
          uid: "booking-uid",
          title: "30 Minute Meeting",
          description: null,
          status: "ACCEPTED",
          start: "2026-07-06T07:00:00.000Z",
          end: "2026-07-06T07:30:00.000Z",
          location: null,
          eventTypeSlug: "30min",
          attendees: [{ name: "Jane Doe", email: "jane@example.com", timeZone: "Europe/Vienna" }],
        },
      ]);
    });

    it("caps the limit at 250", async () => {
      const { service, deps } = buildService();

      await service.listBookings({ requester: userAuth, limit: 10000 });

      expect(deps.bookingRepository.findManyByUserIdIncludeAttendees).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 250 })
      );
    });
  });

  describe("cancelBooking", () => {
    it("cancels via the cancel service and attributes the cancellation to the key owner", async () => {
      const { service, deps } = buildService();

      const result = await service.cancelBooking({
        requester: userAuth,
        bookingUid: "booking-uid",
        reason: "No longer needed",
      });

      expect(deps.bookingCancelService.cancelBooking).toHaveBeenCalledWith({
        bookingData: {
          uid: "booking-uid",
          cancellationReason: "No longer needed",
          cancelledBy: "owner@example.com",
        },
        bookingMeta: { userId: userAuth.userId },
      });
      expect(result).toEqual({ success: true, message: "Booking successfully cancelled." });
    });
  });
});
