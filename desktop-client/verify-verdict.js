// verify-verdict.js  (bundled inside the desktop app — contains ONLY the public key)
//
// This file can be fully read by anyone who decompiles the app. That's fine —
// the public key can only verify signatures, never create them.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'keys', 'public.pem'), 'utf8');

function canonicalPayload(verdict) {
  // MUST exactly match server's crypto-utils.js canonicalPayload — same field order.
  const { device_id, license_id, status, plan_type, expires_at, server_time, nonce } = verdict;
  return [device_id, license_id, status, plan_type, expires_at || '', server_time, nonce].join('|');
}

/**
 * Returns true only if the verdict was actually signed by our server's private key
 * AND has not been tampered with in transit or on disk.
 */
function verifySignedVerdict(signedVerdict) {
  const { signature, ...verdict } = signedVerdict;
  if (!signature) return false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(canonicalPayload(verdict));
    verifier.end();
    return verifier.verify(PUBLIC_KEY, signature, 'hex');
  } catch {
    return false;
  }
}

module.exports = { verifySignedVerdict };
