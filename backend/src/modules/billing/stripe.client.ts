import Stripe from "stripe";

import { config } from "@config/index.js";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return config.stripe !== null;
}

export function requireStripe(): Stripe {
  if (!config.stripe) {
    throw new Error("Stripe is not configured (set STRIPE_SECRET_KEY)");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripeClient;
}
