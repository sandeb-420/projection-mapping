import { describe, expect, it } from "vitest";
import { rawFromFrame, frameKey } from "./decodeFrame";
import { pixelsToB64 } from "./pixels";

describe("decodeFrame", () => {
  it("rebuilds RGBA from pixelsB64", async () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 255]);
    const raw = await rawFromFrame({
      type: "frame",
      stationId: "center",
      patternId: "white",
      kind: "gray",
      width: 2,
      height: 1,
      pixelsB64: pixelsToB64(pixels),
    });
    expect(frameKey(raw)).toBe("center:white:gray");
    expect([...raw.pixels]).toEqual([...pixels]);
  });
});
