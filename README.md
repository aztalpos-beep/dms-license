# DMS POS — Licensing/Trial + Offline Sync Module

## Flow

**First install (needs internet once):**
```
Desktop app → fingerprint.js generates hw_fingerprint
           → POST /license/register {hw_fingerprint}
           → server checks: has this HARDWARE been seen before?
               - No  → create device + trial license (3 days)
               - Yes → return existing device_id (no new trial)
           → device_id saved locally
```

**Every app start / every ~15 min while running:**
```
license-guard.js .check()
    → try POST /license/verify (online)
        → server computes true status (trial/paid/expired/blocked)
          using SERVER clock only
        → signs verdict with RSA PRIVATE key
        → client verifies with RSA PUBLIC key, caches it locally
    → if offline: fall back to last cached, signed verdict
        → evaluate grace period / expiry using elapsed time,
          not the raw OS clock
    → return {allowed: true/false, reason}
```

**Enforcement point:** the guard must be called from the **local server /
backend layer that writes to the DB** — e.g. wherever `createSale()`,
`app.start()` etc. live — not only from the React UI. A UI-only check is
cosmetic; anyone can bypass it via devtools or a patched renderer bundle.

## Threat coverage

| Bypass attempt | Countermeasure |
|---|---|
| Change system clock forward/back | Verdict cached with server-issued `server_time`; offline checks measure *elapsed* time, not absolute local time. Backwards jump = instant block (`clock_rollback_detected`). |
| Uninstall & reinstall for new trial | `hw_fingerprint` (disk serial + MAC + hostname + CPU) is unique-constrained server-side; same hardware always maps to the same device/license row. |
| New OS user account / new email | Doesn't matter — check is hardware-fingerprint based, not account based. |
| Edit local DB file directly (trial_expiry field) | Local cache stores a full RSA-signed verdict object; any edit breaks the signature and `verifySignedVerdict()` rejects it. |
| Fake/replay an old "valid" server response | Verdict includes a random `nonce` and `server_time`; guard re-checks server on a schedule, so a stale replayed verdict eventually falls outside grace period. |
| Reverse-engineer the app to remove the license check | Public key in the client can only *verify*, never *sign* — a patched client still can't produce a valid verdict. Real enforcement must live in the write path (see above), so removing a UI check alone doesn't unlock functionality. |
| Permanently disable internet to stay in "trial forever" | `GRACE_PERIOD_MS` (default 48h) hard-blocks the app once too much time passes with no successful server contact. |

## Offline sync (Sale/Payment/Inventory/etc.)

**Local write path (always instant, online or offline):**
```
POS UI → syncEngine.writeAndQueue('sales', {...})
       → 1. INSERT into local SQLite `sales` table       (UI unblocks here)
       → 2. INSERT into local `sync_queue` (status: pending)
       → 3. fire-and-forget processQueue() in background
```

**Background sync (every ~30s, or immediately after a write):**
```
processQueue()
   → reads up to 50 pending rows from sync_queue
   → POST /sync/push {device_id, transactions[]}
       → server applies each one:
           - append-only tables (sales/payments/expenses/...) → idempotent
             insert by record_id (UUID); retried pushes are safe, no dupes
           - delta tables (inventory_adjustments/customer_ledger) → insert
             a signed +/- delta row, NEVER overwrite an absolute value
       → server returns per-record status: synced | error
   → mark each local sync_queue row accordingly
   → on network failure: exponential backoff (5s → up to 5min), retried
     automatically next tick, nothing is lost
```

**Why deltas instead of absolute values:** if PC1 and PC2 both sell the last
item offline, storing "current_stock = 0" from each device would silently
overwrite each other and could go negative or wrong. Storing two `-1` delta
rows means both are applied — current stock is always
`SUM(delta_qty)`, computed at read time, so order of arrival doesn't matter
and nothing is lost.

**Pulling changes made elsewhere** (another PC, or the cloud dashboard):
```
pullRemoteChanges() → GET /sync/pull?device_id=X&since=<last_pull_time>
                    → upserts any rows into local tables by record_id
                    → updates local `last_pull_at` watermark
```

Wire `syncEngine.startBackgroundLoop()` once at app startup (alongside the
license guard) — it runs both `processQueue()` and `pullRemoteChanges()` on
a timer automatically.

## Quick start — run it today

**1. Server**
```bash
cd server
npm install
node scripts/generate-keys.js
#   -> writes keys/private.pem and keys/public.pem
cp .env.example .env
# edit .env: fill DB_HOST/DB_USER/DB_PASSWORD/DB_NAME (Aiven) and
# LICENSE_PRIVATE_KEY_PATH=<absolute path to keys/private.pem>

mysql -h <aiven-host> -u <user> -p <db> < schema.sql
# (or run schema.sql through Aiven's console / any MySQL client)

npm start
# server listening on :4000
```

**2. Copy the public key to the desktop client**
```bash
mkdir -p ../desktop-client/keys
cp keys/public.pem ../desktop-client/keys/public.pem
```

**3. Smoke test the API directly (before wiring Electron)**
```bash
curl -X POST http://localhost:4000/license/register \
  -H "Content-Type: application/json" \
  -d '{"hw_fingerprint":"test-machine-123"}'
# -> {"device_id":"..."}

curl -X POST http://localhost:4000/license/verify \
  -H "Content-Type: application/json" \
  -d '{"device_id":"<paste device_id here>"}'
# -> signed verdict JSON: {device_id, license_id, status:"active", plan_type:"trial", expires_at, server_time, nonce, signature}
```
If both calls return clean JSON, the server half is done and correct.

**4. Desktop client**
```bash
cd ../desktop-client
npm install
```
Wire `main-integration-example.js` into your actual Electron `main.js` (or
rename it), point `preload.js` in your `BrowserWindow` config, and in your
React UI listen for `window.dmsLicense.onBlocked(...)` to show a lock screen,
and call `window.dmsLicense.checkNow()` before letting a new Sale be created.

Add the sync engine alongside the guard in `main-integration-example.js`:
```js
const { SyncEngine } = require('./sync-engine');
// after guard.init(localDb) succeeds:
const syncEngine = new SyncEngine(localDb, guard.deviceId, 'https://api.yourdms.com');
syncEngine.startBackgroundLoop(30000);
// expose to renderer via preload/ipc, e.g.:
// ipcMain.handle('pos:createSale', (e, sale) => syncEngine.writeAndQueue('sales', sale));
```

**5. If you don't use Electron / SQLite yet**
`local-db.js` exposes both a simple `get(key)/set(key,value)` (used by the
license module) and a generic `insert/run/all/queryOne` (used by the sync
engine). Swap `better-sqlite3` for whatever local storage your current POS
already uses, keeping the same method names, and nothing else needs to change.

## Wiring into an existing Express app instead of running `server-index.js`

```js
app.use('/', require('./license-api'));
app.use('/', require('./sync-api'));
```
Run `schema.sql` against your cloud MySQL (Aiven) once, and set
`LICENSE_PRIVATE_KEY_PATH` in that app's environment.

## Not covered here (next steps if you want them)

- Admin panel to manually mark a license `blocked` (e.g. chargebacks) or convert `trial` → `paid`
- Payment webhook (Stripe/JazzCash/EasyPaisa) to auto-extend `paid_expiry_at`
- VM/sandbox detection (optional, more aggressive — only worth it if trial abuse via VMs becomes a real problem)
- Rate-limiting `/license/register` and `/license/verify` to stop scripted abuse
