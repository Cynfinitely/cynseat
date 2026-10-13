import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { TestApp } from "./test-app";

/**
 * The books must balance for every ticket type of an event:
 * reserved = what active holds contain, sold = valid tickets issued, and never over capacity.
 */
export async function expectInventoryConsistent(app: TestApp, eventId: string): Promise<void> {
  const { rows } = await app.db.execute<{
    name: string;
    capacity: number | null;
    qty_held: number;
    qty_sold: number;
    held: number;
    issued: number;
  }>(sql`
    select t.name, t.capacity, t.qty_held, t.qty_sold,
      coalesce((select sum(i.quantity) from hold_items i join holds h on h.id = i.hold_id
                where i.ticket_type_id = t.id and h.status = 'active'), 0)::int as held,
      coalesce((select count(*) from tickets k
                where k.ticket_type_id = t.id and k.status = 'valid'), 0)::int as issued
    from ticket_types t where t.event_id = ${eventId}`);
  for (const row of rows) {
    expect(row.qty_held, `${row.name}: reserved`).toBe(row.held);
    expect(row.qty_sold, `${row.name}: sold`).toBe(row.issued);
    // Ticket types sold by seat have no capacity of their own: the seats are the limit.
    if (row.capacity !== null) {
      expect(row.qty_held + row.qty_sold, `${row.name}: capacity`).toBeLessThanOrEqual(
        row.capacity,
      );
    }
  }

  // Every seat's state must agree with the holds and tickets that refer to it.
  const seats = await app.db.execute<{
    seat_key: string;
    status: string;
    held: boolean;
    tickets: number;
  }>(sql`
    select s.seat_key, s.status,
      exists(select 1 from holds h where h.id = s.hold_id and h.status = 'active') as held,
      (select count(*) from tickets k where k.event_seat_id = s.id and k.status = 'valid')::int as tickets
    from event_seats s where s.event_id = ${eventId}`);
  for (const seat of seats.rows) {
    expect(seat.held, `${seat.seat_key}: held by an active hold`).toBe(seat.status === "held");
    expect(seat.tickets, `${seat.seat_key}: valid tickets`).toBe(seat.status === "sold" ? 1 : 0);
  }
}
