import { afterEach, describe, expect, it, vi } from "vitest";
import { tryAcquireIngest } from "@/lib/ingest/admission";
import { UploadLimitError, readBoundedBody } from "@/lib/ingest/request";
import { POST as postDataset } from "@/app/api/datasets/route";
import { POST as postSample } from "@/app/api/datasets/sample/route";
import { CsvContractError, parseCsvLeads } from "@/lib/ingest/parse";

const encoder = new TextEncoder();

function streamRequest(
  chunks: string[],
  headers?: HeadersInit,
): { request: Request; wasCancelled: () => boolean } {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: new Request("http://localhost/api/datasets", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit),
    wasCancelled: () => cancelled,
  };
}

afterEach(() => {
  const release = tryAcquireIngest();
  release?.();
});

describe("ingest request limits", () => {
  it("stops reading a streaming request as soon as the measured size exceeds the limit", async () => {
    const { request, wasCancelled } = streamRequest(["12345", "67890", "x"]);

    await expect(readBoundedBody(request, 10)).rejects.toBeInstanceOf(
      UploadLimitError,
    );
    expect(wasCancelled()).toBe(true);
  });

  it("enforces measured bytes even when Content-Length claims a smaller body", async () => {
    const { request } = streamRequest(["12345678901"], { "content-length": "1" });

    await expect(readBoundedBody(request, 10)).rejects.toBeInstanceOf(
      UploadLimitError,
    );
  });

  it("permits only one ingestion and makes release safe to repeat", () => {
    const release = tryAcquireIngest();
    expect(release).not.toBeNull();
    expect(tryAcquireIngest()).toBeNull();

    release?.();
    release?.();

    const nextRelease = tryAcquireIngest();
    expect(nextRelease).not.toBeNull();
    nextRelease?.();
  });

  it("keeps an active permit when the route module is re-evaluated", async () => {
    const release = tryAcquireIngest();
    expect(release).not.toBeNull();

    vi.resetModules();
    const { tryAcquireIngest: tryAcquireFromReloadedModule } = await import(
      "@/lib/ingest/admission"
    );
    expect(tryAcquireFromReloadedModule()).toBeNull();

    release?.();
    const nextRelease = tryAcquireFromReloadedModule();
    expect(nextRelease).not.toBeNull();
    nextRelease?.();
  });

  it("returns a retryable busy response before parsing or creating a dataset", async () => {
    const release = tryAcquireIngest();
    const body = new FormData();
    body.append("file", new File(["created_at,campaign\n2026-06-01,Demo"], "leads.csv"));

    const response = await postDataset(
      new Request("http://localhost/api/datasets", { method: "POST", body }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    await expect(response.json()).resolves.toEqual({ error: "An ingestion is already in progress. Try again shortly." });
    release?.();
  });

  it("shares the busy response with the sample-data route", async () => {
    const release = tryAcquireIngest();

    const response = await postSample();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    release?.();
  });

  it("releases the permit after an upload request fails", async () => {
    const response = await postDataset(
      new Request("http://localhost/api/datasets", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not multipart",
      }),
    );

    expect(response.status).toBe(400);
    const release = tryAcquireIngest();
    expect(release).not.toBeNull();
    release?.();
  });

  it("rejects the 25,001st record even when earlier records are skipped", () => {
    const rows = Array.from(
      { length: 25_001 },
      () => "2026-06-01T00:00:00Z,",
    );

    expect(() => parseCsvLeads(`created_at,campaign\n${rows.join("\n")}`)).toThrow(
      CsvContractError,
    );
  });

  it("rejects a cell that exceeds the field-length contract", () => {
    expect(() =>
      parseCsvLeads(
        `created_at,campaign\n2026-06-01T00:00:00Z,${"x".repeat(4_097)}`,
      ),
    ).toThrow(CsvContractError);
  });

  it("rejects an oversized cell even when its header cannot become an object property", () => {
    expect(() =>
      parseCsvLeads(
        `created_at,campaign,__proto__\n2026-06-01T00:00:00Z,Example,${"x".repeat(4_097)}`,
      ),
    ).toThrow(/record 1/i);
  });

  it("rejects an oversized header cell before processing data rows", () => {
    expect(() =>
      parseCsvLeads(
        `created_at,campaign,${"x".repeat(4_097)}\n2026-06-01T00:00:00Z,Spring,ok`,
      ),
    ).toThrow(CsvContractError);
  });
});
