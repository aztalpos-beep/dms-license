// Run ONCE during setup: node scripts/generate-keys.js
// Produces private.pem (keep on server only, e.g. in env/secrets manager)
// and public.pem (safe to embed inside the desktop app).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const outDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'private.pem'), privateKey);
fs.writeFileSync(path.join(outDir, 'public.pem'), publicKey);

console.log('Keys written to', outDir);
console.log('-> private.pem : keep on server ONLY (set LICENSE_PRIVATE_KEY_PATH to it)');
console.log('-> public.pem  : bundle this inside the desktop client app');
