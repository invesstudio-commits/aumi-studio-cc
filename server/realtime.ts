import { Response } from 'express';

interface RealtimeClient {
  id: string;
  userId: string;
  role: 'partner' | 'client';
  res: Response;
}

const clients = new Map<string, RealtimeClient>();

export function addRealtimeClient(id: string, userId: string, role: 'partner' | 'client', res: Response) {
  clients.set(id, { id, userId, role, res });
}

export function removeRealtimeClient(id: string) {
  clients.delete(id);
}

export interface RealtimeEventPayload {
  type:
    | 'mural_updated'
    | 'demand_updated'
    | 'notification_created'
    | 'notification_deleted'
    | 'portal_activity'
    | 'chat_message_created'
    | 'chat_message_deleted'
    | 'postit_updated'
    | 'contents_updated';
  actorId?: string;
  scope?: string;
  boardId?: string | null;
  targetUserIds?: string[];
  summary?: string;
  timestamp: string;
}

export function broadcastRealtime(event: Omit<RealtimeEventPayload, 'timestamp'>) {
  const payload: RealtimeEventPayload = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  const serialized = `event: studio\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const [id, client] of clients.entries()) {
    // Only send to partners unless explicitly targeted
    if (event.targetUserIds && event.targetUserIds.length > 0) {
      if (!event.targetUserIds.includes(client.userId)) continue;
    } else if (client.role !== 'partner') {
      continue;
    }

    try {
      client.res.write(serialized);
    } catch {
      clients.delete(id);
    }
  }
}
