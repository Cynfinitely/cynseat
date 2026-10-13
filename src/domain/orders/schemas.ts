import { z } from "zod";
import { contentLocales } from "../events/types";

export const cartSchema = z.object({
  eventId: z.uuid(),
  lines: z
    .array(
      z.object({
        ticketTypeId: z.uuid(),
        quantity: z.number().int().min(0).max(50),
      }),
    )
    .max(20),
});
export type CartInput = z.infer<typeof cartSchema>;

export const checkoutSchema = z.object({
  eventId: z.uuid(),
  email: z.email("invalid_email").max(254, "too_long"),
  name: z.string().trim().min(2, "too_short").max(80, "too_long"),
  locale: z.enum(contentLocales),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
