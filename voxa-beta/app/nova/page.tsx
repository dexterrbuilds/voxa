"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  History,
  LogOut,
  Mic,
  Pencil,
  Plus,
  Square,
  Wallet,
  X,
  Volume2,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { novaFetch } from "@/lib/nova-launch/client";
import { startCapture } from "@/lib/nova-launch/capture";
import { useWakeWord } from "@/lib/wake-word/useWakeWord";
import { isWakeWordEnabled } from "@/lib/wake-word/config";
import { solanaAddress, type ResolvedSwapParams } from "@/lib/nova-launch/solana";
import { ChainObject, QuoteFacts } from "./ChainObjects";
import type {
  ActionPlan,
  ConnectedAccount,
  Conversation,
  ExecutionResult,
  NovaBlock,
  Turn,
} from "@/lib/nova-launch/types";
import "./nova.css";

type SavedPlan = { id: string; status: ActionPlan["status"]; result: ExecutionResult | null };
const suggestions = [
  "Swap 1 SOL to USDC",
  "Show my positions",
  "Open SOL long with 200 USDC at 3x",
  "Explain this transaction",
];

export default function NovaPage() {
  return (
    <ProtectedRoute>
      <NovaExperience />
    </ProtectedRoute>
  );
}

function NovaExperience() {
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "responding" | "speaking">(
    "idle",
  );
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [chainEnabled, setChainEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [wakeArmed, setWakeArmed] = useState(false);
  const [newActivity, setNewActivity] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>();
  const run = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const request = useRef<{ conversationId: string; requestId: string } | null>(null);
  const capture = useRef<Awaited<ReturnType<typeof startCapture>> | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);

  function clearAudio() {
    player.current?.pause();
    player.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }
  function stop() {
    run.current++;
    abort.current?.abort();
    capture.current?.cancel();
    capture.current = null;
    clearAudio();
    busy.current = false;
    if (request.current)
      void novaFetch("message", { method: "DELETE", body: JSON.stringify(request.current) }).catch(
        () => {},
      );
    request.current = null;
    setState("idle");
  }
  useEffect(() => {
    mounted.current = true;
    void novaFetch("capabilities")
      .then((r) => r.json())
      .then((data) => {
        if (mounted.current) setChainEnabled(data.solanaReads === true);
      })
      .catch(() => {});
    void novaFetch("conversations")
      .then((r) => r.json())
      .then((data) => {
        if (mounted.current) setConversations(data.conversations);
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
      // This is a request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      run.current++;
      abort.current?.abort();
      capture.current?.cancel();
      clearAudio();
    };
  }, [user?.id]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(viewport?.height);
    resize();
    viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!walletOpen && !renaming && !drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      walletOpen || renaming ? ".nova-modal" : ".nova-history",
    );
    dialog?.querySelector<HTMLElement>("button,input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWalletOpen(false);
        setRenaming(false);
        setDrawer(false);
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),input")];
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [walletOpen, renaming, drawer]);
  useEffect(() => {
    if (pinned.current && log.current) {
      log.current.scrollTop = log.current.scrollHeight;
      setNewActivity(false);
    } else setNewActivity(true);
  }, [messages, state]);

  async function refreshList() {
    const data = await (await novaFetch("conversations")).json();
    setConversations(data.conversations);
  }
  async function openConversation(c: Conversation) {
    stop();
    const generation = run.current;
    setPending(true);
    setDrawer(false);
    setError("");
    try {
      const data = await (await novaFetch(`conversations?id=${c.id}`)).json();
      if (run.current !== generation) return;
      setSelected(data.conversation);
      setMessages(data.messages);
      setPlans(data.plans);
      pinned.current = true;
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversation unavailable.");
    } finally {
      setPending(false);
    }
  }
  async function newConversation() {
    stop();
    setPending(true);
    setError("");
    setDrawer(false);
    try {
      const data = await (await novaFetch("conversations", { method: "POST" })).json();
      setSelected(data.conversation);
      setMessages([]);
      setPlans([]);
      setDraft("");
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a conversation.");
    } finally {
      setPending(false);
    }
  }
  async function send(
    text = draft,
    conversationOverride: Conversation | null = null,
    readReply = false,
    requotePlanId?: string,
  ) {
    if (!text.trim() || busy.current || pending) return;
    busy.current = true;
    const generation = ++run.current;
    setState("thinking");
    setError("");
    setDraft("");
    pinned.current = true;
    setPlans((items) =>
      items.map((p) => (p.status === "pending" ? { ...p, status: "superseded" } : p)),
    );
    const controller = new AbortController();
    abort.current = controller;
    try {
      let c = conversationOverride || selected;
      if (!c) {
        c = (
          await (
            await novaFetch("conversations", { method: "POST", signal: controller.signal })
          ).json()
        ).conversation;
        setSelected(c);
      }
      if (!c || run.current !== generation) return;
      const requestId = crypto.randomUUID();
      request.current = { conversationId: c.id, requestId };
      const replyId = crypto.randomUUID();
      setMessages((items) => [
        ...items,
        { id: requestId, role: "user", text, blocks: [] },
        { id: replyId, role: "nova", text: "", blocks: [] },
      ]);
      const response = await novaFetch("message", {
        method: "POST",
        body: JSON.stringify({
          ...request.current,
          text,
          ...(chainEnabled
            ? {
                account: account ? { address: account.address, kind: account.kind } : null,
                requotePlanId,
              }
            : {}),
        }),
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream.");
      const decoder = new TextDecoder();
      let buffer = "",
        completed = false;
      while (true) {
        const { done, value } = await reader.read();
        if (run.current !== generation) break;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (event.type === "text") {
            setState("responding");
            setMessages((items) =>
              items.map((m) => (m.id === replyId ? { ...m, text: m.text + event.delta } : m)),
            );
          }
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "complete") {
            completed = true;
            setMessages((items) =>
              items.map((m) => (m.id === replyId ? { ...m, blocks: event.blocks } : m)),
            );
          }
        }
      }
      if (run.current === generation) {
        if (!completed) throw new Error("The reply was interrupted. Please try again.");
        const saved = await (
          await novaFetch(`conversations?id=${c.id}`, { signal: controller.signal })
        ).json();
        if (run.current === generation) {
          setMessages(saved.messages);
          setPlans(saved.plans);
          await refreshList();
          if (readReply && run.current === generation) {
            const lastReply = saved.messages.at(-1) as Turn | undefined;
            if (lastReply?.role === "nova") {
              busy.current = false;
              request.current = null;
              await speak(lastReply, c);
            }
          }
        }
      }
    } catch (e) {
      if (run.current === generation && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Nova couldn't respond.");
    } finally {
      if (run.current === generation) {
        busy.current = false;
        request.current = null;
        setState("idle");
      }
    }
  }
  async function record() {
    if (busy.current || pending) return;
    busy.current = true;
    const generation = ++run.current;
    setState("listening");
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      let c = selected;
      if (!c) {
        c = (
          await (
            await novaFetch("conversations", { method: "POST", signal: controller.signal })
          ).json()
        ).conversation;
        setSelected(c);
      }
      if (!c || run.current !== generation) return;
      const conversationId = c.id;
      const handle = await startCapture(
        async (audio) => {
          if (run.current !== generation) return;
          capture.current = null;
          setState("thinking");
          try {
            const form = new FormData();
            form.set("conversationId", conversationId);
            form.set("audio", audio, "prompt");
            const data = await (
              await novaFetch("audio", { method: "POST", body: form, signal: controller.signal })
            ).json();
            if (run.current !== generation) return;
            busy.current = false;
            setState("idle");
            setDraft(data.text);
            // Voice and text enter exactly the same intent/model pipeline.
            await send(data.text, c, true);
          } catch (e) {
            if (run.current === generation) {
              busy.current = false;
              setState("idle");
              setError(e instanceof Error ? e.message : "Voice unavailable.");
            }
          }
        },
        (message) => {
          if (run.current === generation) {
            setError(message);
            busy.current = false;
            setState("idle");
          }
        },
      );
      if (run.current !== generation) handle.cancel();
      else capture.current = handle;
    } catch {
      if (run.current === generation) {
        setError("Microphone unavailable. Allow access in your browser or type a message.");
        busy.current = false;
        setState("idle");
      }
    }
  }
  const wake = useWakeWord({
    enabled: wakeArmed && state === "idle" && isWakeWordEnabled(),
    onWake: () => void record(),
    canTrigger: () => !busy.current && !pending,
  });

  async function speak(turn: Turn, conversationOverride: Conversation | null = null) {
    const conversation = conversationOverride || selected;
    if (busy.current || !conversation) return;
    busy.current = true;
    const generation = ++run.current;
    const controller = new AbortController();
    abort.current = controller;
    setState("thinking");
    setError("");
    try {
      const form = new FormData();
      form.set("conversationId", conversation.id);
      form.set("messageId", turn.id);
      const blob = await (
        await novaFetch("audio", { method: "POST", body: form, signal: controller.signal })
      ).blob();
      if (run.current !== generation) return;
      clearAudio();
      audioUrl.current = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl.current);
      player.current = audio;
      audio.onended = () => {
        clearAudio();
        busy.current = false;
        setState("idle");
      };
      audio.onerror = () => {
        clearAudio();
        busy.current = false;
        setState("idle");
        setError("Audio couldn't play. Your reply is saved as text.");
      };
      await audio.play();
      setState("speaking");
    } catch {
      if (run.current === generation) {
        clearAudio();
        busy.current = false;
        setState("idle");
        setError("Voice playback unavailable. Your text reply is saved.");
      }
    }
  }
  async function approve(plan: ActionPlan, operation: "approve" | "cancel") {
    setPending(true);
    setError("");
    try {
      const result = await (
        await novaFetch("actions", {
          method: "POST",
          body: JSON.stringify({
            id: plan.id,
            hash: plan.hash,
            approvalToken: plan.approvalToken,
            operation,
          }),
        })
      ).json();
      setPlans((items) =>
        items.map((p) =>
          p.id === plan.id
            ? {
                ...p,
                status: result.cancelled ? "cancelled" : "executed",
                result: result.cancelled ? null : result,
              }
            : p,
        ),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval unavailable.");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function rename() {
    if (!selected) return;
    setPending(true);
    try {
      await novaFetch("conversations", {
        method: "PATCH",
        body: JSON.stringify({ id: selected.id, title }),
      });
      setSelected({ ...selected, title });
      setRenaming(false);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename.");
    } finally {
      setPending(false);
    }
  }
  function watchAddress(value: string, kind: "watch" | "wallet" = "watch") {
    try {
      solanaAddress(value.trim());
    } catch {
      setError("Enter a Solana address, not a seed phrase or private key.");
      return;
    }
    setAccount({ chain: "solana", address: value.trim(), kind, access: ["read", "propose"] });
    setWalletOpen(false);
    setError("");
  }
  async function connectWallet() {
    try {
      const wallet = (
        window as Window & {
          solana?: { connect: () => Promise<{ publicKey: { toString: () => string } }> };
        }
      ).solana;
      if (!wallet) {
        setError("No compatible wallet found. You can add a read-only address instead.");
        return;
      }
      const connected = await wallet.connect();
      watchAddress(connected.publicKey.toString(), "wallet");
    } catch {
      setError("Wallet connection cancelled. No permissions were granted.");
    }
  }

  return (
    <div className="nova-app glacier-world" style={{ height: viewportHeight }}>
      <header className="nova-header glass-surface">
        <button
          className="nova-icon"
          aria-label="Conversation history"
          onClick={() => setDrawer(!drawer)}
        >
          <History size={20} />
        </button>
        <a href="/nova" className="synq-wordmark">
          <img src="/synq-mark.svg" alt="" />
          Synq <span className="nova-word">/ Nova</span>
        </a>
        <div className="nova-header-actions">
          <ThemeToggle />
          <button
            className="nova-icon"
            aria-label="Account and wallet"
            onClick={() => setWalletOpen(true)}
          >
            <Wallet size={20} />
          </button>
        </div>
      </header>
      {drawer && (
        <>
          <button
            className="nova-scrim"
            aria-label="Close history"
            onClick={() => setDrawer(false)}
          />
          <aside
            className="nova-history glass-elevated"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation history"
          >
            <div className="nova-row">
              <h2>History</h2>
              <button
                className="nova-icon"
                aria-label="Close history"
                onClick={() => setDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>
            <button
              className="nova-secondary"
              disabled={pending}
              onClick={() => void newConversation()}
            >
              <Plus size={17} /> New conversation
            </button>
            <div className="nova-history-list">
              {conversations.length === 0 && (
                <p className="nova-muted">Your conversations will appear here.</p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  className="nova-history-item"
                  aria-current={selected?.id === c.id ? "page" : undefined}
                  onClick={() => void openConversation(c)}
                >
                  {c.title}
                </button>
              ))}
            </div>
            <div className="nova-history-footer">
              <p className="nova-muted">Showing your latest 100 conversations.</p>
              <button
                className="nova-text-action"
                onClick={() => {
                  setDrawer(false);
                  setWalletOpen(true);
                }}
              >
                <Wallet size={16} /> Account and wallet
              </button>
            </div>
          </aside>
        </>
      )}
      <div className="nova-titlebar">
        <span>{selected?.title || "New conversation"}</span>
        <button
          className="nova-icon"
          aria-label="New conversation"
          disabled={pending}
          onClick={() => void newConversation()}
        >
          <Plus size={17} />
        </button>
        {selected && (
          <button
            className="nova-icon"
            aria-label="Rename conversation"
            onClick={() => {
              setTitle(selected.title);
              setRenaming(true);
            }}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      <main
        ref={log}
        className="nova-conversation"
        onScroll={() => {
          const el = log.current;
          if (el) {
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
            if (pinned.current) setNewActivity(false);
          }
        }}
      >
        <div className="nova-thread">
          {messages.length === 0 ? (
            <section className="nova-empty">
              <img className="nova-presence" src="/nova-prism.svg" width={92} height={92} alt="" />
              <p className="nova-kicker">Nova, by Synq</p>
              <h1>
                What do you want
                <br />
                to do on-chain?
              </h1>
              <p>Understand it. Explore it. Plan your next move.</p>
              <div className="nova-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setDraft(s);
                      composer.current?.focus();
                    }}
                  >
                    {s}
                    <ArrowUp size={15} />
                  </button>
                ))}
              </div>
              <p className="nova-muted">
                {chainEnabled
                  ? "Read public Solana data and review live quotes. Signing and execution are disabled."
                  : "Actions are simulations. No funds move. Live wallet data is not connected yet."}
              </p>
            </section>
          ) : (
            messages.map((turn) => (
              <article className={`nova-turn ${turn.role}`} key={turn.id}>
                <div className="nova-speaker">
                  {turn.role === "nova" && (
                    <img className="nova-presence-small" src="/nova-prism.svg" alt="" />
                  )}
                  {turn.role === "nova" ? "Nova" : "You"}
                </div>
                <p>{turn.text || (state === "thinking" ? "Thinking…" : "Reply stopped.")}</p>
                {turn.blocks.map((block, i) => (
                  <Block
                    key={i}
                    block={block}
                    refresh={(plan) => send("Refresh this quote", selected, false, plan.id)}
                    saved={plans}
                    disabled={pending || state !== "idle"}
                    approve={approve}
                    modify={async (plan) => {
                      if (!(await approve(plan, "cancel"))) return;
                      setDraft(
                        plan.action.type === "swap"
                          ? `Swap ${plan.action.params.amount} ${plan.action.params.input} to ${plan.action.params.output}`
                          : plan.action.type === "perp_open"
                            ? `Open SOL ${plan.action.params.side} with ${plan.action.params.collateral} USDC at ${plan.action.params.leverage}x`
                            : "",
                      );
                      composer.current?.focus();
                    }}
                  />
                ))}
                {turn.role === "nova" && turn.text && state === "idle" && (
                  <button className="nova-text-action" onClick={() => void speak(turn)}>
                    <Volume2 size={14} /> Listen
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      </main>
      <footer className="nova-composer-wrap">
        {newActivity && messages.length > 0 && (
          <button
            className="nova-text-action"
            onClick={() => {
              pinned.current = true;
              if (log.current) log.current.scrollTop = log.current.scrollHeight;
              setNewActivity(false);
            }}
          >
            New activity ↓
          </button>
        )}
        {error && (
          <div role="alert" className="nova-error">
            {error}
            <button aria-label="Dismiss error" className="nova-icon" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <form
          className="nova-composer glass-surface"
          data-state={state}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={composer}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Nova, or paste an address or transaction…"
            aria-label="Message Nova"
            rows={2}
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="nova-row">
            <button type="button" className="nova-text-action" onClick={() => setWalletOpen(true)}>
              <Wallet size={16} />
              {account ? `${account.address.slice(0, 4)}…${account.address.slice(-4)}` : "Account"}
            </button>
            <span className="nova-status" role="status">
              {state === "listening"
                ? "Listening · pause to send"
                : state === "thinking"
                  ? "Thinking…"
                  : state === "responding"
                    ? "Responding…"
                    : state === "speaking"
                      ? "Speaking"
                      : chainEnabled
                        ? "Read & quote only"
                        : "Simulation only"}
            </span>
            <div className="nova-row">
              {state === "idle" ? (
                <>
                  <button
                    type="button"
                    className="nova-icon glass-control"
                    aria-label="Talk to Nova"
                    disabled={pending}
                    onClick={() => void record()}
                  >
                    <Mic size={21} />
                  </button>
                  <button
                    className="nova-send"
                    aria-label="Send message"
                    disabled={pending || !draft.trim()}
                  >
                    <ArrowUp size={20} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="nova-icon"
                    aria-label="Cancel response"
                    onClick={stop}
                  >
                    <X size={20} />
                  </button>
                  {state === "listening" && (
                    <button
                      type="button"
                      className="nova-send"
                      aria-label="Stop recording and send"
                      onClick={() => capture.current?.stop()}
                    >
                      <Square size={17} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </form>
        {isWakeWordEnabled() && (
          <label className="nova-wake">
            <input
              type="checkbox"
              checked={wakeArmed}
              onChange={(e) => setWakeArmed(e.target.checked)}
            />{" "}
            Enable local wake word {wake.error ? "· unavailable, use the mic button" : ""}
          </label>
        )}
      </footer>
      {(walletOpen || renaming) && (
        <div className="nova-modal-wrap">
          <section
            className="nova-modal glass-elevated"
            role="dialog"
            aria-modal="true"
            aria-label={walletOpen ? "Account and wallet" : "Rename conversation"}
          >
            <div className="nova-row">
              <h2>{walletOpen ? "Your account" : "Rename conversation"}</h2>
              <button
                className="nova-icon"
                aria-label="Close dialog"
                onClick={() => {
                  setWalletOpen(false);
                  setRenaming(false);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {walletOpen ? (
              <>
                {error && (
                  <p role="alert" className="nova-error">
                    {error}
                  </p>
                )}
                <p className="nova-muted">{user?.email}</p>
                <p>
                  Connect a wallet or add a read-only address. Nova cannot sign transactions or move
                  funds.
                </p>
                <button className="nova-secondary" onClick={() => void connectWallet()}>
                  <Wallet size={17} /> Connect wallet
                </button>
                <label>
                  Solana address
                  <input
                    aria-label="Solana address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button className="nova-primary" onClick={() => watchAddress(address)}>
                  Use read-only address
                </button>
                {account && (
                  <>
                    <p className="nova-muted">
                      {account.kind === "wallet"
                        ? "Connected wallet · read-only"
                        : "Address being inspected · no ownership claimed"}
                    </p>
                    <p className="nova-address">{account.address}</p>
                    <button className="nova-text-action" onClick={() => setAccount(null)}>
                      Remove account access
                    </button>
                  </>
                )}
                <button
                  className="nova-text-action"
                  onClick={() => {
                    stop();
                    void logout();
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </>
            ) : (
              <>
                <input
                  aria-label="Conversation title"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <button
                  className="nova-primary"
                  disabled={pending || !title.trim()}
                  onClick={() => void rename()}
                >
                  Save title
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Block({
  block,
  saved,
  disabled,
  approve,
  modify,
  refresh,
}: {
  block: NovaBlock;
  saved: SavedPlan[];
  disabled: boolean;
  approve: (p: ActionPlan, op: "approve" | "cancel") => Promise<boolean>;
  modify: (p: ActionPlan) => Promise<void>;
  refresh: (p: ActionPlan) => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now);
  const quoteExpiry =
    (block.type === "action_plan" || block.type === "approval") &&
    block.plan.quote.mode === "quote_only"
      ? Date.parse(block.plan.quote.expiresAt)
      : null;
  useEffect(() => {
    if (quoteExpiry === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, quoteExpiry - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [quoteExpiry]);
  if (
    block.type === "portfolio" ||
    block.type === "token" ||
    block.type === "transaction" ||
    block.type === "activity"
  )
    return <ChainObject block={block} />;
  if (block.type === "action_plan" || block.type === "approval") {
    const plan = block.plan;
    const record = saved.find((p) => p.id === plan.id);
    const status = record?.status || plan.status;
    const realQuote = plan.quote.mode === "quote_only";
    const expired = Date.parse(plan.quote.expiresAt) <= now;
    return (
      <section className="nova-plan glass-elevated">
        <div className="nova-kicker">
          {realQuote ? "Live quote · execution disabled" : "Simulation · not a transaction"}
        </div>
        <h3>{plan.action.type === "swap" ? "Review swap" : "Review SOL position"}</h3>
        {plan.action.type === "swap" && (
          <p className="nova-plan-amount">
            {plan.action.params.amount} {plan.action.params.input} <span aria-label="to">→</span>{" "}
            {plan.action.params.output}
          </p>
        )}
        {plan.action.type === "perp_open" && (
          <p className="nova-plan-amount">
            {plan.action.params.market} <span>{plan.action.params.side}</span>{" "}
            <small>{plan.action.params.leverage}×</small>
          </p>
        )}
        {realQuote && plan.quote.mode === "quote_only" && plan.action.type === "swap" ? (
          <QuoteFacts quote={plan.quote} params={plan.action.params as ResolvedSwapParams} />
        ) : (
          <dl>
            {Object.entries(plan.action.params).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  {String(value)}
                  {key === "collateral" ? " USDC" : key === "leverage" ? "x" : ""}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="nova-muted">
          {realQuote
            ? expired
              ? "Quote expired. Refresh before approving. Quoted until "
              : "Quote expires "
            : "No live price, fees or liquidation estimate. Expires "}
          {new Date(plan.quote.expiresAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: realQuote ? "2-digit" : undefined,
          })}
          .
        </p>
        {record?.result ? (
          <p className="nova-success">
            <Check size={16} />
            {record.result.message}
          </p>
        ) : status === "pending" ? (
          <div className="nova-plan-actions">
            <button
              className="nova-text-action"
              disabled={disabled}
              onClick={() => void approve(plan, "cancel")}
            >
              Cancel
            </button>
            <button
              className="nova-text-action"
              disabled={disabled}
              onClick={() => void modify(plan)}
            >
              Modify
            </button>
            <button
              className="nova-primary"
              disabled={disabled || expired}
              onClick={() => void approve(plan, "approve")}
            >
              {realQuote ? "Approve quote" : "Approve simulation"}
            </button>
          </div>
        ) : (
          <p className="nova-muted">
            {status === "superseded"
              ? "Replaced by a newer request. Approval invalidated."
              : "Cancelled. Request a new plan to continue."}
          </p>
        )}
        {realQuote && (
          <button className="nova-secondary" disabled={disabled} onClick={() => void refresh(plan)}>
            Refresh quote
          </button>
        )}
      </section>
    );
  }
  if (block.type === "error" || block.type === "text" || block.type === "analysis_summary")
    return <p>{block.text}</p>;
  if (block.type === "execution_result") return <p>{block.result.message}</p>;
  return null;
}
