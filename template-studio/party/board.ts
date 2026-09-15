// Presence for the project board: who else has this project open, where their pointer is, what they have picked.
//
// Jared: "if I have a project open and someone else opens the same project we can see each others cursors and
// interact." A PartyKit server, one room per project id, that relays three things and holds nothing else: cursor
// positions in board coordinates, so every viewer sees them right at their own pan and zoom; the card each person
// has selected; and a nudge that a file was saved, so the others' boards look at the folder now rather than in a
// few seconds. The folder is still the truth. Nothing about the project passes through here but its id.
//
// Deploying: `npm run party:deploy` from template-studio/ (after `npx partykit login`), then put the host it prints
// into src/project/presence-config.ts. `npm run party` runs it locally on :1999 for trying it out.

import type * as Party from 'partykit/server';

interface Peer {
  id: string;
  name: string;
  color: string;
  x: number | null;
  y: number | null;
  selected: string | null;
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null);

export default class BoardParty implements Party.Server {
  private readonly peers = new Map<string, Peer>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection): void {
    conn.send(JSON.stringify({ type: 'welcome', you: conn.id, peers: [...this.peers.values()] }));
  }

  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void {
    if (typeof raw !== 'string') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    const peer = this.peers.get(sender.id);
    const tell = (payload: Record<string, unknown>) => this.room.broadcast(JSON.stringify(payload), [sender.id]);
    switch (msg.type) {
      case 'hello': {
        const joined: Peer = {
          id: sender.id,
          name: text(msg.name, 40) || 'Someone',
          color: /^#[0-9a-f]{6}$/i.test(String(msg.color)) ? String(msg.color) : '#495472',
          x: null,
          y: null,
          selected: null,
        };
        this.peers.set(sender.id, joined);
        tell({ type: 'join', peer: joined });
        return;
      }
      case 'cursor':
        if (!peer) return;
        peer.x = num(msg.x);
        peer.y = num(msg.y);
        tell({ type: 'cursor', id: sender.id, x: peer.x, y: peer.y });
        return;
      case 'select':
        if (!peer) return;
        peer.selected = text(msg.id, 400) || null;
        tell({ type: 'select', id: sender.id, selected: peer.selected });
        return;
      case 'saved':
        tell({ type: 'saved', id: sender.id });
        return;
      default:
        return;
    }
  }

  onClose(conn: Party.Connection): void {
    this.leave(conn.id);
  }

  onError(conn: Party.Connection): void {
    this.leave(conn.id);
  }

  private leave(id: string): void {
    if (this.peers.delete(id)) this.room.broadcast(JSON.stringify({ type: 'leave', id }));
  }
}

BoardParty satisfies Party.Worker;
