"use client";

import { useCallback, useEffect } from "react";
import { getAgentById, NOVA_AGENT_ID } from "@/lib/agents";
import {
  inviteAgentToSharedRoom,
  isSharedRoomSchemaError,
  joinSharedRoom,
  leaveSharedRoom,
  loadSharedRoom,
  roomPresenceConfig,
  RoomExpiredError,
  subscribeToSharedRoom,
  unsubscribeFromSharedRoom,
  updateSharedRoomHeartbeat,
} from "@/lib/room-sync";
import { getSupabaseClient } from "@/lib/supabase";
import { useRoomStore, type Participant, type User } from "@/lib/store";

export type NovaRoomMode = "manual" | "silent";
const defaultAgent = getAgentById(NOVA_AGENT_ID);
const defaultAgentDispatchRoute = defaultAgent?.routes?.dispatch ?? "/api/agents/nova/dispatch";
const defaultAgentName = defaultAgent?.name ?? "Nova";

function shouldDispatchPersistentNovaAgent() {
  return process.env.NEXT_PUBLIC_NOVA_LIVEKIT_AGENT_ENABLED === "true";
}

async function dispatchNovaAgent(roomId: string, mode: NovaRoomMode) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error(`Sign in before inviting ${defaultAgentName}.`);
  }

  const response = await fetch(defaultAgentDispatchRoute, {
    body: JSON.stringify({ mode, roomId }),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `${defaultAgentName} could not join voice yet.`);
  }

  return response.json() as Promise<{
    agentName: string;
    dispatchId: string;
    mode: NovaRoomMode;
    status: "already-dispatched" | "dispatched";
  }>;
}

export function useRoom() {
  const {
    currentRoom,
    rooms,
    createRoom,
    joinRoom,
    getRoom,
    setCurrentRoom,
    addParticipant,
    inviteAgent,
    inviteNova,
    addRoomEvent,
    toggleMute,
    leaveRoom,
    hydrate,
  } = useRoomStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const createNewRoom = useCallback(
    (user: User, options?: { inviteAgentId?: string; inviteNova?: boolean }) => {
      const newRoom = createRoom(user, options);
      setCurrentRoom(newRoom);
      return newRoom;
    },
    [createRoom, setCurrentRoom],
  );

  const joinExistingRoom = useCallback(
    (roomId: string, user: User) => {
      const room = joinRoom(roomId, user);
      if (room) {
        setCurrentRoom(room);
      }
      return room;
    },
    [joinRoom, setCurrentRoom],
  );

  const joinSharedRoomById = useCallback(
    async (roomId: string, user: User) => {
      try {
        const result = await joinSharedRoom(roomId, user);
        setCurrentRoom(result.room);
        return result;
      } catch (error) {
        if (error instanceof RoomExpiredError) {
          setCurrentRoom(null);
          return null;
        }

        if (isSharedRoomSchemaError(error)) {
          console.warn(
            "Shared room schema is not installed. Supabase participant sync is required.",
          );
          setCurrentRoom(null);
          return null;
        }

        console.warn(
          "Shared room join failed. Refusing local fallback for production sync.",
          error,
        );
        setCurrentRoom(null);
        return null;
      }
    },
    [setCurrentRoom],
  );

  const refreshSharedRoom = useCallback(
    async (roomId: string) => {
      try {
        const nextRoom = await loadSharedRoom(roomId);
        setCurrentRoom(nextRoom);
        return nextRoom;
      } catch {
        return null;
      }
    },
    [setCurrentRoom],
  );

  const inviteAgentShared = useCallback(
    async (roomId: string, agentId: string, mode: NovaRoomMode = "manual") => {
      const agent = getAgentById(agentId);

      if (!agent) {
        console.warn(`Shared agent invite failed because agent "${agentId}" is not registered.`);
        return null;
      }

      try {
        const nextRoom = await inviteAgentToSharedRoom(roomId, agent.id);
        setCurrentRoom(nextRoom);

        if (agent.id === NOVA_AGENT_ID && shouldDispatchPersistentNovaAgent()) {
          try {
            await dispatchNovaAgent(roomId, mode);
          } catch (dispatchError) {
            console.warn(
              `${agent.name} was added to the room, but LiveKit dispatch failed.`,
              dispatchError,
            );
          }
        }

        return nextRoom;
      } catch (error) {
        if (isSharedRoomSchemaError(error)) {
          console.warn(`Shared ${agent.name} invite failed because room schema is missing.`);
          return null;
        }

        console.warn(
          `Shared ${agent.name} invite failed. Refusing local fallback for production sync.`,
          error,
        );
        return null;
      }
    },
    [setCurrentRoom],
  );

  const inviteNovaShared = useCallback(
    (roomId: string, mode: NovaRoomMode = "manual") =>
      inviteAgentShared(roomId, NOVA_AGENT_ID, mode),
    [inviteAgentShared],
  );

  const leaveSharedRoomById = useCallback(
    async (roomId: string, user: User) => {
      try {
        const nextRoom = await leaveSharedRoom(roomId, user);
        setCurrentRoom(null);
        return nextRoom;
      } catch (error) {
        if (!isSharedRoomSchemaError(error)) {
          console.warn("Shared room leave failed. Falling back to local room state.", error);
        }

        return leaveRoom(roomId, user.id);
      }
    },
    [leaveRoom, setCurrentRoom],
  );

  const heartbeatSharedRoom = useCallback(async (roomId: string, user: User) => {
    try {
      await updateSharedRoomHeartbeat(roomId, user);
      return true;
    } catch (error) {
      if (!isSharedRoomSchemaError(error)) {
        console.warn("Shared room heartbeat failed.", error);
      }

      return false;
    }
  }, []);

  const subscribeToRoom = useCallback(
    (roomId: string, onChange: () => void) => subscribeToSharedRoom(roomId, onChange),
    [],
  );

  const addParticipantToRoom = useCallback(
    (roomId: string, participant: Participant) => addParticipant(roomId, participant),
    [addParticipant],
  );

  const copyInviteLink = useCallback(async (roomId: string) => {
    const inviteUrl = `${window.location.origin}/room/${roomId}`;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(inviteUrl);
      return inviteUrl;
    }

    const textArea = document.createElement("textarea");
    textArea.value = inviteUrl;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const copied = document.execCommand("copy");
      if (!copied) {
        throw new Error("Clipboard copy failed.");
      }
    } finally {
      document.body.removeChild(textArea);
    }

    return inviteUrl;
  }, []);

  return {
    room: currentRoom,
    rooms,
    createRoom: createNewRoom,
    joinRoom: joinExistingRoom,
    joinSharedRoom: joinSharedRoomById,
    refreshSharedRoom,
    inviteAgentShared,
    inviteNovaShared,
    leaveSharedRoom: leaveSharedRoomById,
    heartbeatSharedRoom,
    presenceConfig: roomPresenceConfig,
    subscribeToRoom,
    unsubscribeFromSharedRoom,
    getRoom,
    setCurrentRoom,
    addParticipant: addParticipantToRoom,
    inviteAgent,
    inviteNova,
    addRoomEvent,
    copyInviteLink,
    toggleMute,
    leaveRoom,
  };
}
