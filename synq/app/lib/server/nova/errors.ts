export type NovaErrorCode =
  | "auth_failed"
  | "room_validation_failed"
  | "audio_parse_failed"
  | "transcription_failed"
  | "reasoning_failed"
  | "tts_failed"
  | "playback_failed";

export class NovaProviderError extends Error {
  code: NovaErrorCode;
  details: string;
  provider: string;
  status?: number;

  constructor({
    code,
    details,
    message,
    provider,
    status,
  }: {
    code: NovaErrorCode;
    details: string;
    message?: string;
    provider: string;
    status?: number;
  }) {
    super(message ?? details);
    this.name = "NovaProviderError";
    this.code = code;
    this.details = details;
    this.provider = provider;
    this.status = status;
  }
}

export function sanitizeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/Token\s+[A-Za-z0-9._~-]+/gi, "Token [redacted]")
    .replace(/key[=:]\s*[A-Za-z0-9._~-]+/gi, "key=[redacted]")
    .slice(0, 900);
}

export function statusFromUnknown(error: unknown) {
  const maybeStatus = error as { status?: unknown; statusCode?: unknown } | null;
  const status = maybeStatus?.status ?? maybeStatus?.statusCode;

  return typeof status === "number" ? status : undefined;
}

export function toNovaProviderError(
  error: unknown,
  fallback: {
    code: NovaErrorCode;
    provider: string;
    details?: string;
  },
) {
  if (error instanceof NovaProviderError) {
    return error;
  }

  return new NovaProviderError({
    code: fallback.code,
    details: fallback.details ?? sanitizeErrorMessage(error),
    provider: fallback.provider,
    status: statusFromUnknown(error),
  });
}
