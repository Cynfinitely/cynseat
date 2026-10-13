CREATE TABLE "hold_items" (
	"hold_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "hold_items_hold_id_ticket_type_id_pk" PRIMARY KEY("hold_id","ticket_type_id"),
	CONSTRAINT "hold_items_quantity_check" CHECK ("hold_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"buyer_session_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"phase" text DEFAULT 'cart' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "holds_event_id_unique" UNIQUE("event_id","id"),
	CONSTRAINT "holds_status_check" CHECK ("holds"."status" in ('active', 'converted', 'released', 'expired')),
	CONSTRAINT "holds_phase_check" CHECK ("holds"."phase" in ('cart', 'checkout'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_amount" integer NOT NULL,
	"line_total_amount" integer NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_check" CHECK ("order_items"."unit_price_amount" >= 0),
	CONSTRAINT "order_items_total_check" CHECK ("order_items"."line_total_amount" = "order_items"."unit_price_amount" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"hold_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"email" text NOT NULL,
	"buyer_name" text NOT NULL,
	"user_id" text,
	"locale" text NOT NULL,
	"currency" text NOT NULL,
	"total_amount" integer NOT NULL,
	"application_fee_amount" integer DEFAULT 0 NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"payment_provider" text NOT NULL,
	"stripe_account_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"checkout_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"access_token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "orders_hold_id_unique" UNIQUE("hold_id"),
	CONSTRAINT "orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "orders_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "orders_org_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('pending', 'paid', 'expired', 'cancelled', 'unfulfillable')),
	CONSTRAINT "orders_provider_check" CHECK ("orders"."payment_provider" in ('stripe', 'none')),
	CONSTRAINT "orders_total_check" CHECK ("orders"."total_amount" >= 0),
	CONSTRAINT "orders_fee_check" CHECK ("orders"."application_fee_amount" between 0 and "orders"."total_amount"),
	CONSTRAINT "orders_refunded_check" CHECK ("orders"."refunded_amount" between 0 and "orders"."total_amount"),
	CONSTRAINT "orders_free_check" CHECK (("orders"."payment_provider" = 'none') = ("orders"."total_amount" = 0)),
	CONSTRAINT "orders_paid_check" CHECK ("orders"."status" <> 'paid' or "orders"."paid_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"account_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"token_version" integer DEFAULT 1 NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" text,
	"check_in_scan_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tickets_item_seq_unique" UNIQUE("order_item_id","seq"),
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."status" in ('valid', 'void')),
	CONSTRAINT "tickets_seq_check" CHECK ("tickets"."seq" > 0)
);
--> statement-breakpoint
ALTER TABLE "hold_items" ADD CONSTRAINT "hold_items_hold_fk" FOREIGN KEY ("event_id","hold_id") REFERENCES "public"."holds"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_items" ADD CONSTRAINT "hold_items_ticket_type_fk" FOREIGN KEY ("event_id","ticket_type_id") REFERENCES "public"."ticket_types"("event_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_fk" FOREIGN KEY ("event_id","ticket_type_id") REFERENCES "public"."ticket_types"("event_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_user_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holds_one_active_per_buyer" ON "holds" USING btree ("event_id","buyer_session_id") WHERE "holds"."status" = 'active';--> statement-breakpoint
CREATE INDEX "holds_expiry_idx" ON "holds" USING btree ("expires_at") WHERE "holds"."status" = 'active';--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_event_idx" ON "orders" USING btree ("organization_id","event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_pending_idx" ON "orders" USING btree ("checkout_expires_at") WHERE "orders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_events_unprocessed_idx" ON "payment_events" USING btree ("received_at") WHERE "payment_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_event_idx" ON "tickets" USING btree ("organization_id","event_id","status");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");