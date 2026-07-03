import type { PrismaClient } from "@calcom/prisma";

export class PrismaMcpUserRepository {
  constructor(private prismaClient: PrismaClient) {}

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
