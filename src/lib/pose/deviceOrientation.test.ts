import { describe, expect, it } from "vitest";
import { yawDelta } from "./deviceOrientation";

describe("yawDelta", () => {
  it("wraps across 0/360", () => {
    expect(yawDelta(10, 350)).toBeCloseTo(20);
    expect(yawDelta(350, 10)).toBeCloseTo(-20);
  });
});
