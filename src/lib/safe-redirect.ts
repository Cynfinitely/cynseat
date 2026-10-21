const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Returns `returnUrl` only when it is a same-site relative path, otherwise `fallback`.
 * Browsers treat `\` like `/` and strip tabs/newlines, so `/\evil.com` and
 * `/\t/evil.com` would otherwise leave the site.
 */
export function getSafeReturnUrl(
  returnUrl: string | string[] | null | undefined,
  fallback = "/",
): string {
  const raw = Array.isArray(returnUrl) ? returnUrl[0] : returnUrl;
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.includes("\\") || CONTROL_CHARS.test(raw)) return fallback;
  return raw;
}
