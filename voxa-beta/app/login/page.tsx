"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, Shield, Sparkles } from "lucide-react";
import {
  BetaButton,
  BetaEyebrow,
  BetaHeader,
  BetaPanel,
  BetaShell,
  BetaStat,
} from "@/components/BetaChrome";
import { getDefaultAgent } from "@/lib/agents";
import { useAuth } from "@/lib/auth";

type AuthMode = "login" | "signup" | "check-email";

const googleUnavailableMessage = "Google sign-in is not available yet. Use email login for now.";
const verifiedMessage = "Email verified. You can now log in.";
const defaultAgent = getDefaultAgent();
const defaultAgentName = defaultAgent?.name ?? "Nova";

export default function Login() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResendLoading, setIsResendLoading] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [handledVerifiedState, setHandledVerifiedState] = useState(false);
  const {
    authError,
    isAuthenticated,
    initialized,
    logout,
    resendVerificationEmail,
    signInWithEmail,
    signUpWithEmail,
    setAuthError,
  } = useAuth();
  const router = useRouter();

  const getIsVerifiedRedirect = () => {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).get("verified") === "true";
  };

  const getNextPath = () => {
    if (typeof window === "undefined") {
      return "/";
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = params.get("next") || "/";
    return nextPath.startsWith("/") ? nextPath : "/";
  };

  useEffect(() => {
    const isVerifiedRedirect = getIsVerifiedRedirect();

    if (isVerifiedRedirect && !handledVerifiedState) {
      setMode("login");
      setFormMessage(verifiedMessage);
      setFormError("");
      setAuthError(null);
      setHandledVerifiedState(true);

      if (isAuthenticated) {
        void logout();
      }

      return;
    }

    if (!isVerifiedRedirect && initialized && isAuthenticated) {
      router.replace(getNextPath());
    }
  }, [handledVerifiedState, isAuthenticated, initialized, logout, router, setAuthError]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFormError("");
    setFormMessage("");
    setAuthError(null);
  };

  const validateForm = () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return "Enter a valid email address.";
    }

    if (password.length < 6) {
      return "Password must be at least 6 characters.";
    }

    if (mode === "signup" && password !== confirmPassword) {
      return "Passwords must match.";
    }

    return "";
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormMessage("");
    setAuthError(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsEmailLoading(true);
    try {
      if (mode === "signup") {
        const normalizedEmail = email.trim().toLowerCase();
        await signUpWithEmail(normalizedEmail, password, getNextPath());
        setVerificationEmail(normalizedEmail);
        setEmail(normalizedEmail);
        setPassword("");
        setConfirmPassword("");
        setMode("check-email");
        return;
      } else {
        await signInWithEmail(email.trim(), password);
      }

      const nextPath = getNextPath();
      router.replace(nextPath);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setFormError("");
    setFormMessage("");
    setAuthError(null);

    setFormError(googleUnavailableMessage);
    setIsGoogleLoading(false);
  };

  const handleResendVerificationEmail = async () => {
    const emailToVerify = verificationEmail || email.trim().toLowerCase();

    setFormError("");
    setFormMessage("");
    setAuthError(null);

    if (!emailToVerify) {
      setFormError("Enter your email address to resend the verification link.");
      return;
    }

    setIsResendLoading(true);
    try {
      await resendVerificationEmail(emailToVerify);
      setVerificationEmail(emailToVerify);
      setFormMessage("Verification email sent. Please check your inbox.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to resend the verification email. Please try again.",
      );
    } finally {
      setIsResendLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setMode("login");
    setPassword("");
    setConfirmPassword("");
    setFormError("");
    setFormMessage("");
    setAuthError(null);
  };

  const isBusy = isEmailLoading || isGoogleLoading || isResendLoading;
  const visibleError = formError || authError;
  const isCheckEmail = mode === "check-email";
  const displayedVerificationEmail = verificationEmail || email.trim().toLowerCase();

  return (
    <BetaShell>
      <BetaHeader />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-[0.92fr,1.08fr]">
        <div>
          <BetaEyebrow>Voxa Rooms</BetaEyebrow>
          <h1 className="beta-text-gradient mt-6 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Enter your AI conversation room.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[oklch(0.65_0.02_260)]">
            Start a cinematic room where people and AI agents can meet, collaborate, and move the
            conversation forward.
          </p>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            <BetaStat label="Access" value="Secure" />
            <BetaStat label="Rooms" value="Invite-only" />
            <BetaStat label="Agent" value={defaultAgentName} />
          </div>
        </div>

        <BetaPanel className="p-6 sm:p-8">
          <div className="beta-orbital-stage grid place-items-center">
            <div className="beta-conversation-core">
              <Shield className="h-10 w-10 text-[oklch(0.1_0.02_260)]" />
            </div>
            <div className="absolute left-8 top-8 beta-status-pill">
              <Sparkles className="h-3.5 w-3.5 text-[oklch(0.72_0.2_245)]" />
              {defaultAgentName} online
            </div>
            <div className="absolute bottom-8 right-8 beta-status-pill">
              <LockKeyhole className="h-3.5 w-3.5 text-[oklch(0.78_0.18_235)]" />
              Secure entry
            </div>
          </div>

          <div className="mt-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {isCheckEmail
                    ? "Check your email"
                    : mode === "login"
                      ? "Welcome to Voxa"
                      : "Create your Voxa account"}
                </h2>
                <p className="mt-3 leading-relaxed text-[oklch(0.65_0.02_260)]">
                  {isCheckEmail
                    ? `We sent a verification link to ${displayedVerificationEmail || "your email"}. Please verify your email before logging in.`
                    : mode === "login"
                      ? `Sign in to start a room, invite people, and bring ${defaultAgentName} into the conversation.`
                      : `Create an account to open rooms, share invites, and collaborate with ${defaultAgentName}.`}
                </p>
              </div>
              {!isCheckEmail && (
                <div className="rounded-full border border-white/[0.08] bg-white/[0.035] p-1">
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "login"
                        ? "bg-white text-[oklch(0.13_0.015_260)]"
                        : "text-[oklch(0.7_0.025_260)] hover:text-white"
                    }`}
                    onClick={() => switchMode("login")}
                    type="button"
                  >
                    Log in
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "signup"
                        ? "bg-white text-[oklch(0.13_0.015_260)]"
                        : "text-[oklch(0.7_0.025_260)] hover:text-white"
                    }`}
                    onClick={() => switchMode("signup")}
                    type="button"
                  >
                    Sign up
                  </button>
                </div>
              )}
            </div>

            {isCheckEmail ? (
              <div className="mt-7 space-y-4">
                <BetaButton
                  className="w-full"
                  disabled={isBusy}
                  onClick={handleResendVerificationEmail}
                >
                  {isResendLoading ? "Sending..." : "Resend verification email"}
                  <Mail className="h-4 w-4" />
                </BetaButton>
                <BetaButton
                  className="w-full"
                  disabled={isBusy}
                  onClick={handleBackToLogin}
                  variant="glass"
                >
                  Back to login
                  <ArrowRight className="h-4 w-4" />
                </BetaButton>
              </div>
            ) : (
              <form className="mt-7 space-y-4" noValidate onSubmit={handleEmailAuth}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[oklch(0.82_0.02_260)]">
                    Email
                  </span>
                  <input
                    autoComplete="email"
                    className="beta-input w-full"
                    disabled={isBusy}
                    inputMode="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    type="email"
                    value={email}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[oklch(0.82_0.02_260)]">
                    Password
                  </span>
                  <input
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="beta-input w-full"
                    disabled={isBusy}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    type="password"
                    value={password}
                  />
                </label>

                {mode === "signup" && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[oklch(0.82_0.02_260)]">
                      Confirm password
                    </span>
                    <input
                      autoComplete="new-password"
                      className="beta-input w-full"
                      disabled={isBusy}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm your password"
                      type="password"
                      value={confirmPassword}
                    />
                  </label>
                )}

                <BetaButton className="w-full" disabled={isBusy} type="submit">
                  {isEmailLoading
                    ? "Signing in..."
                    : mode === "login"
                      ? "Log in"
                      : "Create account"}
                  <ArrowRight className="h-4 w-4" />
                </BetaButton>
              </form>
            )}

            {!isCheckEmail && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.08]" />
                  <span className="text-xs uppercase tracking-[0.18em] text-[oklch(0.58_0.02_260)]">
                    or
                  </span>
                  <div className="h-px flex-1 bg-white/[0.08]" />
                </div>

                <BetaButton
                  className="w-full"
                  disabled={isBusy}
                  onClick={handleGoogleLogin}
                  variant="glass"
                >
                  <Mail className="h-4 w-4" />
                  {isGoogleLoading ? "Opening Google..." : "Continue with Google"}
                </BetaButton>
              </>
            )}

            {formMessage && (
              <p className="mt-4 rounded-lg border border-[oklch(0.72_0.2_245/0.28)] bg-[oklch(0.72_0.2_245/0.08)] px-4 py-3 text-sm text-[oklch(0.84_0.08_245)]">
                {formMessage}
              </p>
            )}
            {visibleError && (
              <p className="mt-4 rounded-lg border border-[oklch(0.78_0.14_40/0.28)] bg-[oklch(0.78_0.14_40/0.08)] px-4 py-3 text-sm text-[oklch(0.82_0.12_40)]">
                {visibleError}
              </p>
            )}
          </div>
        </BetaPanel>
      </div>
    </BetaShell>
  );
}
