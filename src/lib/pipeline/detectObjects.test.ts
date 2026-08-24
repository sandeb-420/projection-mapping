import { describe, expect, it } from "vitest";
import { LIVE_WATCH_ENABLED } from "./detectObjects";

describe("live watch", () => {
  it("stays off until recapture on hardware is solid", () => {
    expect(LIVE_WATCH_ENABLED).toBe(false);
  });
});
