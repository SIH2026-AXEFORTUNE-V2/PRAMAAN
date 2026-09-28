import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/misc";
import { BrandMark } from "./Brand";
import { tr } from "@/i18n";

function SignIn({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      await api.login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark size={40} />
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-[0.14em] text-fg">PRAMAAN</p>
            <p className="text-sm text-muted">{tr("AI Transformation Workspace")}</p>
          </div>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-surface p-7 ring-1 ring-border" aria-labelledby="signin-title">
          <h1 id="signin-title" className="text-xl font-semibold text-fg">
            {tr("Sign in to the workspace")}
          </h1>
          <p className="mt-2 text-sm text-muted">{tr("This workspace is private. Enter the access password your team shared with you.")}</p>
          <label className="mt-6 block text-sm font-medium text-fg">
            {tr("Access password")}
            <TextInput
              type="password"
              autoComplete="current-password"
              autoFocus
              className="mt-2 h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "signin-error" : undefined}
            />
          </label>
          {error && (
            <p id="signin-error" role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="md" className="mt-5 h-11 w-full" loading={pending} disabled={!password}>
            {tr("Sign in")}
          </Button>
          <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted">
            <Lock size={13} className="mt-0.5 shrink-0" />
            {tr("Your session lasts 12 hours on this browser. Uploaded sources are visible only to people signed in to this workspace.")}
          </p>
        </form>
      </div>
    </main>
  );
}

/** Shows the sign-in screen when the deployment has an access password and there is no valid session. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "signed-in" | "signed-out">("checking");
  useEffect(() => {
    api
      .authStatus()
      .then((s) => setState(!s.enabled || s.authenticated ? "signed-in" : "signed-out"))
      .catch(() => setState("signed-in")); // server unreachable: let the app show its own connection error
    const expired = () => setState("signed-out");
    window.addEventListener("pramaan:auth-required", expired);
    return () => window.removeEventListener("pramaan:auth-required", expired);
  }, []);
  if (state === "checking") return <div className="h-full bg-bg" />;
  if (state === "signed-out") return <SignIn onDone={() => window.location.reload()} />;
  return <>{children}</>;
}
