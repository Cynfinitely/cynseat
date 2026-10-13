import { PDFDocument } from "@cantoo/pdf-lib";
import * as fontkit from "fontkit";
import { describe, expect, it } from "vitest";
import { loadTicketFonts, renderTicketsPdf, type TicketPdfInput } from "./pdf";

const input: TicketPdfInput = {
  eventTitle: "Bir Masal Gibi Anlat: İçten Bir Şarkı Öyküsü ve Çok Uzun Bir Başlık Daha",
  when: "lauantai 10. tammikuuta 2030 klo 18.30",
  where: "Martinlaakson Auditorio, Martinlaaksonpolku 4, Vantaa",
  organizer: "Tiyatro Maydanoz",
  reference: "K7QM2XWP",
  buyerName: "Şule Öztürk-Väänänen",
  tickets: [
    {
      description: "Yetişkin",
      seat: "Parter · sıra B · koltuk 3",
      position: "Bilet 1 / 2",
      code: "CS1.P2uMHppNTm-LehwtPk9aaw.AAAAAAAAAAAAAAAAAAAAAA",
    },
    {
      description: "Öğrenci",
      seat: null,
      position: "Bilet 2 / 2",
      code: "CS1.P2uMHppNTm-LehwtPk9aaw.BBBBBBBBBBBBBBBBBBBBBB",
    },
  ],
  labels: {
    when: "Ne zaman",
    where: "Nerede",
    holder: "Bilet sahibi",
    order: "Sipariş",
    organizer: "Düzenleyen",
    show: "Bu kodu kapıda gösterin.",
  },
};

describe("ticket PDF", () => {
  it("has one page per ticket and is a well-formed PDF", async () => {
    const bytes = await renderTicketsPdf(input);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(2);
    expect(parsed.getTitle()).toContain("K7QM2XWP");
    expect(parsed.getPage(0).getSize()).toEqual({ width: 420, height: 595 });
    // Subsetted fonts keep the file small enough to email or open on a phone.
    expect(bytes.byteLength).toBeLessThan(150_000);
  });

  it("uses a font that has every Turkish and Finnish letter, so nothing is transliterated", async () => {
    const { regular, bold } = await loadTicketFonts();
    for (const data of [regular, bold]) {
      const font = fontkit.create(data) as fontkit.Font;
      for (const letter of "ğüşıöçĞÜŞİÖÇäöåÄÖÅ€·–") {
        expect(font.hasGlyphForCodePoint(letter.codePointAt(0)!), letter).toBe(true);
      }
    }
  });

  it("copes with very long single words", async () => {
    const long = await renderTicketsPdf({
      ...input,
      eventTitle: "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen".repeat(3),
      tickets: input.tickets.slice(0, 1),
    });
    expect((await PDFDocument.load(long)).getPageCount()).toBe(1);
  });
});
