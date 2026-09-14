// Shared with marketing. Canonical state wins; remove old state only after a successful write.
const legacyKeys: Record<string, string> = {
  "synq-theme": "voxa-theme",
  "synq-room-storage": "voxa-room-storage",
  "synq.supabase.auth": "voxa.supabase.auth",
  "synq.supabase.auth-code-verifier": "voxa.supabase.auth-code-verifier",
  "synq-sdk-beta-requests": "voxa-sdk-beta-requests",
};
export function readMigratedStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  key: string,
) {
  try {
    const current = storage.getItem(key);
    const oldKey = legacyKeys[key];
    if (!oldKey) return current;
    const old = storage.getItem(oldKey);
    if (current === null && old !== null) storage.setItem(key, old);
    if (old !== null) storage.removeItem(oldKey);
    return current ?? old;
  } catch {
    return null;
  }
}
