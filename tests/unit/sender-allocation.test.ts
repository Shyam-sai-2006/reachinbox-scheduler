import { describe, it, expect } from "vitest";
import { assignSendersRoundRobin } from "@reachinbox/shared";

describe("Unit Tests: Sender Round-Robin Allocation", () => {
  it("alternates deterministically across 2 sender accounts", () => {
    const senders = ["sender-A", "sender-B"];
    const assignments = assignSendersRoundRobin(6, senders);

    expect(assignments).toEqual([
      "sender-A",
      "sender-B",
      "sender-A",
      "sender-B",
      "sender-A",
      "sender-B",
    ]);
  });

  it("cycles across 3 sender accounts deterministically", () => {
    const senders = ["s1", "s2", "s3"];
    const assignments = assignSendersRoundRobin(5, senders);

    expect(assignments).toEqual(["s1", "s2", "s3", "s1", "s2"]);
  });

  it("throws an error if no senders are supplied", () => {
    expect(() => assignSendersRoundRobin(5, [])).toThrow();
  });
});
