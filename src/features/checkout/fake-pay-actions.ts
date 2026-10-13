"use server";

import { redirect } from "next/navigation";
import { getFakeGateway } from "@/server";

/** The buyer's choice on the stand-in payment page. Does nothing outside test mode. */
export async function settleFakePaymentAction(sessionId: string, pay: boolean): Promise<void> {
  const session = getFakeGateway()?.sessions.get(sessionId);
  if (!session) redirect("/");
  if (pay) getFakeGateway()?.pay(sessionId);
  redirect(pay ? session.request.successUrl : session.request.cancelUrl);
}
