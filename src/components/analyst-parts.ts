import type { CardAction } from "@/components/recommendation-card";

export type Part =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; summary?: string; done: boolean }
  | { kind: "card"; action: CardAction };

export type StreamEvent =
  | { type: "thinking_delta"; t: string }
  | { type: "text_delta"; t: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_result"; name: string; summary: string }
  | { type: "card"; action: CardAction }
  | { type: "error"; message: string };

/**
 * Pure reducer for a streamed assistant turn. Must never mutate `parts` or
 * its elements: it runs inside a React state updater, which StrictMode
 * invokes twice with the same previous state.
 */
export function reduceParts(parts: readonly Part[], event: StreamEvent): Part[] {
  switch (event.type) {
    case "thinking_delta":
    case "text_delta": {
      const kind = event.type === "thinking_delta" ? "thinking" : "text";
      const last = parts[parts.length - 1];
      if (last?.kind === kind) {
        return [...parts.slice(0, -1), { ...last, text: last.text + event.t }];
      }
      return [...parts, { kind, text: event.t }];
    }
    case "tool_start":
      return [...parts, { kind: "tool", name: event.name, done: false }];
    case "tool_result": {
      const next = [...parts];
      for (let i = next.length - 1; i >= 0; i--) {
        const p = next[i];
        if (p.kind === "tool" && p.name === event.name && !p.done) {
          next[i] = { ...p, done: true, summary: event.summary };
          break;
        }
      }
      return next;
    }
    case "card":
      return [...parts, { kind: "card", action: event.action }];
    case "error":
      return [...parts, { kind: "text", text: `⚠️ ${event.message}` }];
    default:
      // Unknown event type from a newer server — ignore rather than crash.
      return [...parts];
  }
}
