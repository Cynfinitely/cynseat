import { describe, expect, it } from "vitest";
import { detectImageType } from "./detect";

const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0]);

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP by their signatures", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "image/png",
    );
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      "image/webp",
    );
  });

  it("rejects everything else, whatever it claims to be", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(
      detectImageType(encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>")),
    ).toBeNull();
    expect(detectImageType(encode("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(encode("GIF89a"))).toBeNull();
    expect(
      detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20)),
    ).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
