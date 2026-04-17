export interface UserModel {
  userId: number;
  telegramUsername: string | null;
  firstSeen: string;
  lastActive: string;
  isAllowed: boolean;
  totalCost: number;
}

export interface SessionModel {
  id: string;
  userId: number;
  projectPath: string;
  claudeSessionId: string | null;
  status: "active" | "paused" | "completed" | "expired";
  totalCost: number;
  totalTurns: number;
  createdAt: string;
  lastActivity: string;
}

export interface MessageModel {
  id: number;
  sessionId: string;
  userId: number;
  role: "user" | "assistant";
  content: string;
  cost: number;
  durationMs: number;
  toolsUsed: string[];
  createdAt: string;
}

export interface MemoryEntry {
  id: number;
  userId: number;
  type: "fact" | "preference" | "decision" | "context" | "task";
  content: string;
  source: string;
  importance: number;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
}

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  prompt: string;
  userId: number;
  chatId: number;
  timezone: string;
  isActive: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  action: string;
  details: string | null;
  createdAt: string;
}
