"use client";

import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import {
  getAgentById,
  getAgentParticipantUserId,
  getDefaultAgent,
  NOVA_AGENT_ID,
} from "@/lib/agents";
import {
  getAuthRedirectUrl,
  getEmailVerificationRedirectUrl,
  getSupabaseClient,
} from "@/lib/supabase";
import { isSharedRoomSchemaError, leaveSharedRoom } from "@/lib/room-sync";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Participant {
  id: string;
  name: string;
  email?: string;
  participantType: "human" | "agent";
  role: "human" | "ai";
  avatar: string;
  status: "online" | "in-room" | "offline";
}

export interface RoomEvent {
  id: string;
  createdAt: string;
  type: "room" | "participant" | "agent";
  text: string;
}

export interface Room {
  id: string;
  roomId: string;
  name: string;
  createdAt: string;
  createdBy: string;
  status: "active" | "ended";
  endedAt: string | null;
  participants: Participant[];
  invitedAgents: string[];
  events: RoomEvent[];
  mutedParticipantIds: string[];
  isPrivate: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  authError: string | null;
  isAuthenticated: boolean;
  hydrate: () => Promise<void>;
  login: (nextPath?: string) => Promise<void>;
  loginWithGoogle: (nextPath?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (
    email: string,
    password: string,
    nextPath?: string,
  ) => Promise<"signed-in" | "confirmation-required">;
  resendVerificationEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: Session | null) => void;
  setAuthError: (message: string | null) => void;
}

interface RoomState {
  currentRoom: Room | null;
  rooms: Room[];
  hydrate: () => void;
  createRoom: (user: User, options?: { inviteAgentId?: string; inviteNova?: boolean }) => Room;
  joinRoom: (roomId: string, user: User) => Room | null;
  getRoom: (roomId: string) => Room | null;
  setCurrentRoom: (room: Room | null) => void;
  addParticipant: (roomId: string, participant: Participant) => Room | null;
  inviteAgent: (roomId: string, agentId: string) => Room | null;
  inviteNova: (roomId: string) => Room | null;
  addRoomEvent: (roomId: string, text: string, type?: RoomEvent["type"]) => Room | null;
  toggleMute: (roomId: string, userId: string) => Room | null;
  leaveRoom: (roomId: string, userId: string) => Room | null;
}

const roomStorageKey = "voxa-room-storage";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const defaultAgent = getDefaultAgent();
const defaultAgentId = defaultAgent?.id ?? "nova";
const defaultAgentName = defaultAgent?.name ?? "Nova";

// Temporary auth diagnostics. Off by default; set NEXT_PUBLIC_AUTH_DEBUG=true to enable.
const AUTH_DEBUG =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AUTH_DEBUG === "true";
export function authDebug(event: string, data?: Record<string, unknown>) {
  if (AUTH_DEBUG) {
    console.info(`[voxa-auth] ${event}`, data ?? {});
  }
}

export const novaParticipant: Participant = {
  id: defaultAgentId,
  name: defaultAgentName,
  participantType: "agent",
  role: "ai",
  avatar: "",
  status: "online",
};

export function getRoomAgentParticipants(participants: Participant[]) {
  return participants.filter((participant) => participant.participantType === "agent");
}

export function getRoomAgentById(agentId: string, participants: Participant[]) {
  const participantUserId = getAgentParticipantUserId(agentId);

  return (
    getRoomAgentParticipants(participants).find(
      (participant) => participant.id === participantUserId || participant.id === agentId,
    ) ?? null
  );
}

export function isAgentInRoom(agentId: string, participants: Participant[]) {
  return !!getRoomAgentById(agentId, participants);
}

function readSessionValue<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionValue<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function createEvent(text: string, type: RoomEvent["type"] = "room"): RoomEvent {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: randomId,
    createdAt: new Date().toISOString(),
    type,
    text,
  };
}

