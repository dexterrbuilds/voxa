// External-agent permission model.
//
// These permissions gate what an EXPERIMENTAL text-only external agent may do in a
// live room. The set is intentionally small and safe. Audio/transcript
// permissions EXIST as types for the future but are NEVER grantable today — they
// are not selectable in the dashboard, not approvable by admins, and never
// effective at runtime.
//
// This module is client-safe (pure types/data) so the server (enforcement) and
// the UI (dashboard, admin, room) can share one source of truth.

export type ExternalAgentPermission =
  // Currently grantable:
  | "room_text_reply"
  | "tools_visualize"
  | "memory_read_thread"
  | "memory_write_thread"
  | "room_presence"
  // Future — types only; NEVER granted today:
  | "room_audio_listen"
  | "room_audio_speak"
  | "room_transcript_read";

// Permissions a developer may request and an agent may actually use today.
export const GRANTABLE_EXTERNAL_AGENT_PERMISSIONS: ExternalAgentPermission[] = [
  "room_text_reply",
  "memory_read_thread",
  "memory_write_thread",
  "tools_visualize",
  "room_presence",
];

// Minimal default for a newly registered agent.
export const DEFAULT_EXTERNAL_AGENT_PERMISSIONS: ExternalAgentPermission[] = [
  "room_text_reply",
  "memory_read_thread",
  "memory_write_thread",
  "tools_visualize",
];

// Future, dangerous permissions. Present as types so the model is complete, but
// they can never be granted or enforced as allowed until a deliberate future
// phase enables audio/transcript.
export const FUTURE_EXTERNAL_AGENT_PERMISSIONS: ExternalAgentPermission[] = [
  "room_audio_listen",
  "room_audio_speak",
  "room_transcript_read",
];

export type PermissionMeta = {
  // Friendly, non-scary UI label.
  label: string;
  // Short room badge label.
  badge: string;
  description: string;
  grantable: boolean;
};

export const EXTERNAL_AGENT_PERMISSION_META: Record<ExternalAgentPermission, PermissionMeta> = {
  room_text_reply: {
    label: "Reply to text messages",
    badge: "Text reply",
    description: "Receive a typed message and return a text reply. Required for room chat.",
    grantable: true,
  },
  memory_read_thread: {
    label: "Read its own thread",
    badge: "Thread memory",
    description: "Include the recent per-agent thread as follow-up context.",
    grantable: true,
  },
  memory_write_thread: {
    label: "Save to its own thread",
    badge: "Thread memory",
    description: "Persist the message + reply to its own room thread.",
    grantable: true,
  },
  tools_visualize: {
    label: "Show tools used",
    badge: "Tools display",
    description: "Report which tools it used (display only — Voxa never executes tools).",
    grantable: true,
  },
  room_presence: {
    label: "Appear in the room",
    badge: "Room presence",
    description: "Show as a participant card in the room.",
    grantable: true,
  },
  room_audio_listen: {
    label: "Listen to room audio",
    badge: "Audio",
    description: "Not available. Future capability — never granted today.",
    grantable: false,
  },
  room_audio_speak: {
    label: "Speak in the room",
    badge: "Voice",
    description: "Not available. Future capability — never granted today.",
    grantable: false,
  },
  room_transcript_read: {
    label: "Read the room transcript",
    badge: "Transcript",
    description: "Not available. Future capability — never granted today.",
    grantable: false,
  },
};

const GRANTABLE_SET = new Set<string>(GRANTABLE_EXTERNAL_AGENT_PERMISSIONS);

export function isGrantablePermission(value: string): value is ExternalAgentPermission {
  return GRANTABLE_SET.has(value);
}

export function isExternalAgentPermission(value: string): value is ExternalAgentPermission {
  return value in EXTERNAL_AGENT_PERMISSION_META;
}

// The effective permissions an agent actually holds at runtime: its registered
// permissions intersected with the grantable set (future permissions are dropped
// here, so they can never be effective). If none are recorded (legacy/empty
// agents), fall back to the minimal default so the current text-only flow keeps
// working.
export function resolveEffectivePermissions(
  registered: string[] | null | undefined,
): ExternalAgentPermission[] {
  const granted = (registered ?? []).filter(isGrantablePermission);
  const unique = [...new Set(granted)];
  return unique.length > 0 ? unique : [...DEFAULT_EXTERNAL_AGENT_PERMISSIONS];
}

export function hasPermission(
  permissions: ExternalAgentPermission[],
  permission: ExternalAgentPermission,
): boolean {
  return permissions.includes(permission);
}

// Keep only grantable permissions for storage (never persist future ones).
export function sanitizeRequestedPermissions(list: string[] | null | undefined): string[] {
  return [...new Set((list ?? []).filter(isGrantablePermission))];
}

// Friendly, de-duplicated room badges derived from effective permissions.
export function roomPermissionBadges(permissions: ExternalAgentPermission[]): string[] {
  const badges: string[] = [];
  if (permissions.includes("room_text_reply")) {
    badges.push("Text reply");
  }
  if (permissions.includes("memory_read_thread") || permissions.includes("memory_write_thread")) {
    badges.push("Thread memory");
  }
  if (permissions.includes("tools_visualize")) {
    badges.push("Tools display");
  }
  return badges;
}
