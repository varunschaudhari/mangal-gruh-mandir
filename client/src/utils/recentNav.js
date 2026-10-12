// "Recently used" on the More page: the last options a person opened from it, newest first,
// remembered per user on this device. Storage can be missing (private window) — then it's just empty.

const MAX = 6;
const keyFor = (userId) => `mgm-recent-more:${userId || 'anon'}`;

/** Paths opened most recently, newest first. */
export function getRecent(userId) {
  try {
    const list = JSON.parse(localStorage.getItem(keyFor(userId)) || '[]');
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Puts `path` first (once), keeping the newest few. Returns the new list. */
export function addRecent(userId, path) {
  const list = [path, ...getRecent(userId).filter((p) => p !== path)].slice(0, MAX);
  try { localStorage.setItem(keyFor(userId), JSON.stringify(list)); } catch { /* storage unavailable */ }
  return list;
}
