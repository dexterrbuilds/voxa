"use client";

import { Check, Copy, Link as LinkIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BetaButton, BetaPanel } from "@/components/BetaChrome";
import { useRoom } from "@/lib/room";

type InviteLinkProps = {
  compact?: boolean;
  inline?: boolean;
  roomId: string;
};

export default function InviteLink({ compact = false, inline = false, roomId }: InviteLinkProps) {
  const { copyInviteLink } = useRoom();
  const [inviteUrl, setInviteUrl] = useState(`/room/${roomId}`);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    setInviteUrl(`${window.location.origin}/room/${roomId}`);
  }, [roomId]);

  const copyToClipboard = () => {
    setCopyError("");
    copyInviteLink(roomId)
      .then(() => {
        setInviteUrl(`${window.location.origin}/room/${roomId}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setCopyError("Unable to copy the link. Select and copy it manually.");
      });
  };

  const content = (
    <>
      {compact ? (
        <BetaButton className="min-h-9 px-3 text-xs" onClick={copyToClipboard} variant="glass">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Invite"}
        </BetaButton>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[oklch(0.72_0.2_245/0.22)] bg-[oklch(0.72_0.2_245/0.1)] shadow-[0_0_30px_-16px_oklch(0.72_0.2_245/0.9)]">
              <LinkIcon className="h-4 w-4 text-[oklch(0.78_0.18_235)]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">Invite link</div>
              <div className="mt-1 truncate font-mono text-xs text-[oklch(0.65_0.02_260)]">
                {inviteUrl}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BetaButton
              className="min-h-10 px-3 text-sm"
              onClick={() => setIsOpen(true)}
              variant="glass"
            >
              <LinkIcon className="h-4 w-4" />
              Invite
            </BetaButton>
            <BetaButton className="min-h-10 px-3 text-sm" onClick={copyToClipboard} variant="glass">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </BetaButton>
          </div>
          {copyError && <p className="text-sm text-[oklch(0.78_0.14_40)]">{copyError}</p>}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.012_260/0.72)] px-4 backdrop-blur-xl">
          <BetaPanel className="w-full max-w-xl p-6 shadow-[0_30px_120px_-40px_oklch(0.72_0.2_245/0.75)]">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="beta-status-pill">
                  <LinkIcon className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
                  Invite people
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">
                  Invite people into this room.
                </h2>
                <p className="mt-3 leading-relaxed text-[oklch(0.65_0.02_260)]">
                  Share this link with anyone you want to bring into the conversation.
                </p>
              </div>
              <button
                aria-label="Close invite modal"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[oklch(0.65_0.02_260)] transition-colors hover:text-white"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-7 rounded-xl border border-white/[0.07] bg-[oklch(0.11_0.015_260/0.62)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input className="beta-input font-mono text-sm" readOnly value={inviteUrl} />
                <BetaButton className="shrink-0" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy Link"}
                </BetaButton>
              </div>
              {copyError && <p className="mt-3 text-sm text-[oklch(0.78_0.14_40)]">{copyError}</p>}
            </div>
          </BetaPanel>
        </div>
      )}
    </>
  );

  if (compact || inline) {
    return content;
  }

  return <BetaPanel className="mt-8 p-5">{content}</BetaPanel>;
}
