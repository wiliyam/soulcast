export interface BaseEvent {
  id: string;
  type: string;
  timestamp: number;
  source: string;
}

export interface AgentResponseEvent extends BaseEvent {
  type: "agent_response";
  userId: number;
  chatId: number;
  content: string;
  toolsUsed: string[];
  cost: number;
}

export interface ScheduledEvent extends BaseEvent {
  type: "scheduled";
  jobId: string;
  jobName: string;
  prompt: string;
  chatId: number;
  userId: number;
}

export interface WebhookEvent extends BaseEvent {
  type: "webhook";
  provider: string;
  payload: Record<string, unknown>;
}

export type AppEvent = AgentResponseEvent | ScheduledEvent | WebhookEvent;
