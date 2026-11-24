import { Client } from "pg";
import { DATABASE_URL } from "../../playwright.config";

export default async function setupMailbox() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(DATABASE_URL).hostname)) {
    throw new Error("The browser-test mailbox requires a local test database");
  }
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      create table if not exists e2e_mailbox (payload jsonb, created_at timestamptz);
      truncate e2e_mailbox;
      create or replace function e2e_capture_email() returns trigger language plpgsql as $$
      begin
        insert into e2e_mailbox values (new.payload, new.created_at);
        return new;
      end $$;
      create or replace trigger e2e_capture_email after insert on outbox_jobs
        for each row when (new.kind = 'email') execute function e2e_capture_email();
    `);
  } finally {
    await client.end();
  }
  return async () => {
    const cleanup = new Client({ connectionString: DATABASE_URL });
    await cleanup.connect();
    try {
      await cleanup.query(`
        drop trigger if exists e2e_capture_email on outbox_jobs;
        drop function if exists e2e_capture_email();
        drop table if exists e2e_mailbox;
      `);
    } finally {
      await cleanup.end();
    }
  };
}
