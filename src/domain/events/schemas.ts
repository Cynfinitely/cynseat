import { z } from "zod";
import { currencies } from "../money/money";
import { isTimeZone } from "../time/zoned";
import {
  contentLocales,
  eventCategories,
  eventVisibilities,
  MAX_TICKETS_PER_ORDER_LIMIT,
} from "./types";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .transform((value) => (value === "" ? undefined : value))
    .optional();

/** Wall-clock time in the event's zone, as an <input type="datetime-local"> produces it. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "invalid_date");
const optionalLocalDateTime = z
  .union([z.literal(""), localDateTime])
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const timeZone = z.string().refine(isTimeZone, "invalid_time_zone");
const title = z.string().trim().min(2, "too_short").max(120, "too_long");

export const createEventSchema = z.object({
  title,
  locale: z.enum(contentLocales),
  category: z.enum(eventCategories),
  timezone: timeZone,
  startsAt: localDateTime,
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  category: z.enum(eventCategories),
  visibility: z.enum(eventVisibilities),
  timezone: timeZone,
  startsAt: localDateTime,
  endsAt: optionalLocalDateTime,
  doorsAt: optionalLocalDateTime,
  currency: z.enum(currencies),
  maxTicketsPerOrder: z.coerce
    .number("invalid_number")
    .int("invalid_number")
    .min(1, "too_small")
    .max(MAX_TICKETS_PER_ORDER_LIMIT, "too_large"),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventTranslationSchema = z.object({
  locale: z.enum(contentLocales),
  title,
  summary: optionalText(200),
  description: optionalText(5000),
});
export type EventTranslationInput = z.infer<typeof eventTranslationSchema>;

export const eventVenueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("venue"), venueId: z.uuid("invalid_venue") }),
  z.object({ kind: z.literal("online") }),
  z.object({ kind: z.literal("none") }),
]);
export type EventVenueInput = z.infer<typeof eventVenueSchema>;

/** Prices arrive as typed text ("12,50") and are parsed against the event's currency. */
export const ticketTypeSchema = z.object({
  name: z.string().trim().min(1, "required").max(80, "too_long"),
  description: optionalText(300),
  price: z.string().trim().min(1, "required").max(12, "invalid_price"),
  capacity: z.coerce
    .number("invalid_number")
    .int("invalid_number")
    .min(1, "too_small")
    .max(100_000, "too_large"),
  salesStartAt: optionalLocalDateTime,
  salesEndAt: optionalLocalDateTime,
  maxPerOrder: z
    .union([
      z.literal(""),
      z.coerce
        .number("invalid_number")
        .int("invalid_number")
        .min(1, "too_small")
        .max(MAX_TICKETS_PER_ORDER_LIMIT, "too_large"),
    ])
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});
export type TicketTypeInput = z.infer<typeof ticketTypeSchema>;

export const cancelEventSchema = z.object({ reason: optionalText(500) });
