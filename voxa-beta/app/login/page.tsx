"use client";

import { platformEnabled } from "@/lib/product-features";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { BetaButton, BetaEyebrow, BetaHeader, BetaPanel, BetaShell } from "@/components/BetaChrome";
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
      <div className="mx-auto grid max-w-5xl items-start gap-8 px-5 py-8 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div>
          <BetaEyebrow>
            {platformEnabled ? "Humans. Agents. Together." : "Nova, by Synq"}
          </BetaEyebrow>
          <h1 className="beta-text-gradient mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
            {platformEnabled ? (
              <>
                Find your people.
                <br />
                Meet your next idea.
              </>
            ) : (
              <>
                A conversation.
                <br />A clearer next move.
              </>
            )}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted-foreground)]">
            {platformEnabled
              ? "A shared space for conversations that go somewhere."
              : "Understand on-chain ideas and explore safe simulations with Nova."}
          </p>
        </div>

        <BetaPanel className="p-6 sm:p-8">
          <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-normal text-white">
                  {isCheckEmail
                    ? "Check your email"
                    : mode === "login"
                      ? "Welcome to Synq"
                      : "Create your Synq account"}
                </h2>
                <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
                  {isCheckEmail
                    ? `We sent a verification link to ${displayedVerificationEmail || "your email"}. Please verify your email before logging in.`
                    : mode === "login"
                      ? platformEnabled
                        ? `Sign in to start a room, invite people, and bring ${defaultAgentName} into the conversation.`
                        : "Sign in to talk to Nova and return to your conversations."
                      : platformEnabled
                        ? `Create an account to open rooms, share invites, and collaborate with ${defaultAgentName}.`
                        : "Create an account to explore on-chain ideas with Nova. Actions are simulations."}
                </p>
              </div>
              {!isCheckEmail && (
                <div className="rounded-full border border-white/[0.08] bg-white/[0.035] p-1">
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "login"
                        ? "bg-[var(--electric)] text-[var(--on-accent)]"
                        : "text-[var(--muted-foreground)] hover:text-white"
                    }`}
                    onClick={() => switchMode("login")}
                    type="button"
                  >
                    Log in
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "signup"
                        ? "bg-[var(--electric)] text-[var(--on-accent)]"
                        : "text-[var(--muted-foreground)] hover:text-white"
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
                  <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
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
                  <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
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
                    <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
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
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
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
