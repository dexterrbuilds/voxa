import decodeMp3 from "@audio/decode-mp3";
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { AccessToken, TrackSource as TokenTrackSource } from "livekit-server-sdk";

const NOVA_NAME = "Nova";
const FRAME_DURATION_MS = 20;

function requireLiveKitEnv() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured for shared Nova playback.");
  }

  return { apiKey, apiSecret, url };
}

function bufferToUint8Array(audio: Buffer) {
  return new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
}

function mixToMono(channelData: Float32Array[]) {
  if (channelData.length === 0) {
    throw new Error("Nova TTS audio could not be decoded.");
  }

  if (channelData.length === 1) {
    return channelData[0]!;
  }

  const sampleCount = Math.min(...channelData.map((channel) => channel.length));
  const mono = new Float32Array(sampleCount);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sample = 0;

    for (const channel of channelData) {
      sample += channel[sampleIndex] ?? 0;
    }

    mono[sampleIndex] = sample / channelData.length;
  }

  return mono;
}

function floatToInt16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

async function createNovaLiveKitToken(roomId: string) {
  const { apiKey, apiSecret } = requireLiveKitEnv();
  const playbackIdentity = `agent:nova:playback:${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    attributes: {
      "lk.agent.state": "speaking",
      "voxa.agent_id": "nova",
      "voxa.participant_type": "agent",
    },
    identity: playbackIdentity,
    metadata: JSON.stringify({
      agent_id: "nova",
      participant_type: "agent",
      playback: true,
    }),
    name: NOVA_NAME,
    ttl: "5m",
  });

  token.addGrant({
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TokenTrackSource.MICROPHONE],
    canSubscribe: false,
    room: roomId,
    roomJoin: true,
  });

  return token.toJwt();
}

export async function publishNovaAudioToLiveKitRoom({
  audio,
  roomId,
}: {
  audio: Buffer;
  roomId: string;
}) {
  const { url } = requireLiveKitEnv();
  const { channelData, sampleRate } = await decodeMp3(bufferToUint8Array(audio));
  const mono = mixToMono(channelData);
  const samplesPerFrame = Math.max(1, Math.round((sampleRate * FRAME_DURATION_MS) / 1000));
  const source = new AudioSource(sampleRate, 1);
  const track = LocalAudioTrack.createAudioTrack("nova-response", source);
  const room = new Room();

  try {
    const token = await createNovaLiveKitToken(roomId);
    await room.connect(url, token, {
      autoSubscribe: false,
      dynacast: false,
    });

    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    if (!room.localParticipant) {
      throw new Error("Nova could not join the voice room.");
    }

    await room.localParticipant.publishTrack(track, options);

    for (let offset = 0; offset < mono.length; offset += samplesPerFrame) {
      const frameSampleCount = Math.min(samplesPerFrame, mono.length - offset);
      const frame = AudioFrame.create(sampleRate, 1, frameSampleCount);

      for (let index = 0; index < frameSampleCount; index += 1) {
        frame.data[index] = floatToInt16(mono[offset + index] ?? 0);
      }

      await source.captureFrame(frame);
    }

    await source.waitForPlayout();

    return {
      durationMs: Math.round((mono.length / sampleRate) * 1000),
      sampleRate,
    };
  } finally {
    await track.close(false).catch(() => undefined);
    await source.close().catch(() => undefined);
    await room.disconnect().catch(() => undefined);
  }
}
