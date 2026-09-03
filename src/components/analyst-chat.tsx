"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, ChevronDown, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RecommendationCardView } from "@/components/recommendation-card";
import {
  reduceParts,
  type Part,
  type StreamEvent,
} from "@/components/analyst-parts";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  parts: Part[];
}

const STARTERS = [
  "Why did lead quality decline this week?",
  "Which campaign should get more budget?",
  "What should I pause today?",
];

const MD_COMPONENTS = {
  p: (props: React.ComponentProps<"p">) => (
    <p className="mb-2 last:mb-0" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold" {...props} />
  ),
  h1: (props: React.ComponentProps<"h2">) => (
    <h3 className="mb-1.5 mt-3 font-heading text-sm font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h3 className="mb-1.5 mt-3 font-heading text-sm font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  table: (props: React.ComponentProps<"table">) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th className="border-b py-1 pr-4 text-left font-medium" {...props} />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border-b border-border/50 py-1 pr-4 font-mono text-xs tabular-nums" {...props} />
  ),
};

function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <details className="group rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <Brain className={cn("size-3", streaming && "animate-pulse")} aria-hidden />
        {streaming ? "Thinking…" : "Thought process"}
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <p className="mt-1.5 whitespace-pre-wrap border-t pt-1.5 opacity-80">{text}</p>
    </details>
  );
}

function ToolChip({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-[11px] font-normal">
      {part.done ? (
        <Wrench className="size-3 text-signal-high" aria-hidden />
      ) : (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      )}
      {part.name}
      {part.summary && <span className="text-muted-foreground">· {part.summary}</span>}
    </Badge>
  );
}

export function AnalystChat({ datasetId }: { datasetId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function applyEvent(event: StreamEvent) {
    // Must stay pure: StrictMode runs updaters twice with the same prev.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, parts: reduceParts(last.parts, event) },
      ];
    });
  }

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", parts: [{ kind: "text", text }] },
      { role: "assistant", parts: [] },
    ]);

    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId,
          conversationId: conversationRef.current,
          message: text,
        }),
      });
      if (!res.ok || !res.body) {
        const { error } = await res
          .json()
          .catch(() => ({ error: "The analyst is unavailable." }));
        applyEvent({ type: "error", message: error ?? "Request failed." });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = raw
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6)) as
            | { type: "meta"; conversationId: string }
            | { type: "done" }
            | StreamEvent;

          if (event.type === "meta") {
            conversationRef.current = event.conversationId;
          } else if (event.type !== "done") {
            applyEvent(event);
          }
        }
      }
    } catch {
      applyEvent({
        type: "error",
        message: "Connection dropped — try asking again.",
      });
    } finally {
      setStreaming(false);
      router.refresh(); // refresh the action log panel
    }
  }

  return (
    <div className="flex h-[calc(100dvh-16rem)] min-h-[480px] flex-col rounded-lg border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask about campaign quality, budget moves, or why a metric changed.
              Metrics come from scored data. Review generated explanations and estimates.
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  onClick={() => send(q)}
                  className="justify-start"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {msg.parts[0]?.kind === "text" ? msg.parts[0].text : ""}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {msg.parts.map((part, j) => {
                switch (part.kind) {
                  case "thinking":
                    return (
                      <ThinkingBlock
                        key={j}
                        text={part.text}
                        streaming={streaming && i === messages.length - 1 && j === msg.parts.length - 1}
                      />
                    );
                  case "tool":
                    return <ToolChip key={j} part={part} />;
                  case "text":
                    return (
                      <div key={j} className="max-w-none text-sm leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                          components={MD_COMPONENTS}
                        >
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    );
                  case "card":
                    return <RecommendationCardView key={j} action={part.action} onResolved={() => router.refresh()} />;
                }
              })}
              {streaming && i === messages.length - 1 && msg.parts.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Reading the data…
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask the analyst… (Enter to send)"
          rows={1}
          className="min-h-9 resize-none"
          disabled={streaming}
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
          {streaming ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Send"}
        </Button>
      </form>
    </div>
  );
}
