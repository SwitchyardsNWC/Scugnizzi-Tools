// Who else has this project open (party/board.ts), from the board's side.
//
// One socket per open project, to a PartyKit room named for the project's id. Our pointer goes out in board
// coordinates a few dozen times a second at most; theirs come back and are drawn on the board at their own
// positions, whatever anyone's zoom. The card each person has picked goes out too, and a nudge when a file was
// saved, so the other boards look at the folder now. The socket comes back on its own after a drop.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface Peer {
  id: string;
  name: string;
  color: string;
  x: number | null;
  y: number | null;
  selected: string | null;
}

/** `off`: no host. `connecting` and `offline` say whether the last attempt is still going or failed. */
export type PresenceState = 'off' | 'connecting' | 'online' | 'offline';

/** The room's address: PartyKit serves a room of the main party at /parties/main/<room>. Local hosts are plain ws. */
export function presenceUrl(host: string, room: string): string {
  const clean = host.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(clean);
  return `${local ? 'ws' : 'wss'}://${clean}/parties/main/${encodeURIComponent(room)}`;
}

const ADJECTIVES = ['Quiet', 'Bright', 'Tall', 'Early', 'Plain', 'Steady', 'Swift', 'Warm', 'Sharp', 'Calm', 'Bold', 'Late'];
const BIRDS = ['Heron', 'Wren', 'Finch', 'Kite', 'Crane', 'Swift', 'Robin', 'Teal', 'Plover', 'Lark', 'Osprey', 'Jay'];

/** A name for someone who has not given one: two words, easy to say across a room. */
export function defaultPresenceName(): string {
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;
  return `${pick(ADJECTIVES)} ${pick(BIRDS)}`;
}

/** The data palette, so a person's colour means them and nothing else. */
const COLORS = ['#4a5fa5', '#5b8a5e', '#c48a2e', '#b8412b', '#3d8a8a', '#7b61ff', '#d23a67', '#495472'];

/** The same colour for the same name, on every machine. */
export function colorForName(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

type Incoming =
  | { type: 'welcome'; you: string; peers: Peer[] }
  | { type: 'join'; peer: Peer }
  | { type: 'leave'; id: string }
  | { type: 'cursor'; id: string; x: number | null; y: number | null }
  | { type: 'select'; id: string; selected: string | null }
  | { type: 'saved'; id: string };

/** How often our pointer goes out, at most. */
const CURSOR_MS = 40;

export function usePresence({ host, room, name, color, onSaved }: { host: string; room: string | null; name: string; color: string; onSaved?: () => void }) {
  const [state, setState] = useState<PresenceState>(host && room ? 'connecting' : 'off');
  const [peers, setPeers] = useState<Peer[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const identity = useRef({ name, color });
  identity.current = { name, color };
  /** The last selection told, sent again on reconnect. */
  const selected = useRef<string | null>(null);
  const cursor = useRef<{ x: number | null; y: number | null; sentAt: number; timer: number }>({ x: null, y: null, sentAt: 0, timer: 0 });

  const send = useCallback((payload: Record<string, unknown>) => {
    const s = socket.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (!host || !room) {
      setState('off');
      setPeers([]);
      return;
    }
    let live = true;
    let retry = 0;
    let timer = 0;
    const open = () => {
      if (!live) return;
      setState('connecting');
      let s: WebSocket;
      try {
        s = new WebSocket(presenceUrl(host, room));
      } catch {
        setState('offline');
        return;
      }
      socket.current = s;
      s.onopen = () => {
        retry = 0;
        setState('online');
        s.send(JSON.stringify({ type: 'hello', ...identity.current }));
        if (selected.current) s.send(JSON.stringify({ type: 'select', id: selected.current }));
      };
      s.onmessage = (event: MessageEvent) => {
        let msg: Incoming;
        try {
          msg = JSON.parse(String(event.data)) as Incoming;
        } catch {
          return;
        }
        switch (msg.type) {
          case 'welcome':
            setPeers(msg.peers.filter((p) => p.id !== msg.you));
            return;
          case 'join':
            setPeers((old) => [...old.filter((p) => p.id !== msg.peer.id), msg.peer]);
            return;
          case 'leave':
            setPeers((old) => old.filter((p) => p.id !== msg.id));
            return;
          case 'cursor':
            setPeers((old) => old.map((p) => (p.id === msg.id ? { ...p, x: msg.x, y: msg.y } : p)));
            return;
          case 'select':
            setPeers((old) => old.map((p) => (p.id === msg.id ? { ...p, selected: msg.selected } : p)));
            return;
          case 'saved':
            savedRef.current?.();
            return;
          default:
            return;
        }
      };
      s.onclose = () => {
        if (socket.current === s) socket.current = null;
        if (!live) return;
        setState('offline');
        setPeers([]);
        // Back off from a second to half a minute; the server may be asleep or the network gone.
        retry = Math.min(retry + 1, 5);
        timer = window.setTimeout(open, 1000 * 2 ** (retry - 1));
      };
      s.onerror = () => s.close();
    };
    open();
    return () => {
      live = false;
      window.clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
      setPeers([]);
    };
  }, [host, room]);

  /** Where our pointer is on the board, or nowhere. A few dozen times a second at most; the last one always goes. */
  const sendCursor = useCallback(
    (x: number | null, y: number | null) => {
      const c = cursor.current;
      if (c.x === x && c.y === y) return;
      c.x = x;
      c.y = y;
      const now = performance.now();
      const flush = () => {
        c.sentAt = performance.now();
        c.timer = 0;
        send({ type: 'cursor', x: c.x, y: c.y });
      };
      if (now - c.sentAt >= CURSOR_MS) flush();
      else if (!c.timer) c.timer = window.setTimeout(flush, CURSOR_MS - (now - c.sentAt));
    },
    [send],
  );

  const sendSelect = useCallback(
    (id: string | null) => {
      if (selected.current === id) return;
      selected.current = id;
      send({ type: 'select', id });
    },
    [send],
  );

  const sendSaved = useCallback(() => send({ type: 'saved' }), [send]);

  return { state, peers, sendCursor, sendSelect, sendSaved };
}
