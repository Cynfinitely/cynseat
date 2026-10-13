"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getFakeGateway } from "@/server";

/** The buyer's choice on the stand-in payment page. Does nothing outside test mode. */
export async function settleFakePaymentAction(sessionId: string, pay: boolean): Promise<void> {
  const gateway = getFakeGateway();
  const session = gateway?.sessions.get(sessionId);
  if (!gateway || !session) redirect("/");

  if (pay && gateway.pay(sessionId)) {
    // Tell the app the way the real provider would: a signed notification to the webhook.
    const { body, signature } = gateway.notification({
      type: "checkout.session.completed",
      accountId: session.accountId,
      checkoutSessionId: session.id,
      orderId: session.orderId,
    });
    await fetch(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/webhooks/payments`, {
      method: "POST",
      headers: { "x-cynseat-signature": signature },
      body,
    }).catch(() => {
      // A lost notification is fine: the order page checks with the gateway on return.
    });
  }
  redirect(pay ? session.request.successUrl : session.request.cancelUrl);
}
