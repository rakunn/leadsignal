"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SampleCard() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function load() {
    setPending(true);
    try {
      const res = await fetch("/api/datasets/sample", { method: "POST" });
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: "Couldn't load the sample dataset." }));
        toast.error(error ?? "Couldn't load the sample dataset.");
        return;
      }
      const { id, rows } = (await res.json()) as { id: string; rows: number };
      toast.success(`Sample loaded — ${rows.toLocaleString()} leads scored.`);
      router.refresh();
      router.push(`/datasets/${id}/dashboard`);
    } catch {
      toast.error("Couldn't reach the server. Try loading the sample again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-primary/25 bg-accent/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          No data handy?
        </CardTitle>
        <CardDescription>
          Load 30 days of realistic media buys: 5 campaigns across Meta, Google
          and TikTok — including one that looks cheap but isn&apos;t.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={load} disabled={pending} className="w-full">
          {pending ? "Generating and scoring…" : "Load sample dataset"}
        </Button>
      </CardContent>
    </Card>
  );
}
