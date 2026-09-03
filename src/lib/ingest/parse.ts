import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { datasets, leads } from "@/db/schema";
import { materializeRollups } from "@/db/rollups";
import { SCORING_VERSION } from "@/lib/scoring/constants";
import { scoreDataset } from "@/lib/scoring/persist";
import {
  MAX_FIELD_CHARS,
  MAX_UPLOAD_ROWS,
  REQUIRED_COLUMNS,
} from "./columns";

/** A lead row ready for insertion (raw fields only; scoring fills the rest). */
export type LeadInsertRow = {
  leadExternalId: string | null;
  createdAt: Date;
  email: string | null;
  phone: string | null;
  campaign: string;
  adSet: string | null;
  creative: string | null;
  platform: string | null;
  landingPage: string | null;
  costCents: number;
  emailOpened: boolean;
  emailClicked: boolean;
  smsClicked: boolean;
  converted: boolean;
  revenueCents: number;
};

export class CsvContractError extends Error {}

const TRUTHY = new Set(["1", "true", "yes", "y", "t"]);

function toBool(v: string | undefined): boolean {
  return v !== undefined && TRUTHY.has(v.trim().toLowerCase());
}

function toCents(v: string | undefined): number {
  if (v === undefined || v.trim() === "") return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toNullable(v: string | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase();
}

function csvStructureError(
  error: Papa.ParseError,
  fallbackRecord: number,
): CsvContractError {
  const record = (error.row ?? fallbackRecord) + 2;
  return new CsvContractError(
    `CSV structure error at record ${record}: ${error.code}.`,
  );
}

export interface ParsedCsv {
  rows: LeadInsertRow[];
  skipped: number;
  sampleErrors: string[];
}

/**
 * Parse CSV text into insertable lead rows. Pure — no I/O.
 * Throws CsvContractError when required headers are missing.
 */
export function parseCsvLeads(csvText: string): ParsedCsv {
  const rawHeader = Papa.parse<string[]>(csvText, {
    header: false,
    preview: 1,
    skipEmptyLines: true,
  });
  if (rawHeader.errors.length > 0) {
    throw csvStructureError(rawHeader.errors[0], 0);
  }

  const rawHeaders = rawHeader.data[0] ?? [];
  if (rawHeaders.some((header) => header.length > MAX_FIELD_CHARS)) {
    throw new CsvContractError(
      `CSV structure error at record 1: header contains a field longer than ${MAX_FIELD_CHARS.toLocaleString()} characters.`,
    );
  }
  const normalizedHeaders = rawHeaders.map(normalizedHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new CsvContractError(
      "CSV structure error at record 1: duplicate column headers.",
    );
  }

  const inputRows: Record<string, string>[] = [];
  let headers: string[] = [];
  let contractError: CsvContractError | null = null;

  Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizedHeader,
    transform: (value) => {
      if (!contractError && value.length > MAX_FIELD_CHARS) {
        contractError = new CsvContractError(
          `Record ${inputRows.length + 1} contains a field longer than ${MAX_FIELD_CHARS.toLocaleString()} characters.`,
        );
      }
      return value;
    },
    step: (result, parser) => {
      headers = result.meta.fields ?? headers;
      const record = inputRows.length + 1;
      if (contractError) {
        parser.abort();
        return;
      }
      if (result.errors.length > 0) {
        contractError = csvStructureError(result.errors[0], record - 1);
        parser.abort();
        return;
      }
      if (record > MAX_UPLOAD_ROWS) {
        contractError = new CsvContractError(
          `Record ${record} exceeds the ${MAX_UPLOAD_ROWS.toLocaleString()}-row limit.`,
        );
        parser.abort();
        return;
      }

      inputRows.push(result.data);
    },
  });

  if (contractError) throw contractError;
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new CsvContractError(
      `Missing required column(s): ${missing.join(", ")}. Found: ${headers.join(", ") || "none"}.`,
    );
  }

  const rows: LeadInsertRow[] = [];
  const sampleErrors: string[] = [];
  let skipped = 0;

  inputRows.forEach((r, i) => {
    const campaign = r.campaign?.trim();
    const createdAt = new Date(r.created_at ?? "");
    if (!campaign || Number.isNaN(createdAt.getTime())) {
      skipped++;
      if (sampleErrors.length < 5) {
        sampleErrors.push(
          `Row ${i + 2}: ${!campaign ? "empty campaign" : `unparseable created_at "${r.created_at}"`}`,
        );
      }
      return;
    }
    rows.push({
      leadExternalId: toNullable(r.lead_id),
      createdAt,
      email: toNullable(r.email)?.toLowerCase() ?? null,
      phone: toNullable(r.phone),
      campaign,
      adSet: toNullable(r.ad_set),
      creative: toNullable(r.creative),
      platform: toNullable(r.platform),
      landingPage: toNullable(r.landing_page),
      costCents: toCents(r.cost),
      emailOpened: toBool(r.email_opened),
      emailClicked: toBool(r.email_clicked),
      smsClicked: toBool(r.sms_clicked),
      converted: toBool(r.converted),
      revenueCents: toCents(r.revenue),
    });
  });

  return { rows, skipped, sampleErrors };
}

const CHUNK_SIZE = 1000;

/** Insert rows in chunks, updating datasets.processed_count as we go. */
export async function insertLeadChunks(
  datasetId: string,
  rows: LeadInsertRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await db
      .insert(leads)
      .values(chunk.map((r) => ({ ...r, datasetId })));
    await db
      .update(datasets)
      .set({ processedCount: sql`${datasets.processedCount} + ${chunk.length}` })
      .where(eq(datasets.id, datasetId));
  }
}

/**
 * Full ingest pipeline for an already-created dataset row.
 * Later phases extend this: scoring (Phase 2) and rollups (Phase 4) run
 * between insertion and the final `ready` flip.
 */
export async function runIngest(
  datasetId: string,
  parsed: ParsedCsv,
): Promise<void> {
  try {
    await db
      .update(datasets)
      .set({
        status: "processing",
        rowCount: parsed.rows.length,
        skippedCount: parsed.skipped,
        processedCount: 0,
      })
      .where(eq(datasets.id, datasetId));

    await insertLeadChunks(datasetId, parsed.rows);

    await db
      .update(datasets)
      .set({ status: "scoring" })
      .where(eq(datasets.id, datasetId));

    await scoreDataset(datasetId);
    await materializeRollups(datasetId);

    await db
      .update(datasets)
      .set({ status: "ready", scoringVersion: SCORING_VERSION })
      .where(eq(datasets.id, datasetId));
  } catch (err) {
    await db
      .update(datasets)
      .set({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown ingest error",
      })
      .where(eq(datasets.id, datasetId));
    throw err;
  }
}