function createRoomId() {
  const bytes = new Uint8Array(7);

  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function isSafeRoomId(roomId: string) {
  return /^[a-zA-Z0-9_-]{6,80}$/.test(roomId);
}

function userFromSession(session: Session | null): User | null {
  const authUser = session?.user;

  if (!authUser?.email) {
    return null;
  }

  const metadata = authUser.user_metadata ?? {};
  const name =
    metadata.full_name ||
    metadata.name ||
    authUser.email.split("@")[0]?.replace(/[._-]/g, " ") ||
    "Voxa User";

  return {
    id: authUser.id,
    name,
    email: authUser.email,
    avatar: metadata.avatar_url || metadata.picture || "",
  };
}

function reportMissingSupabase(message: string) {
  console.error(
    "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in voxa-beta/.env.local.",
  );
  return message;
}

function friendlyAuthErrorMessage(error: unknown, fallback: string) {
  const authError = error as { code?: string; message?: string } | null;
  const message = authError?.message ?? fallback;

  if (
    authError?.code === "email_not_confirmed" ||
    /email not confirmed/i.test(message) ||
    /confirm/i.test(message)
  ) {
    return "Please verify your email before logging in.";
  }

  return message;
}

async function withAuthTimeout<T>(operation: Promise<T>, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, 15000);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function participantFromUser(user: User): Participant {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    participantType: "human",
    role: "human",
    avatar: user.avatar,
    status: "in-room",
  };
}

function upsertParticipant(participants: Participant[], participant: Participant) {
  const exists = participants.some((existing) => existing.id === participant.id);

  if (exists) {
    return participants.map((existing) =>
      existing.id === participant.id ? { ...existing, ...participant } : existing,
    );
  }

  return [...participants, participant];
}

function upsertRoom(rooms: Room[], room: Room) {
  return [room, ...rooms.filter((existingRoom) => existingRoom.id !== room.id)];
}

function saveRooms(currentRoom: Room | null, rooms: Room[]) {
  writeSessionValue(roomStorageKey, { currentRoom, rooms });
}

function normalizeRoom(room: Partial<Room> & { host?: string }): Room {
  const id = room.id ?? room.roomId ?? createRoomId();
  const participants = room.participants ?? [];
  const invitedAgents =
    room.invitedAgents ??
    participants
      .filter((participant) => (participant.participantType ?? participant.role) !== "human")
      .map((participant) => getAgentById(participant.id)?.id ?? participant.id);
  const normalizedParticipants = participants.map((participant) => {
    const participantType =
      participant.participantType ?? (participant.role === "ai" ? "agent" : "human");

    return {
      ...participant,
      participantType,
      role: participant.role ?? (participantType === "agent" ? "ai" : "human"),
    };
  });

  return {
    id,
    roomId: room.roomId ?? id,
    name: room.name ?? "Voxa Room",
    createdAt: room.createdAt ?? new Date().toISOString(),
    createdBy: room.createdBy ?? room.host ?? "voxa",
    status: room.status ?? "active",
    endedAt: room.endedAt ?? null,
    participants: normalizedParticipants,
    invitedAgents,
    events: room.events ?? [],
    mutedParticipantIds: room.mutedParticipantIds ?? [],
    isPrivate: room.isPrivate ?? true,
  };
}

function participantFromAgent(agentId: string): Participant | null {
  const agent = getAgentById(agentId);

  if (!agent) {
    return null;
  }

  return {
    id: getAgentParticipantUserId(agent.id),
    name: agent.name,
    participantType: "agent",
    role: "ai",
    avatar: agent.avatar ?? "",
    status: "online",
  };
}

function roomWithAgent(room: Room, agentId: string) {
  const agent = getAgentById(agentId);
  const agentParticipant = participantFromAgent(agentId);

  if (!agent || !agentParticipant) {
    return room;
  }

  const participantUserId = getAgentParticipantUserId(agent.id);
  const alreadyInvited = room.invitedAgents.includes(agent.id);
  const hasAgentParticipant = isAgentInRoom(agent.id, room.participants);

  return {
    ...room,
    invitedAgents: alreadyInvited
      ? room.invitedAgents
      : [...room.invitedAgents, agent.id],
    participants: hasAgentParticipant
      ? room.participants.map((participant) =>
          participant.id === participantUserId
            ? { ...participant, status: "in-room" as const }
            : participant,
        )
      : [...room.participants, { ...agentParticipant, status: "in-room" as const }],
    events: alreadyInvited
      ? room.events
      : [...room.events, createEvent(`${agent.name} joined the room`, "agent")],
  };
}

function roomWithNova(room: Room) {
  return roomWithAgent(room, NOVA_AGENT_ID);
}

