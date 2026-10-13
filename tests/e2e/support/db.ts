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
