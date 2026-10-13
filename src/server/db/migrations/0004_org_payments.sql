ALTER TABLE "org_profiles" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD COLUMN "stripe_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD COLUMN "stripe_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD COLUMN "fee_bps" integer;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD COLUMN "fee_fixed_minor" integer;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_stripe_account_id_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_fee_check" CHECK (("org_profiles"."fee_bps" is null or "org_profiles"."fee_bps" between 0 and 10000) and ("org_profiles"."fee_fixed_minor" is null or "org_profiles"."fee_fixed_minor" >= 0));