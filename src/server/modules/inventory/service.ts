import { CART_HOLD_SECONDS } from "../../../domain/orders/types";
import type { Db } from "../../db/client";
import { transactionWithRetry } from "../../db/retry";
import { conflict, invalid } from "../../errors";
import type { Clock } from "../../ports/clock";
import type { DbOrTx } from "../notifications/service";
import * as repo from "./repo";

type Deps = { db: Db; clock: Clock };

/** Whoever is shopping: a browser session, signed in or not. */
export type Buyer = { sessionId: string; userId: string | null };

export type CartLineInput = { ticketTypeId: string; quantity: number };

export type CartSeat = {
  seatId: string;
  sectionName: string;
  rowLabel: string;
  seatLabel: string;
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceAmount: number;
};

export type Cart = {
  holdId: string;
  eventId: string;
  expiresAt: Date;
  phase: "cart" | "checkout";
  currency: string;
  lines: { ticketTypeId: string; name: string; quantity: number; unitPriceAmount: number }[];
  /** Reserved seats, each with the ticket type chosen for it. */
  seats: CartSeat[];
  totalAmount: number;
  totalQuantity: number;
};

const plusSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

/**
 * Gives back everything reserved by the holds just closed. Ticket types are always
 * updated in id order, here and everywhere else, so transactions cannot deadlock on them.
 */
export async function returnHeldInventory(tx: DbOrTx, holdIds: string[]): Promise<void> {
  for (const item of await repo.sumHoldItems(tx, holdIds)) await repo.unreserve(tx, item);
  await repo.releaseSeats(tx, holdIds);
}

async function returnInventory(tx: DbOrTx, holdIds: string[], now: Date): Promise<void> {
  await returnHeldInventory(tx, holdIds);
  await repo.expirePendingOrders(tx, holdIds, now);
}

/** Frees the tickets of every hold on this event whose time is up. Safe to run concurrently. */
export async function releaseExpiredHolds(tx: DbOrTx, eventId: string, now: Date): Promise<number> {
  const closed = await repo.closeHolds(tx, {
    status: "expired",
    now,
    where: { eventId, expiredBy: now },
  });
  await returnInventory(tx, closed, now);
  return closed.length;
}

async function cartOf(tx: DbOrTx, hold: repo.HoldRow, currency: string): Promise<Cart> {
  const items = await repo.findHoldItems(tx, hold.id);
  const types = await repo.findCartTypes(
    tx,
    hold.eventId,
    items.map((item) => item.ticketTypeId),
  );
  const seats = (await repo.findHeldSeats(tx, hold.id)).map(
    ({ sectionId: _sectionId, ...seat }) => seat,
  );
  const lines = items.map((item) => {
    const type = types.find((candidate) => candidate.id === item.ticketTypeId)!;
    return {
      ticketTypeId: item.ticketTypeId,
      name: type.name,
      quantity: item.quantity,
      unitPriceAmount: type.priceAmount,
    };
  });
  return {
    holdId: hold.id,
    eventId: hold.eventId,
    expiresAt: hold.expiresAt,
    phase: hold.phase,
    currency,
    lines,
    seats,
    totalAmount:
      lines.reduce((sum, line) => sum + line.quantity * line.unitPriceAmount, 0) +
      seats.reduce((sum, seat) => sum + seat.unitPriceAmount, 0),
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0) + seats.length,
  };
}

/**
 * Sets the buyer's cart for an event to exactly `lines` and `seats`, reserving or freeing
 * tickets as needed. All or nothing: if anything cannot be reserved the cart is left as it
 * was. Returns null when the cart ends up empty.
 */
