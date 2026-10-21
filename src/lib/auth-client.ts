import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "@/server/auth/access";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
});
