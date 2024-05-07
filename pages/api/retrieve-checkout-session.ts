// pages/api/retrieve-checkout-session.ts

import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_TEST_KEY!, {
  apiVersion: "2024-04-10",
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        req.query.id as string
      );
      res.status(200).json({ session });
    } catch (error) {
      res.status(500).json({ error: "Error retrieving Checkout Session" });
    }
  } else {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
  }
}
