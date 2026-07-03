import { getLocale } from "@calcom/features/auth/lib/getLocale";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { TeamOverviewService } from "@calcom/features/users/services/TeamOverviewService";
import { getTranslation } from "@calcom/i18n/server";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

const TeamOverviewPage = async () => {
  const legacyRequest = buildLegacyRequest(await headers(), await cookies());
  const session = await getServerSession({ req: legacyRequest });

  // Logged-in users go straight to the app so the post-login flow keeps working
  if (session?.user?.id) {
    const organizationId = session.user.profile?.organizationId ?? null;
    const onboardingPath = await checkOnboardingRedirect(session.user.id, {
      checkEmailVerification: true,
      organizationId,
    });
    if (onboardingPath) {
      redirect(onboardingPath);
    }
    redirect("/event-types");
  }

  const locale = (await getLocale(legacyRequest)) ?? "en";
  const t = await getTranslation(locale, "common");

  const teamOverviewService = new TeamOverviewService(new UserRepository(prisma));
  const members = await teamOverviewService.getMembers();

  return (
    <main className="bg-default min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <header className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="font-cal text-emphasis text-3xl">{t("team_overview_title")}</h1>
            <p className="text-subtle mt-2 text-sm">{t("team_overview_description")}</p>
          </div>
          <Link
            href="/auth/login"
            className="text-default hover:bg-subtle border-subtle rounded-md border px-4 py-2 text-sm font-medium">
            {t("sign_in")}
          </Link>
        </header>

        {members.length === 0 ? (
          <p className="text-subtle text-sm">{t("team_overview_empty")}</p>
        ) : (
          <ul className="border-subtle divide-subtle divide-y rounded-md border">
            {members.map((member) => (
              <li key={member.username}>
                <Link
                  href={member.bookingUrl}
                  className="hover:bg-muted flex items-center gap-4 px-4 py-4 sm:px-6"
                  data-testid={`team-overview-member-${member.username}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={member.avatarUrl} alt="" className="h-12 w-12 rounded-full" loading="lazy" />
                  <div className="min-w-0">
                    <p className="text-emphasis truncate text-sm font-semibold">
                      {member.name ?? member.username}
                    </p>
                    {member.bio && <p className="text-subtle truncate text-sm">{member.bio}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default TeamOverviewPage;
