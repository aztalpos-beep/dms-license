// license-guard.js
// Single entry point the rest of the app calls. Import this everywhere that
// needs to know "is this app allowed to run / create a sale right now?"
//
// IMPORTANT: this guard must be called from the LOCAL SERVER / backend layer
// that actually writes to the local DB (Sale, Payment, etc.) — not only from
// the React UI. If it's only a UI-level check, someone can bypass it by
// editing renderer JS. The write path itself must refuse to write when blocked.

const { getHardwareFingerprint } = require('./fingerprint');
const { LicenseStore } = require('./license-store');

const API_BASE = process.env.DMS_CLOUD_API || 'https://api.yourdms.com';

class LicenseGuard {
  constructor(localDb, httpClient = fetch) {
    this.store = new LicenseStore(localDb);
    this.http = httpClient;
    this.deviceId = null;
  }

  async init(localDb) {
    this.deviceId = await localDb.get('device_id');
    if (!this.deviceId) {
      // first run — register with server (requires internet on first install)
      const hw_fingerprint = getHardwareFingerprint();
      const res = await this.http(`${API_BASE}/license/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hw_fingerprint }),
      });
      if (!res.ok) throw new Error('Could not register device — internet required for first install.');
      const { device_id } = await res.json();
      this.deviceId = device_id;
      await localDb.set('device_id', device_id);
    }
  }

  /** Try to refresh from server. Call on app start (if online) and every ~15 min while running. */
  async refreshFromServer() {
    try {
      const res = await this.http(`${API_BASE}/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: this.deviceId,
          client_claimed_time: new Date().toISOString(), // logged for anomaly detection only, not trusted
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return false;
      const verdict = await res.json();
      await this.store.saveVerdict(verdict);
      return true;
    } catch {
      return false; // offline or server unreachable — fall through to cached verdict
    }
  }

  /**
   * The single function every critical action (open app, create sale, print, etc.)
   * should call. Tries live server first; falls back to the signed local cache.
   */
  async check() {
    const wentOnline = await this.refreshFromServer();
    const result = await this.store.evaluateOffline();

    if (!result.allowed) {
      return {
        allowed: false,
        reason: result.reason,
        message: this._humanMessage(result.reason),
      };
    }
    return { allowed: true, source: wentOnline ? 'server' : 'cached', reason: result.reason };
  }

  _humanMessage(reason) {
    const messages = {
      no_verified_license_found: 'License could not be verified. Please connect to the internet.',
      license_blocked: 'This license has been blocked. Contact support.',
      clock_rollback_detected: 'System clock appears to have been changed. Please correct the date/time and reconnect to the internet.',
      license_expired: 'Your trial/license has expired. Please renew to continue.',
      grace_period_exceeded_please_connect: 'DMS needs to reconnect to the internet to continue (offline limit reached).',
    };
    return messages[reason] || 'License check failed.';
  }
}

module.exports = { LicenseGuard };
