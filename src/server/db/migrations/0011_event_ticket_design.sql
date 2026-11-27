CREATE TABLE "event_ticket_designs" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"layout" text NOT NULL,
	"accent" text NOT NULL,
	"note" text NOT NULL,
	"artwork" text
);
--> statement-breakpoint
ALTER TABLE "event_ticket_designs" ADD CONSTRAINT "event_ticket_designs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;