import { describe, expect, it } from "vitest";
import { jcs, sha256Hex } from "../src/index.js";

describe("jcs (RFC 8785)", () => {
  it("sorts keys and strips whitespace", () => {
    expect(jcs({ b: 1, a: [true, null, "x"], c: {} })).toBe('{"a":[true,null,"x"],"b":1,"c":{}}');
  });

  it("sorts keys by UTF-16 code units", () => {
    expect(jcs({ "\uffff": 1, "😀": 2 })).toBe('{"😀":2,"\uffff":1}');
  });

  it("matches RFC 8785 string escaping", () => {
    expect(jcs("\u0000\n\u001f\u007f")).toBe('"\\u0000\\n\\u001f\u007f"');
  });

  it("sha256Hex of a known string", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
