import { describe, expect, it } from "vitest";
import { StreamSessionManager } from "../src/stream-session.js";

describe("StreamSessionManager", () => {
  it("returns ordered event batches with cursors", () => {
    const streams = new StreamSessionManager<string>(10);
    const session = streams.create({ agent: "demo", operation: "send" });

    streams.append(session.id, "one");
    streams.append(session.id, "two");

    expect(streams.read(session.id, 0, 1)).toMatchObject({
      events: ["one"],
      nextCursor: 1,
      closed: false,
      overflowed: false,
    });

    expect(streams.read(session.id, 1)).toMatchObject({
      events: ["two"],
      nextCursor: 2,
    });
  });

  it("reports overflow when old events were evicted", () => {
    const streams = new StreamSessionManager<string>(1);
    const session = streams.create({ agent: "demo", operation: "subscribe" });

    streams.append(session.id, "one");
    streams.append(session.id, "two");

    expect(streams.read(session.id, 0)).toMatchObject({
      events: ["two"],
      nextCursor: 2,
      overflowed: true,
    });
  });
});
