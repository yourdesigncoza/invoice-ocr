-- Per-document token telemetry for the vision call, so we can track OpenAI
-- cost per extraction (important before open public signup).
alter table extraction_logs
  add column if not exists prompt_tokens     integer,
  add column if not exists completion_tokens integer,
  add column if not exists total_tokens      integer;
