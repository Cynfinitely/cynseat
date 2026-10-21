import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells that need it and keeps accented letters", () => {
    const csv = toCsv(
      ["Name", "Note"],
      [
        ["Şule Öztürk", 'said "hi", twice'],
        ["Aino\nVirtanen", null],
      ],
    );
    expect(csv).toBe('﻿Name,Note\r\nŞule Öztürk,"said ""hi"", twice"\r\n"Aino\nVirtanen",\r\n');
  });

  it("defuses cells a spreadsheet would run as formulas", () => {
    const rows = [
      ['=HYPERLINK("http://evil")'],
      ["+1"],
      ["-1"],
      ["@SUM(A1)"],
      ["\tx"],
      ["safe=1"],
      [12],
    ];
    const lines = toCsv(["value"], rows).split("\r\n").slice(1, -1);
    expect(lines).toEqual([
      `"'=HYPERLINK(""http://evil"")"`,
      "'+1",
      "'-1",
      "'@SUM(A1)",
      "'\tx",
      "safe=1",
      "12",
    ]);
  });
});
