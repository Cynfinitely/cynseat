import { z } from "zod";
import { isTimeZone } from "../time/zoned";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const venueSchema = z.object({
  name: z.string().trim().min(2, "too_short").max(120, "too_long"),
  addressLine1: z.string().trim().min(2, "too_short").max(160, "too_long"),
  addressLine2: optionalText(160),
  postalCode: optionalText(20),
  city: z.string().trim().min(1, "required").max(80, "too_long"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "invalid_country"),
  timezone: z.string().refine(isTimeZone, "invalid_time_zone"),
  capacity: z
    .union([
      z.literal(""),
      z.coerce
        .number("invalid_number")
        .int("invalid_number")
        .min(1, "too_small")
        .max(200_000, "too_large"),
    ])
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});
export type VenueInput = z.infer<typeof venueSchema>;

export const venueSearchSchema = z.object({
  query: z.string().trim().max(80).default(""),
});
