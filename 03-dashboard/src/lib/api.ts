const BASE_URL = process.env.NEXT_PUBLIC_CLAWDBOT_URL || 'http://16.171.150.151:3000';

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
  sendMessage: (message: string) => fetchAPI<MessageResponse>('/api/message', {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),
  deployProject: (repo: string) => fetchAPI<DeployResponse>(`/api/project/${encodeURIComponent(repo)}/deploy`, {
    method: 'POST',
  }),
  getLogs: (limit = 100) => fetchAPI<LogsResponse>(`/api/logs?limit=${limit}`),
  getActivity: (limit = 20) => fetchAPI<ActivityResponse>(`/api/activity?limit=${limit}`),
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
