import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import * as fontkit from "fontkit";
import QRCode from "qrcode";

/** Everything printed on one ticket, already in the reader's language. */
export type TicketPdfInput = {
  eventTitle: string;
  /** Date and time, formatted in the event's time zone. */
  when: string;
  /** Venue name and address, or "Online event". */
  where: string;
  organizer: string;
  reference: string;
  buyerName: string;
  tickets: {
    /** Ticket type, e.g. "Adult". */
    description: string;
    /** "Stalls · row B · seat 3", for reserved seating. */
    seat: string | null;
    /** e.g. "Ticket 1 of 2". */
    position: string;
    /** What the QR code contains. */
    code: string;
  }[];
  labels: {
    when: string;
    where: string;
    holder: string;
    order: string;
    organizer: string;
    show: string;
  };
};

const FONT_DIR = join(process.cwd(), "src/server/modules/tickets/fonts");
let fonts: Promise<{ regular: Buffer; bold: Buffer }> | undefined;

/** Noto Sans covers Turkish and Finnish letters, which the standard PDF fonts do not. */
export function loadTicketFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  fonts ??= Promise.all([
    readFile(join(FONT_DIR, "NotoSans-Regular.ttf")),
    readFile(join(FONT_DIR, "NotoSans-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fonts;
}

const BRAND = rgb(0.494, 0.133, 0.808);
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const PAGE = { width: 420, height: 595 }; // A5 portrait, in points
const MARGIN = 36;

/** Breaks text into lines that fit `maxWidth`, splitting over-long words if it must. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws wrapped text downwards from `y` and returns the y below the last line. */
function paragraph(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    maxWidth: number;
    color?: ReturnType<typeof rgb>;
    maxLines?: number;
  },
): number {
  let y = options.y;
  const lines = wrap(text, options.font, options.size, options.maxWidth).slice(
    0,
    options.maxLines ?? 6,
  );
  for (const line of lines) {
    page.drawText(line, {
      x: options.x,
      y,
      size: options.size,
      font: options.font,
      color: options.color ?? INK,
    });
    y -= options.size * 1.35;
  }
  return y;
}

function drawQr(page: PDFPage, value: string, x: number, y: number, size: number): void {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quiet = 4;
  const cell = size / (modules.size + quiet * 2);
  // White background with a quiet zone, then the dark modules as vector squares.
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (!modules.get(row, column)) continue;
      page.drawRectangle({
        x: x + (column + quiet) * cell,
        y: y + size - (row + quiet + 1) * cell,
        // A hair wider than a cell, so viewers do not show seams between squares.
        width: cell + 0.05,
        height: cell + 0.05,
        color: rgb(0, 0, 0),
      });
    }
  }
}

/** One A5 page per ticket, with a QR code that scans the same as the one on screen. */
export async function renderTicketsPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const { regular, bold } = await loadTicketFonts();
  // Only the glyphs actually used are embedded, which keeps the file small.
  const font = await pdf.embedFont(regular, { subset: true });
  const strong = await pdf.embedFont(bold, { subset: true });
  pdf.setTitle(`${input.eventTitle} – ${input.reference}`);
  pdf.setCreator("CynSeat");

  const width = PAGE.width - MARGIN * 2;
  for (const ticket of input.tickets) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawRectangle({ x: 0, y: PAGE.height - 8, width: PAGE.width, height: 8, color: BRAND });
    page.drawText("CynSeat", {
      x: MARGIN,
      y: PAGE.height - 40,
      size: 13,
      font: strong,
      color: BRAND,
    });
    page.drawText(ticket.position, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(ticket.position, 10),
      y: PAGE.height - 38,
      size: 10,
      font,
      color: MUTED,
    });

    let y = PAGE.height - 78;
    y = paragraph(page, input.eventTitle, {
      x: MARGIN,
      y,
      font: strong,
      size: 20,
      maxWidth: width,
      maxLines: 3,
    });
    y -= 6;
    y = paragraph(page, ticket.description, {
      x: MARGIN,
      y,
      font: strong,
      size: 13,
      maxWidth: width,
      color: BRAND,
      maxLines: 2,
    });
    if (ticket.seat) {
      y = paragraph(page, ticket.seat, {
        x: MARGIN,
        y: y - 2,
        font: strong,
        size: 13,
        maxWidth: width,
        maxLines: 2,
      });
    }
    y -= 10;

    const field = (label: string, value: string) => {
      page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 7.5, font: strong, color: MUTED });
      y =
        paragraph(page, value, {
          x: MARGIN,
          y: y - 13,
          font,
          size: 11,
          maxWidth: width,
          maxLines: 3,
        }) - 6;
    };
    field(input.labels.when, input.when);
    field(input.labels.where, input.where);
    field(input.labels.holder, input.buyerName);
    field(input.labels.organizer, input.organizer);

    const qrSize = 190;
    const qrY = MARGIN + 34;
    drawQr(page, ticket.code, (PAGE.width - qrSize) / 2, qrY, qrSize);
    const hint = input.labels.show;
    page.drawText(hint, {
      x: (PAGE.width - font.widthOfTextAtSize(hint, 9)) / 2,
      y: qrY - 8,
      size: 9,
      font,
      color: MUTED,
    });
    const footer = `${input.labels.order} ${input.reference}`;
    page.drawText(footer, {
      x: (PAGE.width - font.widthOfTextAtSize(footer, 9)) / 2,
      y: MARGIN - 6,
      size: 9,
      font,
      color: MUTED,
    });
  }
  return pdf.save();
}
