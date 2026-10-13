import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

const mac = (secret: string, message: string): Buffer =>
  createHmac("sha256", secret).update(message).digest();

// ---- Order links -------------------------------------------------------------------------

/**
 * The secret in a buyer's order link. Derived from the order id, so it can be rebuilt for
 * a confirmation email at any time; only its hash is stored, so a database leak does not
 * hand out working links.
 */
export function orderAccessToken(secret: string, orderId: string): string {
  return mac(secret, `order:${orderId}`).toString("base64url");
}

export function hashAccessToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

// ---- Ticket QR codes ---------------------------------------------------------------------

const TICKET_PREFIX = "CS1";
const TICKET_MAC_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ticketMac = (secret: string, ticketId: string, version: number): Buffer =>
  mac(secret, `ticket:${ticketId}:${version}`).subarray(0, TICKET_MAC_BYTES);

/**
 * What a ticket's QR code contains: the ticket id and a keyed checksum. It says nothing
 * about validity; the scanner always asks the server. Raising the ticket's version makes
 * every earlier code for it worthless.
 */
export function ticketCode(secret: string, ticketId: string, version: number): string {
  const id = Buffer.from(ticketId.replace(/-/g, ""), "hex").toString("base64url");
  return `${TICKET_PREFIX}.${id}.${ticketMac(secret, ticketId, version).toString("base64url")}`;
}

/** The ticket id inside a scanned code, or null if it is not shaped like one of ours. */
export function parseTicketCode(code: string): { ticketId: string; mac: Buffer } | null {
  const [prefix, id, checksum, ...rest] = code.trim().split(".");
  if (prefix !== TICKET_PREFIX || !id || !checksum || rest.length > 0) return null;
  const hex = Buffer.from(id, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const ticketId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const given = Buffer.from(checksum, "base64url");
  if (!UUID.test(ticketId) || given.length !== TICKET_MAC_BYTES) return null;
  return { ticketId, mac: given };
}

/** Whether a scanned checksum is the right one for this ticket at its current version. */
export function ticketCodeMatches(
  secret: string,
  parsed: { ticketId: string; mac: Buffer },
  version: number,
): boolean {
  return timingSafeEqual(parsed.mac, ticketMac(secret, parsed.ticketId, version));
}

// ---- Order references --------------------------------------------------------------------

// No 0/O or 1/I/L, so a reference survives being read out over the phone.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A short, random, non-sequential order reference such as "K7QM2XWP". */
export function newOrderReference(length = 8): string {
  return Array.from(
    { length },
    () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)],
  ).join("");
}
