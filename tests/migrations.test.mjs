import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('reporting migration is valid SQLite with the required durable tables', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(await readFile(new URL('../drizzle/0001_reporting.sql', import.meta.url), 'utf8'))
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
  assert.deepEqual(tables, ['report_circuit_state', 'report_idempotency', 'report_rate_limits', 'report_submission_leases'])
  db.close()
})
