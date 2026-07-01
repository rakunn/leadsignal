"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace(searchParams.get("next") ?? "/datasets");
      router.refresh();
      return;
    }
    setPending(false);
    setError(
      res.status === 401
        ? "That password didn't match. Try again."
        : "Something went wrong. Try again.",
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-6">
      <div className="space-y-2">
        <Wordmark asLink={false} />
        <p className="text-sm text-muted-foreground">
          This demo is password-protected. Enter the shared password to open
          the workspace.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && <p className="text-sm text-signal-low">{error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Open workspace"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
