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
    capacity: number;
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
    expect(row.qty_held + row.qty_sold, `${row.name}: capacity`).toBeLessThanOrEqual(row.capacity);
  }
}
