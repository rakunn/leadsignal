/** Canonical CSV contract, shared by the client-side preview and server-side parser. */
export const CSV_COLUMNS = [
  "lead_id",
  "created_at",
  "email",
  "phone",
  "campaign",
  "ad_set",
  "creative",
  "platform",
  "landing_page",
  "cost",
  "email_opened",
  "email_clicked",
  "sms_clicked",
  "converted",
  "revenue",
] as const;

/** Columns a file must have for ingestion to proceed at all. */
export const REQUIRED_COLUMNS = ["created_at", "campaign"] as const;

export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024; // Cloud Run request limit
export const MAX_REQUEST_BYTES = 34 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 25_000;
export const MAX_FIELD_CHARS = 4_096;
