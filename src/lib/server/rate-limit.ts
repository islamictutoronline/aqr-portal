import 'server-only';
// Persistent rate limits need a shared store for multiple server replicas. This limiter
// is an additional local guard; Supabase's auth rate limits remain authoritative.
const limits = new Map<string, { count: number; reset: number }>();
export function limit(key: string, maximum = 5, windowMs = 60000) {
  const now = Date.now();
  for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
  const entry = limits.get(key) ?? { count: 0, reset: now + windowMs };
  if (++entry.count > maximum) throw new Error('Terlalu banyak permintaan');
  limits.set(key, entry);
}
