import { Client } from "pg";
import { DATABASE_URL } from "../../../playwright.config";

async function query<Row extends Record<string, unknown>>(
  text: string,
  values: unknown[],
): Promise<Row[]> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as Row[];
  } finally {
    await client.end();
  }
}

/**
 * The link in the latest email of this kind sent to `to`, read from the outbox.
 * Waits briefly, because the email is queued by the request that triggered it.
 */
export async function emailLink(to: string, template: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rows = await query<{ url: string }>(
      `select payload->'data'->>'url' as url from outbox_jobs
       where kind = 'email' and payload->>'to' = $1 and payload->>'template' = $2
       order by created_at desc limit 1`,
      [to, template],
    );
    if (rows[0]) return rows[0].url;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${template} email was queued for ${to}`);
}

export async function grantPlatformAdmin(email: string): Promise<void> {
  await query(
    `insert into platform_admins (user_id) select id from "user" where email = $1
     on conflict do nothing`,
    [email],
  );
}

/** Approves an organization directly; the approval screens have their own test. */
export async function approveOrganization(slug: string): Promise<void> {
  await query(
    `update org_profiles set approval_status = 'approved', reviewed_at = now()
     where organization_id = (select id from organization where slug = $1)`,
    [slug],
  );
}

/** Marks the organization as able to take payments, as if it had connected its account. */
export async function enablePayments(slug: string): Promise<void> {
  await query(
    `update org_profiles set stripe_account_id = 'acct_e2e_' || organization_id,
       stripe_charges_enabled = true
     where organization_id = (select id from organization where slug = $1)`,
    [slug],
  );
}

/** Ids of the tickets in the newest paid order of an email address. */
export async function ticketIdsFor(email: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select t.id from tickets t join orders o on o.id = t.order_id
     where o.email = $1 order by t.created_at, t.seq`,
    [email],
  );
  return rows.map((row) => row.id);
}
