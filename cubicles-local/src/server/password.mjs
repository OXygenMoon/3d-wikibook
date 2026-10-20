import { randomBytes, scrypt as scryptCb, pbkdf2 as pbkdf2Cb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const pbkdf2 = promisify(pbkdf2Cb);

function passwordSpec(hash) {
  if (typeof hash !== 'string' || hash.length > 512) return null;
  if (/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) {
    const [salt, digest] = hash.split(':');
    return { kind: 'native', salt, digest, length: 64 };
  }
  const parts = hash.split('$');
  if (parts.length !== 3 || !/^[A-Za-z0-9]{1,64}$/.test(parts[1]) || !/^[a-f0-9]+$/.test(parts[2])) return null;
  const [method, salt, digest] = parts;
  if (/^scrypt:[1-9]\d{0,5}:[1-9]\d?:[1-9]\d?$/.test(method)) {
    const [, cost, blockSize, parallel] = method.split(':').map(Number);
    if (cost < 1024 || cost > 65536 || (cost & (cost - 1)) || blockSize > 8 || parallel > 4 || cost * blockSize * parallel > 1048576 || digest.length !== 128) return null;
    return { kind: 'scrypt', salt, digest, length: 64, options: { N: cost, r: blockSize, p: parallel, maxmem: 128 * 1024 * 1024 } };
  }
  const match = /^pbkdf2:(sha256|sha512):([1-9]\d{0,6})$/.exec(method);
  if (!match || Number(match[2]) > 2000000 || digest.length !== (match[1] === 'sha256' ? 64 : 128)) return null;
  return { kind: 'pbkdf2', salt, digest, length: digest.length / 2, algorithm: match[1], iterations: Number(match[2]) };
}

export function passwordHashSupported(hash) {
  return passwordSpec(hash) !== null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(password, hash) {
  const spec = passwordSpec(hash);
  if (!spec || typeof password !== 'string' || password.length > 4096) return false;
  try {
    const candidate = spec.kind === 'pbkdf2'
      ? await pbkdf2(password, spec.salt, spec.iterations, spec.length, spec.algorithm)
      : await scrypt(password, spec.salt, spec.length, spec.options);
    const expected = Buffer.from(spec.digest, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}
