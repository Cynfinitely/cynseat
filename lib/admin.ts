export const ADMIN_EMAILS = ["celalyasinnari@gmail.com", "aksu@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && ADMIN_EMAILS.includes(email));
}