export async function setCart(
  deps: Deps,
  buyer: Buyer,
  eventId: string,
  lines: CartLineInput[],
  seats: repo.SeatChoice[] = [],
): Promise<Cart | null> {
  if (new Set(seats.map((seat) => seat.seatId)).size !== seats.length || seats.length > 50) {
    throw invalid("invalid_quantity");
  }
  const wanted = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0 || line.quantity > 50) {
      throw invalid("invalid_quantity");
    }
    wanted.set(line.ticketTypeId, (wanted.get(line.ticketTypeId) ?? 0) + line.quantity);
  }
  const totalWanted =
    [...wanted.values()].reduce((sum, quantity) => sum + quantity, 0) + seats.length;

  return transactionWithRetry(deps.db, async (tx) => {
    const now = deps.clock.now();
    const event = await repo.lockSellableEvent(tx, eventId);
    if (!event) throw conflict("not_on_sale");
    if (totalWanted > event.maxTicketsPerOrder) {
      throw conflict("too_many_tickets", { max: String(event.maxTicketsPerOrder) });
    }

    // Lapsed holds first, the buyer's own included, so their tickets are available again.
    // This runs before the buyer's hold is locked: every transaction takes hold locks in
    // the same order, which is what keeps concurrent sweeps from deadlocking.
    await releaseExpiredHolds(tx, eventId, now);

    let hold = await repo.lockActiveHold(tx, eventId, buyer.sessionId);
    if (hold?.phase === "checkout") throw conflict("checkout_in_progress");

    if (!hold) {
      if (totalWanted === 0) return null;
      hold =
        (await repo.insertHold(tx, {
          organizationId: event.organizationId,
          eventId,
          buyerSessionId: buyer.sessionId,
          expiresAt: plusSeconds(now, CART_HOLD_SECONDS),
          createdAt: now,
          updatedAt: now,
        })) ?? (await repo.lockActiveHold(tx, eventId, buyer.sessionId));
      if (!hold) throw conflict("try_again");
    }

    const current = new Map(
      (await repo.findHoldItems(tx, hold.id)).map((item) => [item.ticketTypeId, item.quantity]),
    );
    const types = await repo.findCartTypes(tx, eventId, [...wanted.keys()]);
    const ids = [...new Set([...wanted.keys(), ...current.keys()])].sort();

    for (const ticketTypeId of ids) {
      const quantity = wanted.get(ticketTypeId) ?? 0;
      const delta = quantity - (current.get(ticketTypeId) ?? 0);
      if (quantity > 0) {
        const type = types.find((candidate) => candidate.id === ticketTypeId);
        // Unknown ids and ids from another event are indistinguishable from sold out.
        if (!type) throw conflict("sold_out", { [ticketTypeId]: "sold_out" });
        if (type.maxPerOrder !== null && quantity > type.maxPerOrder) {
          throw conflict("too_many_tickets", { max: String(type.maxPerOrder) });
        }
      }
      if (delta > 0) {
        const reserved = await repo.reserve(tx, { eventId, ticketTypeId, quantity: delta, now });
        if (!reserved) throw conflict("sold_out", { [ticketTypeId]: "sold_out" });
      } else if (delta < 0) {
        await repo.unreserve(tx, { ticketTypeId, quantity: -delta });
      }
      if (delta !== 0)
        await repo.setHoldItem(tx, { holdId: hold.id, eventId, ticketTypeId, quantity });
    }

    // Seats after ticket types, as in every other transaction.
    const held = await repo.findHeldSeats(tx, hold.id);
    const keep = new Map(seats.map((seat) => [seat.seatId, seat]));
    await repo.releaseSeats(
      tx,
      [hold.id],
      held.filter((seat) => !keep.has(seat.seatId)).map((seat) => seat.seatId),
    );
    const refused = await repo.claimSeats(tx, {
      eventId,
      holdId: hold.id,
      choices: seats.filter((seat) => !held.some((mine) => mine.seatId === seat.seatId)),
      now,
    });
    if (refused.length > 0) {
      throw conflict("seats_taken", Object.fromEntries(refused.map((id) => [id, "seats_taken"])));
    }
    // A seat kept from before may have had its ticket type changed.
    for (const mine of held) {
      const choice = keep.get(mine.seatId);
      if (!choice || choice.ticketTypeId === mine.ticketTypeId) continue;
      const allowed = await repo.seatTypeAllowed(tx, {
        eventId,
        sectionId: mine.sectionId,
        choice,
        now,
      });
      if (!allowed) throw conflict("seats_taken", { [mine.seatId]: "seats_taken" });
      await repo.setHeldSeatType(tx, hold.id, choice);
    }

    if (totalWanted === 0) {
      await repo.markHold(tx, hold.id, { status: "released", releasedAt: now, updatedAt: now });
      return null;
    }
    await repo.markHold(tx, hold.id, { updatedAt: now });
    return cartOf(tx, hold, event.currency);
  });
}

/** The buyer's current cart for an event, or null if there is none or it has run out. */
export async function getCart(deps: Deps, buyer: Buyer, eventId: string): Promise<Cart | null> {
  return deps.db.transaction(async (tx) => {
    const now = deps.clock.now();
    const hold = await repo.lockActiveHold(tx, eventId, buyer.sessionId);
    if (!hold || hold.expiresAt <= now) return null;
    const event = await repo.lockSellableEvent(tx, eventId);
    return event ? cartOf(tx, hold, event.currency) : null;
  });
}

/** Housekeeping for the scheduler; correctness never depends on it having run. */
export async function sweepExpiredHolds(deps: Deps, limit = 100): Promise<number> {
  const now = deps.clock.now();
  let released = 0;
  for (const eventId of await repo.findEventsWithExpiredHolds(deps.db, now, limit)) {
    released += await transactionWithRetry(deps.db, (tx) => releaseExpiredHolds(tx, eventId, now));
  }
  return released;
}
