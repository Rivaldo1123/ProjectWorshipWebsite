CREATE TABLE IF NOT EXISTS report_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'created', 'ambiguous', 'failed')),
  issue_number INTEGER,
  issue_url TEXT,
  correlation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS report_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL,
  window_end INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS report_submission_leases (
  slot INTEGER PRIMARY KEY CHECK (slot IN (1, 2)),
  lease_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS report_circuit_state (
  state_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL,
  open_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS report_idempotency_expiry ON report_idempotency(expires_at);
CREATE INDEX IF NOT EXISTS report_rate_limits_expiry ON report_rate_limits(window_end);
