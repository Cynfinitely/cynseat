/**
 * Builds a CSV file that opens correctly in spreadsheet programs.
 *
 * Cells that a spreadsheet would run as a formula (starting with = + - @ or a tab) are
 * prefixed with an apostrophe: attendee names and emails are typed by strangers, and an
 * export must never execute what they typed on the organizer's computer.
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header, ...rows].map((row) => row.map(cell).join(","));
  // A byte-order mark makes Excel read the file as UTF-8, so "ş" and "ä" survive.
  return `﻿${lines.join("\r\n")}\r\n`;
}
