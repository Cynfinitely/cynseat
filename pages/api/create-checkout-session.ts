// pages/api/create-checkout-session.ts

import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_TEST_KEY!, {
  apiVersion: "2024-04-10",
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const { numTickets, totalCost } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: "Ticket",
              },
              unit_amount: totalCost * 100, // Stripe expects the amount in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          ...req.body.metadata,
          numTickets: numTickets.toString(), 
        },
        success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/cancel`,
      });

      res.status(200).json({ sessionId: session.id });
    } catch (error) {
      res.status(500).json({ error: "Error creating Checkout Session" });
    }
  } else {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
  }
}
