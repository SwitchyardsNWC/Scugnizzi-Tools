import type { KeyValue } from '../model/frame-store.ts';

/** This site's storage, or a stand-in for the visit when the browser will not give it. */
export function siteStore(): KeyValue {
  try {
    localStorage.setItem('scuggnizzi.store.probe', '1');
    localStorage.removeItem('scuggnizzi.store.probe');
    return localStorage;
  } catch {
    const map = new Map<string, string>();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  }
}
