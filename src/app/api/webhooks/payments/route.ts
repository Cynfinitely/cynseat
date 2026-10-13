import { getApp } from "@/server";
import { handleGatewayEvent } from "@/server/modules/payments/service";

export const dynamic = "force-dynamic";

/** Notifications from the payment provider. Nothing is acted on before its signature verifies. */
export async function POST(request: Request): Promise<Response> {
  const app = getApp();
  // The signature covers the exact bytes sent, so read the body as text and do not re-encode it.
  const body = await request.text();
  const signature =
    request.headers.get("stripe-signature") ?? request.headers.get("x-cynseat-signature");

  let event;
  try {
    event = app.gateway.parseEvent(body, signature);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleGatewayEvent(app, event);
  } catch (error) {
    console.error("payment webhook failed", event.id, error);
    // A 5xx asks the provider to deliver the event again later.
    return new Response("Temporary failure", { status: 500 });
  }
  return Response.json({ received: true });
}
