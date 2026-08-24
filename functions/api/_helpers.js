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
