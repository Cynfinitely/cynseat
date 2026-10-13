import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "../../../../tests/integration/test-db";
import { createDb } from "../../db/client";
import { checkHealth } from "./service";

describe("checkHealth", () => {
  const getDb = useTestDb();

  it("reports ok when the database answers", async () => {
    expect(await checkHealth(getDb().db)).toEqual({ status: "ok", database: true });
  });

  it("reports degraded when the database is unreachable", async () => {
    const { db, pool } = createDb("postgres://nobody:nothing@127.0.0.1:1/none", { max: 1 });
    expect(await checkHealth(db)).toEqual({ status: "degraded", database: false });
    await pool.end();
  });
});

// Guards the harness itself: later inventory tests rely on real row locks across connections.
describe("integration harness", () => {
  const getDb = useTestDb();

  it("runs transactions on separate connections with real row locking", async () => {
    const { db } = getDb();
    await db.execute(sql`create table counter (id int primary key, remaining int not null)`);
    await db.execute(sql`insert into counter values (1, 10)`);

    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        db.transaction(async (tx) => {
          const taken = await tx.execute(
            sql`update counter set remaining = remaining - 1 where id = 1 and remaining > 0 returning id`,
          );
          return taken.rowCount === 1;
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(10);
    const { rows } = await db.execute(sql`select remaining from counter where id = 1`);
    expect(rows[0]).toEqual({ remaining: 0 });
  });
});
