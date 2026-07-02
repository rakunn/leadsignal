"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Explanation {
  explanation: string;
  keyFactors: string[];
  cached: boolean;
}

export function ExplainButton({
  leadId,
  cachedExplanation,
}: {
  leadId: string;
  cachedExplanation: string | null;
}) {
  const [result, setResult] = useState<Explanation | null>(
    cachedExplanation
      ? { explanation: cachedExplanation, keyFactors: [], cached: true }
      : null,
  );
  const [pending, setPending] = useState(false);

  // Reset when the drawer switches leads.
  useEffect(() => {
    setResult(
      cachedExplanation
        ? { explanation: cachedExplanation, keyFactors: [], cached: true }
        : null,
    );
  }, [leadId, cachedExplanation]);

  async function explain() {
    setPending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/explain`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't generate an explanation.");
        return;
      }
      setResult(body as Explanation);
    } catch {
      toast.error("Couldn't reach the server.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-2 rounded-lg border bg-accent/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
          <Sparkles className="size-3" aria-hidden /> AI explanation
        </p>
        <p className="text-sm">{result.explanation}</p>
        {result.keyFactors.length > 0 && (
          <ul className="space-y-0.5">
            {result.keyFactors.map((f, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                • {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={explain}
      disabled={pending}
      className="w-full"
    >
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Explaining…
        </>
      ) : (
        <>
          <Sparkles className="size-3.5" aria-hidden /> Explain this score
        </>
      )}
    </Button>
  );
}