function createRoomRecord(
  user: User,
  options?: { roomId?: string; inviteAgentId?: string; inviteNova?: boolean },
): Room {
  const roomId = options?.roomId ?? createRoomId();
  const baseRoom: Room = {
    id: roomId,
    roomId,
    name: "Voxa Room",
    createdAt: new Date().toISOString(),
    createdBy: user.id,
    status: "active",
    endedAt: null,
    participants: [participantFromUser(user)],
    invitedAgents: [],
    events: [createEvent(`${user.name} started the room`, "room")],
    mutedParticipantIds: [],
    isPrivate: true,
  };

  if (options?.inviteAgentId) {
    return roomWithAgent(baseRoom, options.inviteAgentId);
  }

  return options?.inviteNova ? roomWithNova(baseRoom) : baseRoom;
}

function createUniqueRoomRecord(
  user: User,
  rooms: Room[],
  options?: { inviteAgentId?: string; inviteNova?: boolean },
): Room {
  const existingIds = new Set(rooms.map((room) => room.id));
  let room = createRoomRecord(user, options);
  let attempts = 0;

  while (existingIds.has(room.id) && attempts < 10) {
    room = createRoomRecord(user, options);
    attempts += 1;
  }

  return room;
}

function updateRoom(
  state: Pick<RoomState, "currentRoom" | "rooms">,
  roomId: string,
  updater: (room: Room) => Room,
) {
  const existingRoom =
    state.rooms.find((room) => room.id === roomId) ??
    (state.currentRoom?.id === roomId ? state.currentRoom : null);

  if (!existingRoom) {
    return null;
  }

  return updater(existingRoom);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  authError: null,
  isAuthenticated: false,
  hydrate: async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      authDebug("hydrate:no-supabase-client");
      set({
        user: null,
        isAuthenticated: false,
        loading: false,
        initialized: true,
      });
      return;
    }

    set({ loading: true, authError: null });

    let sessionResponse: Awaited<ReturnType<typeof supabase.auth.getSession>>;
    try {
      sessionResponse = await withAuthTimeout(
        supabase.auth.getSession(),
        "Unable to load your session. Please refresh and try again.",
      );
    } catch (error) {
      authDebug("hydrate:getSession-timeout", { error: String(error) });
      set({
        user: null,
        isAuthenticated: false,
        loading: false,
        initialized: true,
        authError: error instanceof Error ? error.message : "Unable to load your session.",
      });
      return;
    }

    const { data, error } = sessionResponse;

    if (error) {
      authDebug("hydrate:getSession-error", { error: error.message });
      set({
        user: null,
        isAuthenticated: false,
        loading: false,
        initialized: true,
        authError: "Unable to load your session. Please sign in again.",
      });
      return;
    }

    const user = userFromSession(data.session);
    authDebug("hydrate:getSession-result", {
      hasSession: !!data.session,
      hasUser: !!user,
      userId: user?.id,
    });
    set({
      user,
      isAuthenticated: !!user,
      loading: false,
      initialized: true,
      authError: null,
    });
  },
  login: async (nextPath = "/") => {
    await get().loginWithGoogle(nextPath);
  },
  loginWithGoogle: async (nextPath = "/") => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      const message = reportMissingSupabase(
        "Google sign-in is not available yet. Use email login for now.",
      );
      set({ authError: message, loading: false });
      throw new Error(message);
    }

    set({ loading: true, authError: null });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(nextPath),
      },
    });

    if (error) {
      set({
        loading: false,
        authError: "Google sign-in failed. Please try again.",
      });
      throw error;
    }
  },
  signInWithEmail: async (email, password) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      const message = reportMissingSupabase(
        "Email login is not configured yet. Add the Supabase environment variables first.",
      );
      set({ authError: message, loading: false });
      throw new Error(message);
    }

    set({ loading: true, authError: null });

    let signInResponse: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
    try {
      signInResponse = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
        "Sign in took too long. Check your connection and try again.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed. Please try again.";
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    const { data, error } = signInResponse;

    if (error) {
      const message = friendlyAuthErrorMessage(
        error,
        "Unable to sign in with that email and password. Please try again.",
      );
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    let session: Session | null = data.session;
    if (!session) {
      try {
        session = (
          await withAuthTimeout(
            supabase.auth.getSession(),
            "Sign in completed, but loading your session took too long. Please refresh and try again.",
          )
        ).data.session;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Sign in completed, but Voxa could not load your session.";
        set({ user: null, isAuthenticated: false, loading: false, authError: message });
        throw new Error(message);
      }
    }
    const user = userFromSession(session);

    if (!user) {
      const message = "Sign in succeeded, but Voxa could not start your session. Please try again.";
      set({ user: null, isAuthenticated: false, loading: false, authError: message });
      throw new Error(message);
    }

    authDebug("signInWithEmail:success", { userId: user.id, hasSession: !!session });
    set({
      user,
      isAuthenticated: true,
      loading: false,
      initialized: true,
      authError: null,
    });

    return user;
  },
  signUpWithEmail: async (email, password, nextPath = "/") => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      const message = reportMissingSupabase(
        "Email sign up is not configured yet. Add the Supabase environment variables first.",
      );
      set({ authError: message, loading: false });
      throw new Error(message);
    }

    set({ loading: true, authError: null });

    let signUpResponse: Awaited<ReturnType<typeof supabase.auth.signUp>>;
    try {
      signUpResponse = await withAuthTimeout(
        supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: getEmailVerificationRedirectUrl() ?? getAuthRedirectUrl(nextPath),
          },
        }),
        "Account creation took too long. Check your connection and try again.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create your account. Please try again.";
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    const { data, error } = signUpResponse;

    if (error) {
      const message = error.message || "Unable to create your account. Please try again.";
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    if (data.session) {
      await supabase.auth.signOut();
    }

    set({
      user: null,
      isAuthenticated: false,
      loading: false,
      authError: null,
    });

    return "confirmation-required";
  },
  resendVerificationEmail: async (email) => {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getSupabaseClient();

    if (!normalizedEmail) {
      const message = "Enter your email address to resend the verification link.";
      set({ authError: message, loading: false });
      throw new Error(message);
    }

    if (!supabase) {
      const message = reportMissingSupabase(
        "Email verification is not configured yet. Add the Supabase environment variables first.",
      );
      set({ authError: message, loading: false });
      throw new Error(message);
    }

    set({ loading: true, authError: null });

    let resendResponse: Awaited<ReturnType<typeof supabase.auth.resend>>;
    try {
      resendResponse = await withAuthTimeout(
        supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
          options: {
            emailRedirectTo: getEmailVerificationRedirectUrl(),
          },
        }),
        "Resending the verification email took too long. Check your connection and try again.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to resend the verification email. Please try again.";
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    if (resendResponse.error) {
      const message =
        resendResponse.error.message ||
        "Unable to resend the verification email. Please try again.";
      set({ loading: false, authError: message });
      throw new Error(message);
    }

    set({ loading: false, authError: null });
  },
  logout: async () => {
    const currentUser = get().user;
    const currentRoom = useRoomStore.getState().currentRoom;

    if (currentUser && currentRoom) {
      try {
        await leaveSharedRoom(currentRoom.id, currentUser);
      } catch (error) {
        if (!isSharedRoomSchemaError(error)) {
          console.warn("Unable to leave shared room during logout.", error);
        }

        useRoomStore.getState().leaveRoom(currentRoom.id, currentUser.id);
      }
    }

    const supabase = getSupabaseClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    set({
      user: null,
      isAuthenticated: false,
      loading: false,
      authError: null,
    });
  },
  setSession: (session) => {
    const user = userFromSession(session);
    authDebug("setSession", { hasSession: !!session, hasUser: !!user, userId: user?.id });
    set({
      user,
      isAuthenticated: !!user,
      loading: false,
      initialized: true,
      authError: null,
    });
  },
  setAuthError: (message) => set({ authError: message, loading: false }),
}));

