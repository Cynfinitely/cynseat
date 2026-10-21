CREATE TABLE "refund_tickets" (
	"refund_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	CONSTRAINT "refund_tickets_refund_id_ticket_id_pk" PRIMARY KEY("refund_id","ticket_id"),
	CONSTRAINT "refund_tickets_ticket_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"restock" boolean DEFAULT false NOT NULL,
	"retries" integer DEFAULT 0 NOT NULL,
	"provider_refund_id" text,
	"failure_reason" text,
	"initiated_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refunds_provider_refund_id_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount" >= 0),
	CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" in ('pending', 'succeeded', 'failed')),
	CONSTRAINT "refunds_source_check" CHECK ("refunds"."source" in ('organizer', 'system'))
);
--> statement-breakpoint
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_tickets" ADD CONSTRAINT "refund_tickets_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_user_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_fk" FOREIGN KEY ("organization_id","order_id") REFERENCES "public"."orders"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_pending_idx" ON "refunds" USING btree ("created_at") WHERE "refunds"."status" = 'pending';