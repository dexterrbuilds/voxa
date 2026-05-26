import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Eyebrow } from "@/components/site/Section";
import { GridBackdrop } from "@/components/site/GridBackdrop";
import { Button } from "@/components/ui/button";

export default function WaitlistPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", building: "" });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <>
      <Helmet>
        <title>Waitlist — Voxa</title>
        <meta
          name="description"
          content="Join the Voxa waitlist for early access to the runtime layer for real-time AI participation."
        />
        <meta property="og:title" content="Waitlist — Voxa" />
        <meta property="og:description" content="Get early access to Voxa." />
      </Helmet>
      <SiteLayout>
        <section className="relative overflow-hidden min-h-[calc(100vh-4rem)]">
          <GridBackdrop />
          <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 sm:pt-28 grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <Eyebrow>Early Access</Eyebrow>
              <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
                Join the future of conversational infrastructure.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
                We're rolling out Voxa to a small group of teams building serious live-AI products.
                Tell us what you're working on.
              </p>

              <div className="mt-10 space-y-4">
                {[
                  "Early access to TypeScript & Python SDKs",
                  "Direct Slack channel with the founding team",
                  "Influence the v1 API surface",
                  "Founding-customer pricing",
                ].map((p) => (
                  <div key={p} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-electric/15 border border-electric/30 grid place-items-center text-electric">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="text-sm text-foreground/90">{p}</span>
                  </div>
                ))}
              </div>

              <div className="mt-12 grid grid-cols-3 gap-4">
                {["Series-A AI Co.", "Stealth · YC W25", "Voice Platform"].map((s) => (
                  <div
                    key={s}
                    className="glass rounded-lg px-3 py-3 text-center text-xs text-muted-foreground"
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:sticky lg:top-24">
              <div className="relative glass rounded-2xl p-7 sm:p-9 overflow-hidden">
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-electric/10 rounded-full blur-3xl" />
                <div className="relative">
                  <AnimatePresence mode="wait">
                    {!submitted ? (
                      <motion.form
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, y: -10 }}
                        onSubmit={onSubmit}
                        className="space-y-5"
                      >
                        <div>
                          <h2 className="text-xl font-semibold tracking-tight">
                            Request Early Access
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            We respond within 48 hours.
                          </p>
                        </div>

                        {[
                          {
                            k: "name",
                            label: "Full name",
                            type: "text",
                            placeholder: "Ada Lovelace",
                          },
                          {
                            k: "email",
                            label: "Work email",
                            type: "email",
                            placeholder: "you@company.com",
                          },
                          { k: "company", label: "Company", type: "text", placeholder: "Acme AI" },
                        ].map((f) => (
                          <div key={f.k}>
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {f.label}
                            </label>
                            <input
                              required
                              type={f.type}
                              placeholder={f.placeholder}
                              value={form[f.k as keyof typeof form]}
                              onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                              className="mt-2 w-full rounded-lg bg-input/40 border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-electric/50 focus:ring-2 focus:ring-electric/20 transition-all"
                            />
                          </div>
                        ))}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            What are you building?
                          </label>
                          <textarea
                            required
                            rows={4}
                            placeholder="Tell us about the agent you want to deploy into live conversations..."
                            value={form.building}
                            onChange={(e) => setForm({ ...form, building: e.target.value })}
                            className="mt-2 w-full rounded-lg bg-input/40 border border-white/[0.08] px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-electric/50 focus:ring-2 focus:ring-electric/20 transition-all resize-none"
                          />
                        </div>

                        <Button type="submit" variant="electric" size="lg" className="w-full">
                          Request Early Access <ArrowRight className="h-4 w-4" />
                        </Button>
                        <p className="text-[11px] text-muted-foreground/70 text-center">
                          By submitting, you agree to receive updates from Voxa.
                        </p>
                      </motion.form>
                    ) : (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        className="py-10 text-center"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 12 }}
                          className="mx-auto h-16 w-16 rounded-full bg-electric/15 border border-electric/30 grid place-items-center text-electric animate-pulse-glow"
                        >
                          <Sparkles className="h-7 w-7" />
                        </motion.div>
                        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-gradient">
                          You're on the list.
                        </h2>
                        <p className="mt-3 text-muted-foreground max-w-sm mx-auto">
                          We'll be in touch within 48 hours with next steps and access details.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </section>
      </SiteLayout>
    </>
  );
}
