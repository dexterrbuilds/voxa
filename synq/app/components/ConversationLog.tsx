"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";

/** Follow replies only while the reader is at the end of the conversation. */
export function ConversationLog({
  children,
  label,
  revision,
  empty = false,
}: {
  children: ReactNode;
  label: string;
  revision: unknown;
  empty?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (empty || pinned.current) {
      element.scrollTop = element.scrollHeight;
      pinned.current = true;
      setUnread(false);
    } else setUnread(true);
  }, [revision, empty]);
  return (
    <div className="relative">
      <div
        ref={viewport}
        role="log"
        aria-label={label}
        tabIndex={0}
        className="mt-3 max-h-96 space-y-4 overflow-y-auto overscroll-contain break-words p-1"
        onScroll={() => {
          const element = viewport.current;
          if (!element) return;
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          if (pinned.current) setUnread(false);
        }}
      >
        {children}
      </div>
      {unread && (
        <button
          type="button"
          className="mx-auto mt-2 flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm text-[var(--electric)]"
          onClick={() => {
            if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
            pinned.current = true;
            setUnread(false);
          }}
        >
          <ArrowDown size={14} />
          New activity
        </button>
      )}
    </div>
  );
}
