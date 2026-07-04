import type { PrismaClient } from "@calcom/prisma";

export class PrismaMcpUserRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findManyBookable({ search, limit }: { search?: string; limit: number }) {
    const hasVisiblePersonalEventType = { some: { hidden: false, teamId: null } };

    return this.prismaClient.user.findMany({
      where: {
        username: { not: null },
        OR: [{ ownedEventTypes: hasVisiblePersonalEventType }, { eventTypes: hasVisiblePersonalEventType }],
        ...(search
          ? {
              AND: {
                OR: [
                  { username: { contains: search, mode: "insensitive" as const } },
                  { name: { contains: search, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      select: {
        username: true,
        name: true,
        timeZone: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });
  }

  async findByUsername(username: string) {
    return this.prismaClient.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        timeZone: true,
      },
    });
  }
}
