ALTER TABLE "events" ADD COLUMN "minimum_age" integer;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "age_group" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_minimum_age_check" CHECK ("events"."minimum_age" between 1 and 120);