CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"ticket_id" uuid,
	"scan_id" uuid NOT NULL,
	"result" text NOT NULL,
	"scanned_by" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "check_ins_scan_unique" UNIQUE("organization_id","scan_id"),
	CONSTRAINT "check_ins_result_check" CHECK ("check_ins"."result" in ('accepted', 'duplicate', 'void', 'wrong_event', 'not_found'))
);
--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_scanned_by_user_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_fk" FOREIGN KEY ("organization_id","event_id") REFERENCES "public"."events"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_ins_event_idx" ON "check_ins" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "check_ins_ticket_idx" ON "check_ins" USING btree ("ticket_id");