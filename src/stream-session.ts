import { randomUUID } from "node:crypto";

export interface StreamSession<TEvent = unknown> {
  readonly id: string;
  readonly createdAt: string;
  readonly operation: "send" | "subscribe";
  readonly agent: string;
  readonly events: TEvent[];
  readonly maxEvents: number;
  cursor: number;
  closed: boolean;
  overflowed: boolean;
  error?: unknown;
}

export class StreamSessionManager<TEvent = unknown> {
  private readonly sessions = new Map<string, StreamSession<TEvent>>();

  constructor(private readonly defaultMaxEvents = 200) {}

  create(args: {
    operation: "send" | "subscribe";
    agent: string;
    maxEvents?: number;
  }): StreamSession<TEvent> {
    const session: StreamSession<TEvent> = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      operation: args.operation,
      agent: args.agent,
      events: [],
      maxEvents: args.maxEvents ?? this.defaultMaxEvents,
      cursor: 0,
      closed: false,
      overflowed: false,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  append(id: string, event: TEvent): void {
    const session = this.require(id);
    session.events.push(event);
    if (session.events.length > session.maxEvents) {
      session.events.shift();
      session.cursor += 1;
      session.overflowed = true;
    }
  }

  fail(id: string, error: unknown): void {
    const session = this.require(id);
    session.error = error;
    session.closed = true;
  }

  finish(id: string): void {
    this.require(id).closed = true;
  }

  read(id: string, cursor = 0, limit = 50): {
    events: TEvent[];
    nextCursor: number;
    closed: boolean;
    overflowed: boolean;
    error?: unknown;
  } {
    const session = this.require(id);
    const safeCursor = Math.max(cursor, session.cursor);
    const start = safeCursor - session.cursor;
    const events = session.events.slice(start, start + limit);

    return {
      events,
      nextCursor: safeCursor + events.length,
      closed: session.closed,
      overflowed: session.overflowed || cursor < session.cursor,
      error: session.error,
    };
  }

  close(id: string): void {
    const session = this.require(id);
    session.closed = true;
  }

  list(): StreamSession<TEvent>[] {
    return [...this.sessions.values()];
  }

  private require(id: string): StreamSession<TEvent> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Unknown stream session: ${id}`);
    }

    return session;
  }
}
