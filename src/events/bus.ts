import { createChildLogger } from "../utils/logger.js";
import type { AppEvent } from "./types.js";

const log = createChildLogger("event-bus");

type EventHandler = (event: AppEvent) => Promise<void>;

export class EventBus {
  private subscribers = new Map<string, EventHandler[]>();
  private queue: AppEvent[] = [];
  private processing = false;
  private running = false;

  subscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.subscribers.get(eventType) ?? [];
    handlers.push(handler);
    this.subscribers.set(eventType, handlers);
    log.debug({ eventType }, "Handler subscribed");
  }

  async publish(event: AppEvent): Promise<void> {
    this.queue.push(event);
    if (!this.processing) {
      await this.processQueue();
    }
  }

  start(): void {
    this.running = true;
    log.info("Event bus started");
  }

  stop(): void {
    this.running = false;
    log.info("Event bus stopped");
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      const handlers = this.subscribers.get(event.type) ?? [];

      if (handlers.length === 0) {
        log.debug({ type: event.type }, "No handlers for event");
        continue;
      }

      const results = await Promise.allSettled(
        handlers.map((h) => h(event)),
      );

      for (const result of results) {
        if (result.status === "rejected") {
          log.error(
            { type: event.type, error: result.reason },
            "Event handler failed",
          );
        }
      }
    }

    this.processing = false;
  }
}
