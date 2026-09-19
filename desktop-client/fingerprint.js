// fingerprint.js  (runs inside the Electron main process, has Node access)
// Builds a stable hash from hardware identifiers that survive app reinstall
// but not a full OS reinstall/hardware swap — good enough to stop casual
// "delete and reinstall for a new trial" abuse without being intrusive.

const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function getDiskSerial() {
  if (process.platform === 'win32') {
    return safeExec('wmic diskdrive get serialnumber').split('\n')[1] || '';
  }
  if (process.platform === 'darwin') {
    return safeExec("ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformSerialNumber/{print $4}'");
  }
  // linux
  return safeExec('cat /etc/machine-id') || safeExec('lsblk -no SERIAL /dev/sda');
}

function getPrimaryMac() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        return net.mac;
      }
    }
  }
  return '';
}

/**
 * Returns a stable SHA-256 hex hash identifying this machine.
 * Combines multiple weak signals so no single one being spoofed breaks it,
 * and so a VM clone (which often keeps the same MAC) is still somewhat resistant.
 */
function getHardwareFingerprint() {
  const parts = [
    getDiskSerial(),
    getPrimaryMac(),
    os.hostname(),
    os.cpus()?.[0]?.model || '',
  ];
  const raw = parts.join('::');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = { getHardwareFingerprint };
