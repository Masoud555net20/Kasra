import { json, parseJsonBody, ensureDb, sanitizeUser } from './_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  try {
    const db = ensureDb(env);

    if (request.method === 'GET') {
      const { results } = await db.prepare(`
        SELECT * FROM users ORDER BY created_at DESC
      `).all();

      return json({ ok: true, items: results.map(sanitizeUser) });
    }

    if (request.method === 'POST') {
      const body = await parseJsonBody(request);
      const item = body.user || body;
      const id = String(item.id || crypto.randomUUID());
      const username = String(item.username || '').trim();
      const password = String(item.password || '');
      const fullName = String(item.fullName || item.full_name || '').trim();
      const role = String(item.role || 'کارشناس').trim();
      const signature = item.signature || null;
      const isActive = item.isActive ?? item.is_active ?? 1;
      const now = new Date().toISOString();

      if (!username || !fullName) {
        return json({ ok: false, message: 'نام کاربری و نام کامل الزامی هستند.' }, 400);
      }

      await db.prepare(`
        INSERT INTO users (id, username, password, full_name, role, signature, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          password = excluded.password,
          full_name = excluded.full_name,
          role = excluded.role,
          signature = excluded.signature,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).bind(id, username, password, fullName, role, signature, isActive ? 1 : 0, now, now).run();

      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return json({ ok: true, user: sanitizeUser(row) });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ ok: false, message: 'شناسه کاربر الزامی است.' }, 400);
      }

      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ ok: true, deletedId: id });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در عملیات کاربران.' }, 500);
  }
}
