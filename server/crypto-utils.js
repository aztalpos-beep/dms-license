// crypto-utils.js  (SERVER SIDE ONLY — never ship this file or the private key to the client)
//
// Why RSA and not HMAC:
// HMAC verification needs the SAME secret used to sign. If that secret ever ships inside
// the desktop app (even obfuscated), someone can extract it and forge their own "valid"
// license verdicts offline forever. RSA fixes this: server signs with a PRIVATE key that
// never leaves the server; the client only ever holds the PUBLIC key, which can verify
// a signature but cannot create one. Leaking the public key is harmless by design.

const crypto = require('crypto');
const fs = require('fs');

// Two ways to supply the private key, so this works both locally and on
// platforms like Render/Railway where you can't reference a file path:
//   1. LICENSE_PRIVATE_KEY      — the PEM content itself, pasted directly into
//      the platform's environment variables dashboard (use this on Render/Railway)
//   2. LICENSE_PRIVATE_KEY_PATH — a file path to private.pem (use this for local dev)
// Never commit the actual key to the repo either way.
function loadPrivateKey() {
  if (process.env.LICENSE_PRIVATE_KEY) {
    // Render/Railway env var UI often escapes newlines as literal "\n" — restore them.
    return process.env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (process.env.LICENSE_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.LICENSE_PRIVATE_KEY_PATH, 'utf8');
  }
  throw new Error('Set either LICENSE_PRIVATE_KEY or LICENSE_PRIVATE_KEY_PATH.');
}

const PRIVATE_KEY = loadPrivateKey();

function canonicalPayload(verdict) {
  // Fixed field order — the exact bytes that get signed. Client must reconstruct this
  // identically before verifying, so never change the order without versioning it.
  const { device_id, license_id, status, plan_type, expires_at, server_time, nonce } = verdict;
  return [device_id, license_id, status, plan_type, expires_at || '', server_time, nonce].join('|');
}

/**
 * Signs a license verdict object. Called only by the server after it decides
 * the true status of a license (trial/paid/expired/blocked).
 */
function signVerdict(verdict) {
  const payload = canonicalPayload(verdict);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payload);
  signer.end();
  const signature = signer.sign(PRIVATE_KEY, 'hex');
  return { ...verdict, signature };
}

module.exports = { signVerdict, canonicalPayload };
