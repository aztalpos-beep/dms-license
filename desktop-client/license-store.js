// license-store.js
// Caches the LAST SIGNED verdict locally (SQLite/local DB) so the app can start
// and run correctly offline, without ever trusting the local system clock alone.
//
// Core rule: the local cache stores a verdict signed by the server, plus the
// server_time it carried. All offline decisions are made relative to that
// server_time + elapsed wall-clock ticks since we last saw the app running —
// NOT relative to whatever the OS clock currently says.

const { verifySignedVerdict } = require('./verify-verdict');

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48h max offline without contacting server

class LicenseStore {
  /**
   * @param {object} localDb - your local SQLite wrapper (get/set key-value or a table)
   */
  constructor(localDb) {
    this.db = localDb;
  }

  /** Called right after a successful /license/verify call. */
  async saveVerdict(signedVerdict) {
    if (!verifySignedVerdict(signedVerdict)) {
      throw new Error('Refusing to cache an unsigned/invalid verdict');
    }
    await this.db.set('license_verdict', JSON.stringify(signedVerdict));
    // monotonic_anchor: a tick count independent of wall clock, used to measure
    // elapsed time without trusting Date.now() alone. Node's process.hrtime is
    // per-process only, so we persist an incrementing "last seen" server_time
    // and compare future server_time responses against it — the real trust
    // anchor is always the NEXT server response, this is just the offline bridge.
    await this.db.set('license_last_saved_at_iso', new Date().toISOString());
  }

  async getCachedVerdict() {
    const raw = await this.db.get('license_verdict');
    if (!raw) return null;
    const verdict = JSON.parse(raw);
    // Re-verify every time we read it — catches direct DB file tampering.
    if (!verifySignedVerdict(verdict)) return null;
    return verdict;
  }

  /**
   * Decides if the app may run RIGHT NOW, using only a previously-verified
   * signed verdict plus grace-period math. Call this on every app launch when
   * offline, and periodically while running.
   */
  async evaluateOffline() {
    const verdict = await this.getCachedVerdict();
    if (!verdict) {
      return { allowed: false, reason: 'no_verified_license_found' };
    }

    if (verdict.status === 'blocked') {
      return { allowed: false, reason: 'license_blocked' };
    }

    const serverTimeAtLastContact = new Date(verdict.server_time);
    const now = new Date(); // local clock — only used to measure ELAPSED time, not absolute time

    const lastSavedAt = new Date(await this.db.get('license_last_saved_at_iso'));
    const elapsedSinceLastContact = now - lastSavedAt;

    // Clock rollback detection: if "now" is BEFORE the last time we saved a verdict,
    // the system clock was moved backwards. Block immediately.
    if (elapsedSinceLastContact < 0) {
      return { allowed: false, reason: 'clock_rollback_detected' };
    }

    // Trial/paid expiry — check against server's stated expiry, not local guesswork.
    if (verdict.expires_at) {
      const expiresAt = new Date(verdict.expires_at);
      const estimatedCurrentServerTime = new Date(serverTimeAtLastContact.getTime() + elapsedSinceLastContact);
      if (estimatedCurrentServerTime > expiresAt) {
        return { allowed: false, reason: 'license_expired' };
      }
    }

    // Grace period — too long without contacting the server at all.
    if (elapsedSinceLastContact > GRACE_PERIOD_MS) {
      return { allowed: false, reason: 'grace_period_exceeded_please_connect' };
    }

    return { allowed: true, reason: 'ok_offline_within_grace_period' };
  }
}

module.exports = { LicenseStore, GRACE_PERIOD_MS };
