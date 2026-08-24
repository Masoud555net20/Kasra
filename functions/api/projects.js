import { json, parseJsonBody, ensureDb } from './_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  try {
    const db = ensureDb(env);

    if (request.method === 'GET') {
      const { results } = await db.prepare(`
        SELECT * FROM projects ORDER BY created_at DESC
      `).all();
      return json({ ok: true, items: results });
    }

    if (request.method === 'POST') {
      const body = await parseJsonBody(request);
      const item = body.project || body;
      const id = String(item.id || crypto.randomUUID());
      const title = String(item.title || '').trim();
      const code = String(item.code || '').trim();
      const client = String(item.client || '').trim();
      const status = String(item.status || 'فعال').trim();
      const description = String(item.description || '').trim();
      const createdBy = String(item.createdBy || item.created_by || '');
      const now = new Date().toISOString();

      if (!title || !code) {
        return json({ ok: false, message: 'عنوان و کد پروژه الزامی هستند.' }, 400);
      }

      await db.prepare(`
        INSERT INTO projects (id, title, code, client, status, description, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          code = excluded.code,
          client = excluded.client,
          status = excluded.status,
          description = excluded.description,
          created_by = excluded.created_by,
          updated_at = excluded.updated_at
      `).bind(id, title, code, client, status, description, createdBy, now, now).run();

      const row = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
      return json({ ok: true, project: row });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ ok: false, message: 'شناسه پروژه الزامی است.' }, 400);
      }

      await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
      return json({ ok: true, deletedId: id });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در عملیات پروژه‌ها.' }, 500);
  }
}
