import type { ZodArray, ZodObject, ZodTypeAny } from "zod";
import { z } from "zod";

export const UserForTeamOverviewDtoSchema: ZodObject<{
  username: ZodTypeAny;
  name: ZodTypeAny;
  bio: ZodTypeAny;
  avatarUrl: ZodTypeAny;
  bookingUrl: ZodTypeAny;
}> = z.object({
  username: z.string(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string(),
  bookingUrl: z.string(),
});

export type UserForTeamOverviewDto = z.infer<typeof UserForTeamOverviewDtoSchema>;

export const UserForTeamOverviewDtoArraySchema: ZodArray<typeof UserForTeamOverviewDtoSchema> = z.array(
  UserForTeamOverviewDtoSchema
);
