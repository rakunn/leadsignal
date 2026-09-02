import { describe, expect, it } from "vitest";
import { reduceParts, type Part } from "@/components/analyst-parts";

describe("reduceParts", () => {
  it("appends a new text part when the last part is not text", () => {
    const parts = reduceParts([], { type: "text_delta", t: "Hello" });
    expect(parts).toEqual([{ kind: "text", text: "Hello" }]);
  });

  it("concatenates consecutive text deltas into one part", () => {
    let parts: Part[] = [];
    parts = reduceParts(parts, { type: "text_delta", t: "Hello, " });
    parts = reduceParts(parts, { type: "text_delta", t: "world" });
    expect(parts).toEqual([{ kind: "text", text: "Hello, world" }]);
  });

  it("keeps thinking and text in separate parts", () => {
    let parts: Part[] = [];
    parts = reduceParts(parts, { type: "thinking_delta", t: "hmm" });
    parts = reduceParts(parts, { type: "text_delta", t: "Answer" });
    expect(parts).toEqual([
      { kind: "thinking", text: "hmm" },
      { kind: "text", text: "Answer" },
    ]);
  });

  it("never mutates its input, so StrictMode double-invocation is safe", () => {
    const prev: Part[] = [{ kind: "text", text: "The move I modeled: " }];
    const frozen = Object.freeze([Object.freeze({ ...prev[0] })]) as Part[];

    // React StrictMode calls state updaters twice with the same prev state.
    const first = reduceParts(frozen, { type: "text_delta", t: "pull $761.67" });
    const second = reduceParts(frozen, { type: "text_delta", t: "pull $761.67" });

    expect(frozen[0]).toEqual({ kind: "text", text: "The move I modeled: " });
    expect(first).toEqual(second);
    expect(first).toEqual([
      { kind: "text", text: "The move I modeled: pull $761.67" },
    ]);
  });

  it("marks the matching pending tool chip done without mutating it", () => {
    const chip: Part = { kind: "tool", name: "query_leads", done: false };
    const prev = [chip];
    const next = reduceParts(prev, {
      type: "tool_result",
      name: "query_leads",
      summary: "1,204 rows",
    });
    expect(chip.done).toBe(false);
    expect(next).toEqual([
      { kind: "tool", name: "query_leads", summary: "1,204 rows", done: true },
    ]);
  });

  it("renders error events as a warning text part", () => {
    const parts = reduceParts([], { type: "error", message: "boom" });
    expect(parts).toEqual([{ kind: "text", text: "⚠️ boom" }]);
  });
});
