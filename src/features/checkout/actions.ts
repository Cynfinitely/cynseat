"use server";

import { z } from "zod";
import { runAction, type ActionResult } from "@/app/_lib/action";
import { ensureBuyer, getBuyer } from "@/app/_lib/buyer";
import { enforceRateLimit } from "@/app/_lib/rate-limit";
import { cartSchema, checkoutSchema } from "@/domain/orders/schemas";
import { getApp } from "@/server";
import { cancelCheckout, startCheckout } from "@/server/modules/checkout/service";
import { setCart } from "@/server/modules/inventory/service";

/** Reserves the chosen tickets for this browser. */
export async function setCartAction(input: unknown): Promise<ActionResult> {
  return runAction(cartSchema, input, async (data) => {
    await enforceRateLimit("cart");
    await setCart(getApp(), await ensureBuyer(), data.eventId, data.lines, data.seats);
    return undefined;
  });
}

/** Creates the order. Returns where to send the buyer next: the payment page or their tickets. */
export async function startCheckoutAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(checkoutSchema, input, async (data) => {
    await enforceRateLimit("checkout");
    const started = await startCheckout(getApp(), await ensureBuyer(), data);
    return {
      url:
        started.kind === "payment" ? started.url : `/${data.locale}/orders/${started.accessToken}`,
    };
  });
}

/** Abandons a payment in progress so the cart can be changed. */
export async function cancelCheckoutAction(eventId: unknown): Promise<ActionResult> {
  return runAction(z.uuid(), eventId, async (id) => {
    const buyer = await getBuyer();
    if (buyer) await cancelCheckout(getApp(), buyer, id);
    return undefined;
  });
}
