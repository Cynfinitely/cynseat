import { describe, expect, it } from "vitest";
import {
  hashAccessToken,
  newOrderReference,
  orderAccessToken,
  parseTicketCode,
  ticketCode,
  ticketCodeMatches,
} from "./tokens";

const SECRET = "test-signing-secret-0123456789abcdef";
const TICKET = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("order access tokens", () => {
  it("are stable for an order and different between orders and secrets", () => {
    expect(orderAccessToken(SECRET, TICKET)).toBe(orderAccessToken(SECRET, TICKET));
    expect(orderAccessToken(SECRET, TICKET)).not.toBe(orderAccessToken(SECRET, OTHER));
    expect(orderAccessToken(SECRET, TICKET)).not.toBe(orderAccessToken("another-secret", TICKET));
    expect(orderAccessToken(SECRET, TICKET)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are stored only as a hash", () => {
    const token = orderAccessToken(SECRET, TICKET);
    expect(hashAccessToken(token)).toHaveLength(32);
    expect(hashAccessToken(token).equals(hashAccessToken(token))).toBe(true);
    expect(hashAccessToken(token).toString("base64url")).not.toBe(token);
  });
});

describe("ticket codes", () => {
  it("round-trip the ticket id and verify", () => {
    const code = ticketCode(SECRET, TICKET, 1);
    expect(code).toMatch(/^CS1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    const parsed = parseTicketCode(` ${code}\n`);
    expect(parsed?.ticketId).toBe(TICKET);
    expect(ticketCodeMatches(SECRET, parsed!, 1)).toBe(true);
  });

  it("stop working when the ticket is reissued", () => {
    const parsed = parseTicketCode(ticketCode(SECRET, TICKET, 1))!;
    expect(ticketCodeMatches(SECRET, parsed, 2)).toBe(false);
  });

  it("cannot be forged without the secret or moved to another ticket", () => {
    const forged = parseTicketCode(ticketCode("guessed-secret", TICKET, 1))!;
    expect(ticketCodeMatches(SECRET, forged, 1)).toBe(false);

    const [prefix, , checksum] = ticketCode(SECRET, TICKET, 1).split(".");
    const otherId = ticketCode(SECRET, OTHER, 1).split(".")[1];
    const swapped = parseTicketCode(`${prefix}.${otherId}.${checksum}`)!;
    expect(swapped.ticketId).toBe(OTHER);
    expect(ticketCodeMatches(SECRET, swapped, 1)).toBe(false);
  });

  it.each([
    "",
    "hello",
    "CS1.abc",
    "CS2.P2uMHppNTm-LehwtPk9aaw.AAAAAAAAAAAAAAAAAAAAAA",
    "CS1.short.AAAAAAAAAAAAAAAAAAAAAA",
    "CS1.P2uMHppNTm-LehwtPk9aaw.short",
    "CS1.P2uMHppNTm-LehwtPk9aaw.AAAAAAAAAAAAAAAAAAAAAA.extra",
    "https://evil.test/?q=CS1.x.y",
  ])("reject malformed input %j", (code) => {
    expect(parseTicketCode(code)).toBeNull();
  });
});

describe("order references", () => {
  it("are eight unambiguous characters and do not repeat", () => {
    const references = new Set(Array.from({ length: 500 }, () => newOrderReference()));
    expect(references.size).toBe(500);
    for (const reference of references) expect(reference).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
  });
});
