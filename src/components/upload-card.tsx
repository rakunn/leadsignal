"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CSV_COLUMNS,
  MAX_UPLOAD_BYTES,
  REQUIRED_COLUMNS,
} from "@/lib/ingest/columns";
import { cn } from "@/lib/utils";

type Preview = {
  file: File;
  headers: string[];
  missing: string[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; processed: number; total: number | null }
  | { kind: "done"; id: string };

export function UploadCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const inspect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("That doesn't look like a CSV file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Files must be 32 MB or smaller.");
      return;
    }
    Papa.parse(file, {
      header: true,
      preview: 1,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
        setPreview({ file, headers, missing });
        setPhase({ kind: "idle" });
      },
    });
  }, []);

  async function upload(file: File) {
    setPhase({ kind: "uploading", processed: 0, total: null });
    const body = new FormData();
    body.append("file", file);

    const uploadPromise = fetch("/api/datasets", { method: "POST", body });

    // The POST holds until ingest completes; poll the newest dataset's status
    // for a progress bar. Cheap approach: poll the list until our upload lands.
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/datasets", { cache: "no-store" });
        if (!res.ok) return;
        const { datasets } = (await res.json()) as {
          datasets: {
            status: string;
            rowCount: number;
            processedCount: number;
          }[];
        };
        const active = datasets.find(
          (d) => d.status === "processing" || d.status === "scoring",
        );
        if (active) {
          setPhase({
            kind: "uploading",
            processed: active.processedCount,
            total: active.rowCount || null,
          });
        }
      } catch {
        // polling is best-effort
      }
    }, 800);

    try {
      const res = await uploadPromise;
      clearInterval(poll);
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Upload failed" }));
        toast.error(error ?? "Upload failed");
        setPhase({ kind: "idle" });
        return;
      }
      const { id, rows } = (await res.json()) as { id: string; rows: number };
      toast.success(`Ingested ${rows.toLocaleString()} leads.`);
      setPhase({ kind: "done", id });
      setPreview(null);
      router.refresh();
    } catch {
      clearInterval(poll);
      toast.error("Upload failed — is the server reachable?");
      setPhase({ kind: "idle" });
    }
  }

  const busy = phase.kind === "uploading";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a lead export</CardTitle>
        <CardDescription>
          One row per lead. Required columns:{" "}
          {REQUIRED_COLUMNS.map((c) => (
            <code key={c} className="font-mono text-xs">
              {c}{" "}
            </code>
          ))}
          — the full contract is{" "}
          <a
            href="/api/sample.csv"
            className="underline underline-offset-2 hover:text-foreground"
          >
            sample.csv
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) inspect(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-sm text-muted-foreground transition-colors",
            dragOver
              ? "border-primary bg-accent text-accent-foreground"
              : "hover:border-primary/50 hover:bg-accent/50",
          )}
          disabled={busy}
        >
          <UploadCloud className="size-5" aria-hidden />
          <span>
            Drop a CSV here or <span className="text-primary">browse</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) inspect(f);
            e.target.value = "";
          }}
        />

        {preview && (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium">{preview.file.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {CSV_COLUMNS.map((c) => {
                const present = preview.headers.includes(c);
                return (
                  <Badge
                    key={c}
                    variant={present ? "secondary" : "outline"}
                    className={cn(
                      "font-mono text-[11px]",
                      !present && "text-muted-foreground/60 line-through",
                    )}
                  >
                    {c}
                  </Badge>
                );
              })}
            </div>
            {preview.missing.length > 0 ? (
              <p className="text-sm text-signal-low">
                Missing required column
                {preview.missing.length > 1 ? "s" : ""}:{" "}
                {preview.missing.join(", ")}. Fix the header row and re-select
                the file.
              </p>
            ) : (
              <Button
                onClick={() => upload(preview.file)}
                disabled={busy}
                className="w-full"
              >
                {busy ? "Ingesting…" : "Upload and score"}
              </Button>
            )}
          </div>
        )}

        {phase.kind === "uploading" && (
          <div className="space-y-1.5">
            <Progress
              value={
                phase.total
                  ? Math.round((phase.processed / phase.total) * 100)
                  : undefined
              }
            />
            <p className="text-xs text-muted-foreground">
              {phase.total
                ? `${phase.processed.toLocaleString()} of ${phase.total.toLocaleString()} rows`
                : "Parsing…"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
