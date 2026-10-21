import { z } from "zod";
import { checkSlug } from "../slug/slug";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const slugSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const problem = checkSlug(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const profileFields = {
  contactEmail: z.email("invalid_email").max(254, "too_long"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "invalid_country"),
  legalName: optionalText(120),
  businessId: optionalText(40),
  website: z
    .union([
      z.literal(""),
      z.url({ protocol: /^https?$/, error: "invalid_url" }).max(200, "too_long"),
    ])
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  description: optionalText(1000),
};

export const registerOrganizationSchema = z.object({
  name: z.string().trim().min(2, "too_short").max(80, "too_long"),
  slug: slugSchema,
  ...profileFields,
});
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

export const updateOrgProfileSchema = z.object(profileFields);
export type UpdateOrgProfileInput = z.infer<typeof updateOrgProfileSchema>;

export const reviewDecisions = ["approve", "reject", "suspend"] as const;
export type ReviewDecision = (typeof reviewDecisions)[number];

export const reviewOrganizationSchema = z.object({
  organizationId: z.string().min(1),
  decision: z.enum(reviewDecisions),
  note: optionalText(500),
});
export type ReviewOrganizationInput = z.infer<typeof reviewOrganizationSchema>;
