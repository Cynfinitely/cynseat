export function getSafeReturnUrl(
  returnUrl?: string | string[] | null
): string {
  const raw = Array.isArray(returnUrl) ? returnUrl[0] : returnUrl;
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/tickets";
}

export function getBuyTicketsHref(isSignedIn: boolean): string {
  return isSignedIn ? "/tickets" : "/signIn?returnUrl=/tickets";
}