export const useRoomStore = create<RoomState>()((set, get) => ({
  currentRoom: null,
  rooms: [],
  hydrate: () => {
    const storedRooms = readSessionValue<Pick<RoomState, "currentRoom" | "rooms">>(roomStorageKey);
    const rooms = storedRooms?.rooms?.map((room) => normalizeRoom(room)) ?? [];
    const currentRoom = storedRooms?.currentRoom ? normalizeRoom(storedRooms.currentRoom) : null;

    set({
      currentRoom,
      rooms,
    });
  },
  createRoom: (user, options) => {
    let createdRoom: Room | null = null;

    set((state) => {
      const newRoom = createUniqueRoomRecord(user, state.rooms, options);
      createdRoom = newRoom;
      const nextRooms = upsertRoom(state.rooms, newRoom);
      saveRooms(newRoom, nextRooms);
      return { currentRoom: newRoom, rooms: nextRooms };
    });

    return createdRoom ?? createRoomRecord(user, options);
  },
  joinRoom: (roomId, user) => {
    const normalizedRoomId = roomId.trim();

    if (!isSafeRoomId(normalizedRoomId)) {
      return null;
    }

    const userParticipant = participantFromUser(user);
    const existingRoom = get().rooms.find((room) => room.id === normalizedRoomId);
    const joinedRoom = existingRoom
      ? {
          ...existingRoom,
          participants: upsertParticipant(existingRoom.participants, userParticipant),
          events: existingRoom.participants.some((participant) => participant.id === user.id)
            ? existingRoom.events
            : [...existingRoom.events, createEvent(`${user.name} joined the room`, "participant")],
        }
      : {
          ...createRoomRecord(user, { roomId: normalizedRoomId }),
          events: [createEvent(`${user.name} joined the room`, "participant")],
        };

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, joinedRoom);
      saveRooms(joinedRoom, nextRooms);
      return { currentRoom: joinedRoom, rooms: nextRooms };
    });

    return joinedRoom;
  },
  getRoom: (roomId) => {
    const { currentRoom, rooms } = get();
    return (
      rooms.find((room) => room.id === roomId) ?? (currentRoom?.id === roomId ? currentRoom : null)
    );
  },
  setCurrentRoom: (room) => {
    set((state) => {
      const nextRooms = room ? upsertRoom(state.rooms, room) : state.rooms;
      saveRooms(room, nextRooms);
      return { currentRoom: room, rooms: nextRooms };
    });
  },
  addParticipant: (roomId, participant) => {
    const nextRoom = updateRoom(get(), roomId, (room) => ({
      ...room,
      participants: upsertParticipant(room.participants, participant),
    }));

    if (!nextRoom) {
      return null;
    }

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, nextRoom);
      saveRooms(nextRoom, nextRooms);
      return { currentRoom: nextRoom, rooms: nextRooms };
    });

    return nextRoom;
  },
  inviteNova: (roomId) => {
    return get().inviteAgent(roomId, NOVA_AGENT_ID);
  },
  inviteAgent: (roomId, agentId) => {
    if (!getAgentById(agentId)) {
      return null;
    }

    const nextRoom = updateRoom(get(), roomId, (room) => roomWithAgent(room, agentId));

    if (!nextRoom) {
      return null;
    }

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, nextRoom);
      saveRooms(nextRoom, nextRooms);
      return { currentRoom: nextRoom, rooms: nextRooms };
    });

    return nextRoom;
  },
  addRoomEvent: (roomId, text, type = "room") => {
    const nextRoom = updateRoom(get(), roomId, (room) => ({
      ...room,
      events: [...room.events, createEvent(text, type)],
    }));

    if (!nextRoom) {
      return null;
    }

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, nextRoom);
      saveRooms(nextRoom, nextRooms);
      return { currentRoom: nextRoom, rooms: nextRooms };
    });

    return nextRoom;
  },
  toggleMute: (roomId, userId) => {
    const nextRoom = updateRoom(get(), roomId, (room) => {
      const isMuted = room.mutedParticipantIds.includes(userId);
      return {
        ...room,
        mutedParticipantIds: isMuted
          ? room.mutedParticipantIds.filter((id) => id !== userId)
          : [...room.mutedParticipantIds, userId],
      };
    });

    if (!nextRoom) {
      return null;
    }

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, nextRoom);
      saveRooms(nextRoom, nextRooms);
      return { currentRoom: nextRoom, rooms: nextRooms };
    });

    return nextRoom;
  },
  leaveRoom: (roomId, userId) => {
    const nextRoom = updateRoom(get(), roomId, (room) => {
      const leavingParticipant = room.participants.find((participant) => participant.id === userId);
      const participants = room.participants.filter((participant) => participant.id !== userId);
      const humanCount = participants.filter(
        (participant) => participant.participantType === "human",
      ).length;
      const leftEvent =
        leavingParticipant && leavingParticipant.participantType === "human"
          ? [createEvent(`${leavingParticipant.name} left the room`, "participant")]
          : [];

      return {
        ...room,
        status: humanCount === 0 ? "ended" : room.status,
        endedAt: humanCount === 0 ? new Date().toISOString() : room.endedAt,
        participants,
        events: [...room.events, ...leftEvent],
        mutedParticipantIds: room.mutedParticipantIds.filter((id) => id !== userId),
      };
    });

    if (!nextRoom) {
      return null;
    }

    set((state) => {
      const nextRooms = upsertRoom(state.rooms, nextRoom);
      saveRooms(null, nextRooms);
      return { currentRoom: null, rooms: nextRooms };
    });

    return nextRoom;
  },
}));
