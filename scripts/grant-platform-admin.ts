// Makes an existing user a CynSeat platform admin: pnpm admin:grant someone@example.com
import { config } from "dotenv";
import { createDb } from "../src/server/db/client";
import { grantPlatformAdmin } from "../src/server/modules/orgs/service";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  const email = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!email || !url) {
    console.error("Usage: pnpm admin:grant <email>   (DATABASE_URL must be set)");
    process.exit(1);
  }
  const { db, pool } = createDb(url, { max: 1 });
  try {
    if (await grantPlatformAdmin(db, email)) console.log(`${email} is now a platform admin.`);
    else {
      console.error(`No user with the email ${email}. They need to sign up first.`);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
