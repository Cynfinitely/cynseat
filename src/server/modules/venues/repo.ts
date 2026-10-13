import { and, eq, ilike, or, sql } from "drizzle-orm";
import { venues } from "../../db/schema";
import type { DbOrTx } from "../notifications/service";

export type Venue = typeof venues.$inferSelect;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function searchActiveVenues(
  db: DbOrTx,
  query: string,
  limit: number,
): Promise<Venue[]> {
  const pattern = `%${escapeLike(query)}%`;
  return db
    .select()
    .from(venues)
    .where(
      and(
        eq(venues.status, "active"),
        query ? or(ilike(venues.name, pattern), ilike(venues.city, pattern)) : undefined,
      ),
    )
    .orderBy(sql`lower(${venues.name})`)
    .limit(limit);
}

export async function findVenueById(db: DbOrTx, id: string): Promise<Venue | undefined> {
  const [row] = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return row;
}

/** An active venue with the same name in the same city, to stop accidental duplicates. */
export async function findDuplicateVenue(
  db: DbOrTx,
  input: { name: string; city: string; country: string },
): Promise<Venue | undefined> {
  const [row] = await db
    .select()
    .from(venues)
    .where(
      and(
        eq(venues.status, "active"),
        eq(venues.country, input.country),
        eq(sql`lower(${venues.name})`, input.name.toLowerCase()),
        eq(sql`lower(${venues.city})`, input.city.toLowerCase()),
      ),
    )
    .limit(1);
  return row;
}

export async function insertVenue(db: DbOrTx, values: typeof venues.$inferInsert): Promise<Venue> {
  const [row] = await db.insert(venues).values(values).returning();
  return row!;
}

export async function updateVenueById(
  db: DbOrTx,
  id: string,
  values: Partial<typeof venues.$inferInsert>,
): Promise<void> {
  await db.update(venues).set(values).where(eq(venues.id, id));
}
