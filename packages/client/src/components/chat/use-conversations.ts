import { useCallback, useEffect, useState } from 'react';

/** A single chat message + any tool/agent activity rendered above the answer. */
export interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  activity?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  messages: ChatEntry[];
  createdAt: number;
  updatedAt: number;
}

const keyFor = (projectId: string) => `agb_chat_${projectId}`;
const newId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function load(projectId: string): Conversation[] {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    const arr = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Multi-conversation chat history, persisted per project in localStorage. */
export function useConversations(projectId: string) {
  const [conversations, setConversations] = useState<Conversation[]>(() => load(projectId));
  // Entering chat always lands on a fresh (unsaved) chat; older ones are picked from the rail.
  const [activeId, setActiveId] = useState<string | null>(null);

  // Persist on change.
  useEffect(() => {
    try { localStorage.setItem(keyFor(projectId), JSON.stringify(conversations)); } catch { /* quota */ }
  }, [projectId, conversations]);

  // Reload when switching projects.
  useEffect(() => {
    setConversations(load(projectId));
    setActiveId(null);
  }, [projectId]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const startNew = useCallback((agentId: string): string => {
    const id = newId();
    const conv: Conversation = { id, title: 'New chat', agentId, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(id);
    return id;
  }, []);

  /** Replace the messages of a conversation (creating a title from the first user message). */
  const update = useCallback((id: string, messages: ChatEntry[], agentId?: string) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const firstUser = messages.find((m) => m.role === 'user')?.content ?? c.title;
      const title = c.title === 'New chat' && firstUser ? (firstUser.length > 42 ? `${firstUser.slice(0, 40)}…` : firstUser) : c.title;
      return { ...c, messages, title, agentId: agentId ?? c.agentId, updatedAt: Date.now() };
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
  }, []);

  const rename = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  return { conversations, active, activeId, setActiveId, startNew, update, remove, rename };
}
