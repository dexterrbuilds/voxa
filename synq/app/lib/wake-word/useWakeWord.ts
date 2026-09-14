"use client";

import { useEffect, useRef, useState } from "react";
import {
  WakeWordController,
  wakeWordErrorMessage,
  type WakeWordErrorReason,
} from "./WakeWordController";

export type WakeWordStatus = "off" | "initializing" | "listening" | "detected" | "error";

type UseWakeWordArgs = {
  /** When true, initialize the worker and start listening locally. */
  enabled: boolean;
  /** Fired when the wake word is detected AND canTrigger() returns true. */
  onWake: () => void;
  /**
   * Guard evaluated at detection time. Return false to ignore the wake word
   * (e.g. Nova is already listening/thinking/speaking, or a send is in flight).
   * Prevents duplicate recordings.
   */
  canTrigger: () => boolean;
};

type UseWakeWordResult = {
  status: WakeWordStatus;
  error: string | null;
  isSupported: boolean;
  usingBuiltInFallback: boolean;
};

const DETECTED_FLASH_MS = 1200;

/**
 * React lifecycle wrapper around {@link WakeWordController}.
 *
 * Owns exactly one controller while `enabled` is true and tears it down on
 * disable or unmount (e.g. leaving the room). Detection handlers are kept in
 * refs so the worker is created once per enable cycle — not on every render —
 * which prevents duplicate workers and duplicate detection handlers.
 */
export function useWakeWord({ enabled, onWake, canTrigger }: UseWakeWordArgs): UseWakeWordResult {
  const [status, setStatus] = useState<WakeWordStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [usingBuiltInFallback, setUsingBuiltInFallback] = useState(false);

  const onWakeRef = useRef(onWake);
  const canTriggerRef = useRef(canTrigger);
  const flashTimerRef = useRef<number | null>(null);

  const isSupported = WakeWordController.isSupported();

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    canTriggerRef.current = canTrigger;
  }, [canTrigger]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!WakeWordController.isSupported()) {
      setStatus("error");
      setError(wakeWordErrorMessage("unsupported"));
      return;
    }

    let cancelled = false;
    const controller = new WakeWordController();
    setStatus("initializing");
    setError(null);

    void controller
      .start(() => {
        if (cancelled || !canTriggerRef.current()) {
          return;
        }

        // Briefly surface "detected", then return to "listening".
        setStatus("detected");
        if (flashTimerRef.current) {
          window.clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = window.setTimeout(() => {
          setStatus((current) => (current === "detected" ? "listening" : current));
        }, DETECTED_FLASH_MS);

        onWakeRef.current();
      })
      .then((result) => {
        if (cancelled) {
          void controller.stop();
          return;
        }

        if (result.ok) {
          setUsingBuiltInFallback(result.usingBuiltInFallback);
          setStatus("listening");
          setError(null);
        } else {
          setStatus("error");
          setError(wakeWordErrorMessage(result.reason as WakeWordErrorReason));
        }
      });

    return () => {
      cancelled = true;
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      void controller.stop();
      setStatus("off");
      setError(null);
    };
  }, [enabled]);

  return { status, error, isSupported, usingBuiltInFallback };
}
