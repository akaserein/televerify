import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startVerification, checkVerification } from "@/lib/telegram.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Telegram Verification — Verify your account with @ilnkbot" },
      {
        name: "description",
        content:
          "Enter your Telegram username or UID, open the bot with one click, and verify your account in seconds.",
      },
      { property: "og:title", content: "Telegram Verification — @ilnkbot" },
      {
        property: "og:description",
        content: "One-click Telegram bot verification with a secure one-time code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Phase = "idle" | "waiting" | "verified" | "failed" | "expired";

function Index() {
  const start = useServerFn(startVerification);
  const check = useServerFn(checkVerification);

  const [identifier, setIdentifier] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ code: string; link: string } | null>(null);
  const [account, setAccount] = useState<{ username: string | null; userId: string | null } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // If the user comes back from the bot's "Open the site" button, resume that code.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("verified");
    if (!code) return;
    setSession({ code, link: `https://t.me/ilnkbot?start=${code}` });
    setPhase("waiting");
  }, []);

  useEffect(() => {
    if (phase !== "waiting" || !session) return;
    timer.current = setInterval(async () => {
      try {
        const res = await check({ data: { code: session.code } });
        if (res.status === "verified") {
          setAccount({ username: res.username ?? null, userId: res.userId ?? null });
          setPhase("verified");
        } else if (res.status === "failed") {
          setError(res.error ?? "Account did not match");
          setPhase("failed");
        } else if (res.status === "expired") {
          setPhase("expired");
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase, session, check]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await start({ data: { identifier } });
      setSession({ code: res.code, link: res.link });
      setPhase("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setSession(null);
    setAccount(null);
    setError(null);
    setPhase("idle");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />

      <section className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-accent shadow-[0_16px_50px_-12px_var(--glow)]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 fill-primary-foreground" aria-hidden="true">
              <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.3-.1-.5-.6-.2L6.3 12.1 1.5 10.6c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Telegram Verification
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your Telegram username or UID and verify with{" "}
            <span className="font-medium text-foreground">@ilnkbot</span> in one click.
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card/80 p-6 shadow-[0_24px_70px_-40px_var(--glow)] backdrop-blur">
          {phase === "idle" && (
            <form onSubmit={handleStart} className="space-y-4">
              <label htmlFor="identifier" className="block text-sm font-medium text-foreground">
                Telegram username or UID
              </label>
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="@username or 123456789"
                maxLength={64}
                autoComplete="off"
                className="w-full rounded-xl border border-input bg-secondary px-4 py-3 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={busy || identifier.trim().length < 2}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Generating code…" : "Generate verification code"}
              </button>
            </form>
          )}

          {phase === "waiting" && session && (
            <div className="space-y-5 text-center">
              <div className="rounded-2xl border border-dashed border-border bg-secondary px-4 py-5">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Your one-time code
                </p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-[0.25em] text-foreground">
                  {session.code}
                </p>
              </div>
              <a
                href={session.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Open the bot and press Start
              </a>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
                Waiting for confirmation…
              </p>
              <button onClick={reset} className="text-xs text-muted-foreground underline">
                Cancel
              </button>
            </div>
          )}

          {phase === "verified" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl">
                ✅
              </div>
              <h2 className="text-xl font-semibold text-foreground">Verified!</h2>
              <p className="text-sm text-muted-foreground">
                {account?.username ? `@${account.username}` : "Your account"}
                {account?.userId ? ` · UID ${account.userId}` : ""} has been verified.
              </p>
              <button
                onClick={reset}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                Start a new verification
              </button>
            </div>
          )}

          {(phase === "failed" || phase === "expired") && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-2xl">
                {phase === "expired" ? "⌛" : "❌"}
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {phase === "expired" ? "Code expired" : "Verification failed"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {phase === "expired"
                  ? "Codes stay valid for 15 minutes. Please generate a new one."
                  : (error ?? "Your Telegram account did not match the username/UID provided.")}
              </p>
              <button
                onClick={reset}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Each code is valid for 15 minutes and can be used only once.
        </p>
      </section>
    </main>
  );
}
