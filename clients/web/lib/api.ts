const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4096";

export type Session = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSessions(): Promise<Session[]> {
  return request<Session[]>("/api/sessions");
}

export async function fetchMessages(sessionId: string): Promise<Message[]> {
  return request<Message[]>(`/api/sessions/${sessionId}/messages`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/api/sessions/${sessionId}`, { method: "DELETE" });
}