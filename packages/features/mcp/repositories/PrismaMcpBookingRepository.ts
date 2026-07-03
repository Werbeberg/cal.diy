import type { PrismaClient } from "@calcom/prisma";
import type { BookingStatus } from "@calcom/prisma/enums";

export class PrismaMcpBookingRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findManyByUserIdIncludeAttendees({
    userId,
    status,
    from,
    to,
    limit,
  }: {
    userId: number;
    status?: BookingStatus;
    from?: Date;
    to?: Date;
    limit: number;
  }) {
    return this.prismaClient.booking.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
        ...(from || to
          ? {
              startTime: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        uid: true,
        title: true,
        description: true,
        status: true,
        startTime: true,
        endTime: true,
        location: true,
        eventType: {
          select: {
            slug: true,
          },
        },
        attendees: {
          select: {
            name: true,
            email: true,
            timeZone: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
      take: limit,
    });
  }
}
