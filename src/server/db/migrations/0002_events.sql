CREATE TABLE "event_translations" (
	"event_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_translations_event_id_locale_pk" PRIMARY KEY("event_id","locale"),
	CONSTRAINT "event_translations_locale_check" CHECK ("event_translations"."locale" in ('en', 'fi', 'tr'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"sales_paused" boolean DEFAULT false NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"default_locale" text NOT NULL,
	"timezone" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"doors_at" timestamp with time zone,
	"venue_id" uuid,
	"venue_snapshot" jsonb,
	"is_online" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"max_tickets_per_order" integer DEFAULT 10 NOT NULL,
	"cover_image_url" text,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_org_slug_unique" UNIQUE("organization_id","slug"),
	CONSTRAINT "events_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "events_status_check" CHECK ("events"."status" in ('draft', 'published', 'cancelled')),
	CONSTRAINT "events_visibility_check" CHECK ("events"."visibility" in ('public', 'unlisted')),
	CONSTRAINT "events_category_check" CHECK ("events"."category" in ('music', 'theatre', 'film', 'sports', 'festival', 'conference', 'workshop', 'community', 'other')),
	CONSTRAINT "events_currency_check" CHECK ("events"."currency" ~ '^[a-z]{3}$'),
	CONSTRAINT "events_ends_check" CHECK ("events"."ends_at" is null or "events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_doors_check" CHECK ("events"."doors_at" is null or "events"."doors_at" <= "events"."starts_at"),
	CONSTRAINT "events_max_per_order_check" CHECK ("events"."max_tickets_per_order" between 1 and 50),
	CONSTRAINT "events_published_check" CHECK ("events"."status" <> 'published' or "events"."published_at" is not null),
	CONSTRAINT "events_place_check" CHECK (not ("events"."is_online" and "events"."venue_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text DEFAULT 'ga' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_amount" integer NOT NULL,
	"capacity" integer,
	"qty_held" integer DEFAULT 0 NOT NULL,
	"qty_sold" integer DEFAULT 0 NOT NULL,
	"sales_start_at" timestamp with time zone,
	"sales_end_at" timestamp with time zone,
	"max_per_order" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_event_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "ticket_types_kind_check" CHECK ("ticket_types"."kind" in ('ga', 'seated')),
	CONSTRAINT "ticket_types_price_check" CHECK ("ticket_types"."price_amount" >= 0),
	CONSTRAINT "ticket_types_capacity_kind_check" CHECK (("ticket_types"."kind" = 'ga') = ("ticket_types"."capacity" is not null)),
	CONSTRAINT "ticket_types_counts_check" CHECK ("ticket_types"."qty_held" >= 0 and "ticket_types"."qty_sold" >= 0),
	CONSTRAINT "ticket_types_no_oversell_check" CHECK ("ticket_types"."kind" <> 'ga' or "ticket_types"."qty_held" + "ticket_types"."qty_sold" <= "ticket_types"."capacity"),
	CONSTRAINT "ticket_types_sales_window_check" CHECK ("ticket_types"."sales_start_at" is null or "ticket_types"."sales_end_at" is null or "ticket_types"."sales_end_at" > "ticket_types"."sales_start_at"),
	CONSTRAINT "ticket_types_max_per_order_check" CHECK ("ticket_types"."max_per_order" is null or "ticket_types"."max_per_order" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"postal_code" text,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"timezone" text NOT NULL,
	"capacity" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid,
	"created_by_org_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_status_check" CHECK ("venues"."status" in ('active', 'hidden', 'merged')),
	CONSTRAINT "venues_country_check" CHECK ("venues"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "venues_capacity_check" CHECK ("venues"."capacity" is null or "venues"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_created_by_org_id_organization_id_fk" FOREIGN KEY ("created_by_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_merged_into_id_venues_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_public_idx" ON "events" USING btree ("starts_at") WHERE "events"."status" = 'published' and "events"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "events_org_idx" ON "events" USING btree ("organization_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ticket_types_event_idx" ON "ticket_types" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "venues_name_idx" ON "venues" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "venues_city_idx" ON "venues" USING btree ("country",lower("city"));