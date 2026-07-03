import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { describe, expect, it, vi } from "vitest";
import { TeamOverviewService } from "./TeamOverviewService";

const buildService = (users: Awaited<ReturnType<UserRepository["findManyOptedIntoTeamOverview"]>>) => {
  const userRepository = {
    findManyOptedIntoTeamOverview: vi.fn().mockResolvedValue(users),
  } as unknown as UserRepository;
  return new TeamOverviewService(userRepository);
};

describe("TeamOverviewService", () => {
  it("returns an empty list when no users opted in", async () => {
    const service = buildService([]);
    await expect(service.getMembers()).resolves.toEqual([]);
  });

  it("maps users to team overview DTOs with a booking url", async () => {
    const service = buildService([
      { username: "anna", name: "Anna", bio: null, avatarUrl: "https://example.com/anna.png" },
    ]);

    const members = await service.getMembers();

    expect(members).toEqual([
      {
        username: "anna",
        name: "Anna",
        bio: null,
        avatarUrl: "https://example.com/anna.png",
        bookingUrl: "/anna",
      },
    ]);
  });

  it("falls back to the default avatar when the user has none", async () => {
    const service = buildService([{ username: "bert", name: "Bert", bio: null, avatarUrl: null }]);

    const [member] = await service.getMembers();

    expect(member.avatarUrl).toEqual(expect.stringContaining("avatar"));
  });

  it("strips markdown from the bio", async () => {
    const service = buildService([
      { username: "carla", name: "Carla", bio: "**Sales** at _ACME_", avatarUrl: null },
    ]);

    const [member] = await service.getMembers();

    expect(member.bio).toBe("Sales at ACME");
  });

  it("filters out users without a username", async () => {
    const service = buildService([
      { username: null, name: "No Username", bio: null, avatarUrl: null },
      { username: "dora", name: "Dora", bio: null, avatarUrl: null },
    ]);

    const members = await service.getMembers();

    expect(members.map((member) => member.username)).toEqual(["dora"]);
  });
});
