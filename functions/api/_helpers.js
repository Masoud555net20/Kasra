export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function parseJsonBody(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const rawText = await request.text();

    if (!rawText) {
      return {};
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawText);
      const result = {};
      for (const [key, value] of params.entries()) {
        result[key] = value;
      }
      return result;
    }

    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function sanitizeUser(user) {
  if (!user) return user;
  const { password, ...safe } = user;
  return safe;
}

export function ensureDb(env) {
  if (!env || !env.DB) {
    throw new Error('D1 database binding is not configured.');
  }
  return env.DB;
}

/* ---------- رمزنگاری رمز عبور (PBKDF2-SHA256) ----------
   فرمت ذخیره: pbkdf2$<iterations>$<saltHex>$<hashHex>
   سازگاری با کاربران قدیمی: اگر رمز ذخیره‌شده hash نبود، مقایسه متنی انجام و
   در اولین ورود موفق به‌صورت خودکار به hash ارتقا می‌یابد (migration شفاف). */
const PBKDF2_ITERATIONS = 100000;

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const clean = String(hex || '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2Sha256(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isHashedPassword(stored) {
  return typeof stored === 'string' && stored.startsWith('pbkdf2$');
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Sha256(String(password), salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const storedValue = String(stored ?? '');
  if (!storedValue) return false;
  if (!isHashedPassword(storedValue)) {
    return String(password) === storedValue;
  }
  const parts = storedValue.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  try {
    const actual = await pbkdf2Sha256(String(password), salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
