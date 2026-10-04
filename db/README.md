# Database maintenance

`schema.sql` defines the current database. Published dated migrations are retained
unchanged. `worker/src/database.ts` imports their SQL as text and orders supported
upgrades from `v0.0.2` onward. Admin routes retain authorization, confirmation,
audit, and response handling; they contain no table definitions.

The current local code expects `v0.0.17`. The corrective step described in
`2026-10-05-schema-consistency.sql` rebuilds the three authenticator tables in one
D1 batch using the definitions from `schema.sql`, then restores canonical indexes.
Both published `v0.0.16` shapes are supported. Resource IDs, ciphertext, nonces,
token hashes, and access rows are retained. Historical ownership does not grant
new access. Unexpected columns stop the upgrade and leave the original tables
and version intact. Direct assignment and saved-link semantics remain unchanged
in this schema correction.

Each historical ALTER checks whether its column already exists. Historical
version writes are ignored; the executor writes the current version only after
all migration and schema statements succeed. D1 batch is atomic; the entire
upgrade across multiple statements/batches is not. After interruption, retry the
same upgrade. Initialization skips a database with an existing version; use the
separately confirmed migration action to upgrade it. Unknown, future, and versions
older than `v0.0.2` are rejected rather than guessed.

Worker configurations must include the SQL Text rule present in
`worker/wrangler.toml.template`, `wrangler.build.toml`, and `wrangler.test.toml`:

```toml
[[rules]]
type = "Text"
globs = ["**/*.sql"]
fallthrough = true
```

Keep root options above `[[rules]]` or other TOML tables. No generated copy of SQL
is maintained. `worker/src/__tests__/database.test.ts` executes migrations against
Node's SQLite database and checks columns, indexes, foreign keys, data retention,
failure/retry, and rejection of unsupported shapes. Run it with Node 22.13 or
later (the local validated runtime is Node 24).

These are local changes. Production migration requires separate authorization,
a recoverable backup, and a tested restore/compatibility procedure. This step
does not change access-source columns, so the previous Worker can still read
the migrated authenticator rows; it does not fix the old source-overwrite issue.
That compatibility does not replace a production recovery plan.
