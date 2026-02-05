const BASE_URL = typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_CLAWDBOT_URL || 'http://16.171.150.151:3000');

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('clawdbot-api-key') || process.env.NEXT_PUBLIC_CLAWDBOT_API_KEY || 'dev-key-change-me';
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('clawdbot-api-key', key);
  }
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey();

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Typed API functions
export const api = {
  getStatus: () => fetchAPI<StatusResponse>('/api/status'),
  getProjects: () => fetchAPI<ProjectsResponse>('/api/projects'),
  getProjectStatus: (repo: string) => fetchAPI<ProjectStatusResponse>(`/api/project/${encodeURIComponent(repo)}/status`),
  getSkills: () => fetchAPI<SkillsResponse>('/api/skills'),
  getMemory: (limit = 50) => fetchAPI<MemoryResponse>(`/api/memory?limit=${limit}`),
  sendMessage: (message: string, chatId = 'dashboard-coworker') => fetchAPI<MessageResponse>('/api/message', {
    method: 'POST',
    body: JSON.stringify({ message, chatId }),
  }),
  deployProject: (repo: string) => fetchAPI<DeployResponse>(`/api/project/${encodeURIComponent(repo)}/deploy`, {
    method: 'POST',
  }),
  getLogs: (limit = 100) => fetchAPI<LogsResponse>(`/api/logs?limit=${limit}`),
  getActivity: (limit = 20) => fetchAPI<ActivityResponse>(`/api/activity?limit=${limit}`),

  // Live Agent Visibility
  getLiveState: () => fetchAPI<LiveStateResponse>('/api/live/state'),
  getLiveOutcomes: (limit = 20, type?: string) =>
    fetchAPI<LiveOutcomesResponse>(`/api/live/outcomes?limit=${limit}${type ? `&type=${type}` : ''}`),
  getLiveSessions: (limit = 10) =>
    fetchAPI<LiveSessionsResponse>(`/api/live/sessions?limit=${limit}`),
  getLiveDeployments: (limit = 10, repo?: string) =>
    fetchAPI<LiveDeploymentsResponse>(`/api/live/deployments?limit=${limit}${repo ? `&repo=${repo}` : ''}`),
};

// Response types
export interface StatusResponse {
  success: boolean;
  status: string;
  uptime: number;
  version: string;
  features: {
    memory: boolean;
    skills: boolean;
    scheduler: boolean;
    projectIntelligence: boolean;
    actionExecutor: boolean;
  };
  skillCount: number;
  stats: UserStats | null;
}

export interface UserStats {
  totalMessages: number;
  totalFacts: number;
  pendingTasks: number;
  completedTasks: number;
}

export interface ProjectsResponse {
  success: boolean;
  count: number;
  projects: Project[];
}

export interface Project {
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  updatedAt: string;
  language: string;
}

export interface ProjectStatusResponse {
  success: boolean;
  repo: string;
  hasTodo: boolean;
  tasks?: TodoTask[];
  message?: string;
}

export interface TodoTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  completed: boolean;
}

export interface SkillsResponse {
  success: boolean;
  count: number;
  skills: Skill[];
}

export interface Skill {
  name: string;
  description: string;
  priority: number;
  commands: string[];
}

export interface MemoryResponse {
  success: boolean;
  messages: Message[];
  facts: Fact[];
}

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface Fact {
  id: number;
  category: string;
  fact: string;
  created_at: string;
}

export interface MessageResponse {
  success: boolean;
  message: string;
  processed?: string;
}

export interface DeployResponse {
  success: boolean;
  repo: string;
  output: string;
  errors?: string;
}

export interface LogsResponse {
  success: boolean;
  count: number;
  logs: Array<{
    id: number;
    timestamp: string;
    level: string;
    source: string;
    message: string;
    meta?: Record<string, unknown>;
  }>;
}

export interface ActivityResponse {
  success: boolean;
  count: number;
  activities: Array<{
    id: number;
    timestamp: string;
    level: string;
    source: string;
    message: string;
    meta?: Record<string, unknown>;
  }>;
}

// ── Live Agent Visibility Layer Types ──

export interface LiveAgent {
  id: string;
  name: string;
  type: 'main' | 'claude-code' | 'plan-executor';
  status: 'active' | 'running' | 'idle' | 'error';
  uptime?: number;
  startedAt?: number;
  pid?: number | null;
  task?: string;
}

export interface LiveOutcome {
  id: number;
  chat_id: string;
  user_id: string;
  action_type: string;
  action_detail: string | null;
  repo: string | null;
  result: 'pending' | 'success' | 'failed' | 'cancelled' | 'partial';
  result_detail: string | null;
  pr_url: string | null;
  deploy_url: string | null;
  user_feedback: string | null;
  feedback_sentiment: string | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface LiveDeployment {
  id: number;
  repo: string;
  platform?: string;
  url: string | null;
  status: string;
  triggered_by: string | null;
  chat_id: string | null;
  created_at: string;
}

export interface LiveClaudeCodeSession {
  id: number;
  chat_id: string;
  user_id: string;
  session_id: string;
  repo: string;
  task: string;
  status: string;
  output_summary: string | null;
  pr_url: string | null;
  pid: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
}

export interface LiveConversationSession {
  chatId: string;
  mode: 'idle' | 'designing' | 'planning' | 'coding' | 'iterating';
  projectName: string | null;
  repo: string | null;
  lastActivityAt: number;
  startedAt: number;
}

export interface LivePendingConfirmation {
  action: string;
  params: Record<string, unknown>;
  createdAt: number;
  minutesRemaining: number;
}

export interface TaskQueueStatus {
  queued: number;
  running: number;
  capacity: number;
}

export interface TimelineEntry {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface LiveStateResponse {
  success: boolean;
  timestamp: string;
  currentTask: TimelineEntry | null;
  agents: LiveAgent[];
  taskQueue: TaskQueueStatus;
  pendingConfirmations: Record<string, LivePendingConfirmation>;
  recentOutcomes: LiveOutcome[];
  recentDeployments: LiveDeployment[];
  activeSessions: LiveConversationSession[];
  timeline: TimelineEntry[];
  uptime: number;
  memoryUsage: {
    heapMB: number;
  };
}

export interface LiveOutcomesResponse {
  success: boolean;
  count: number;
  outcomes: LiveOutcome[];
}

export interface LiveSessionsResponse {
  success: boolean;
  count: number;
  sessions: LiveClaudeCodeSession[];
}

export interface LiveDeploymentsResponse {
  success: boolean;
  count: number;
  deployments: LiveDeployment[];
}
