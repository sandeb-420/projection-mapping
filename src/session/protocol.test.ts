import { describe, expect, it } from "vitest";
import { peersFromRoles } from "./protocol";

describe("peersFromRoles", () => {
  it("marks connected roles", () => {
    const peers = peersFromRoles(["host", "projector"]);
    expect(peers.host).toBe(true);
    expect(peers.projector).toBe(true);
    expect(peers.phone).toBe(false);
  });
});
