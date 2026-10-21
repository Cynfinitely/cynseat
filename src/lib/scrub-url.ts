// Order links carry their access token in the path, and password resets in the query.
// Either one hands over tickets or an account, so neither may leave in an error report.
const ORDER_TOKEN = /(\/orders\/)[^/?#]+/g;

/** The URL without its query, fragment or order token. */
export function scrubUrl(url: string): string {
  return url.replace(/[?#].*$/, "").replace(ORDER_TOKEN, "$1[token]");
}
