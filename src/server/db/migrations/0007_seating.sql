CREATE TABLE "event_seat_maps" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"layout" jsonb NOT NULL,
	"source_seat_map_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"event_section_id" uuid NOT NULL,
	"seat_key" text NOT NULL,
	"row_label" text NOT NULL,
	"seat_label" text NOT NULL,
	"accessible" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"hold_id" uuid,
	"held_ticket_type_id" uuid,
	CONSTRAINT "event_seats_key_unique" UNIQUE("event_id","seat_key"),
	CONSTRAINT "event_seats_event_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "event_seats_status_check" CHECK ("event_seats"."status" in ('available', 'held', 'sold', 'blocked')),
	CONSTRAINT "event_seats_hold_check" CHECK (("event_seats"."status" = 'held') = ("event_seats"."hold_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "event_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_sections_key_unique" UNIQUE("event_id","section_key"),
	CONSTRAINT "event_sections_event_id_unique" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "seat_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb NOT NULL,
	"seat_count" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seat_maps_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "seat_maps_seat_count_check" CHECK ("seat_maps"."seat_count" between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "ticket_type_sections" (
	"ticket_type_id" uuid NOT NULL,
	"event_section_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "ticket_type_sections_ticket_type_id_event_section_id_pk" PRIMARY KEY("ticket_type_id","event_section_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "event_seat_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "event_seat_id" uuid;--> statement-breakpoint
ALTER TABLE "event_seat_maps" ADD CONSTRAINT "event_seat_maps_source_seat_map_id_seat_maps_id_fk" FOREIGN KEY ("source_seat_map_id") REFERENCES "public"."seat_maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seat_maps" ADD CONSTRAINT "event_seat_maps_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_section_fk" FOREIGN KEY ("event_id","event_section_id") REFERENCES "public"."event_sections"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seats" ADD CONSTRAINT "event_seats_held_type_fk" FOREIGN KEY ("event_id","held_ticket_type_id") REFERENCES "public"."ticket_types"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sections" ADD CONSTRAINT "event_sections_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_maps" ADD CONSTRAINT "seat_maps_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_maps" ADD CONSTRAINT "seat_maps_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_maps" ADD CONSTRAINT "seat_maps_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_sections" ADD CONSTRAINT "ticket_type_sections_type_fk" FOREIGN KEY ("event_id","ticket_type_id") REFERENCES "public"."ticket_types"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_type_sections" ADD CONSTRAINT "ticket_type_sections_section_fk" FOREIGN KEY ("event_id","event_section_id") REFERENCES "public"."event_sections"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_seats_event_status_idx" ON "event_seats" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "event_seats_hold_idx" ON "event_seats" USING btree ("hold_id") WHERE "event_seats"."hold_id" is not null;--> statement-breakpoint
CREATE INDEX "seat_maps_org_venue_idx" ON "seat_maps" USING btree ("organization_id","venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_one_valid_per_seat" ON "tickets" USING btree ("event_seat_id") WHERE "tickets"."status" = 'valid' and "tickets"."event_seat_id" is not null;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seat_check" CHECK ("order_items"."event_seat_id" is null or "order_items"."quantity" = 1);