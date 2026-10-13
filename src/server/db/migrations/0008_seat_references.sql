-- Order lines and tickets point at seats of their own event. Declared here rather than in
-- the Drizzle schema because the seating tables already reference the order tables.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seat_fk" FOREIGN KEY ("event_id","event_seat_id") REFERENCES "public"."event_seats"("event_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_fk" FOREIGN KEY ("event_id","event_seat_id") REFERENCES "public"."event_seats"("event_id","id") ON DELETE restrict ON UPDATE no action;
