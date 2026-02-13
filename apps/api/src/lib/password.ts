// ============================================================================
// RETROFOOT - Worker-safe password hashing (PBKDF2) with legacy compatibility
// ============================================================================

const HASH_PREFIX = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

type VerifyInput = {
  hash: string;
  password: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }

  return diff === 0;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const normalizedPassword = password.normalize('NFKC');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizedPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );

  return new Uint8Array(bits);
}

export function isWorkerHash(hash: string): boolean {
  return hash.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPasswordWorker(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(key)}`;
}

export async function verifyPasswordWorker({
  hash,
  password,
}: VerifyInput): Promise<boolean> {
  const [prefix, iterationsRaw, saltRaw, keyRaw] = hash.split('$');
  if (!prefix || !iterationsRaw || !saltRaw || !keyRaw) {
    return false;
  }

  if (prefix !== HASH_PREFIX) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  let salt: Uint8Array;
  let expectedKey: Uint8Array;
  try {
    salt = fromBase64(saltRaw);
    expectedKey = fromBase64(keyRaw);
  } catch {
    return false;
  }

  const actualKey = await deriveKey(password, salt, iterations);
  return constantTimeEqual(actualKey, expectedKey);
}
