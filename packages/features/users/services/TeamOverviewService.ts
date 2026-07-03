import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { UserForTeamOverviewDto } from "@calcom/lib/dto/UserForTeamOverviewDto";
import { UserForTeamOverviewDtoArraySchema } from "@calcom/lib/dto/UserForTeamOverviewDto";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { stripMarkdown } from "@calcom/lib/stripMarkdown";

export class TeamOverviewService {
  constructor(private readonly userRepository: UserRepository) {}

  async getMembers(): Promise<UserForTeamOverviewDto[]> {
    const users = await this.userRepository.findManyOptedIntoTeamOverview();

    const members = users
      .filter((user): user is typeof user & { username: string } => Boolean(user.username))
      .map((user) => ({
        username: user.username,
        name: user.name,
        bio: user.bio ? stripMarkdown(user.bio) : null,
        avatarUrl: getUserAvatarUrl(user),
        bookingUrl: `/${user.username}`,
      }));

    return UserForTeamOverviewDtoArraySchema.parse(members);
  }
}
