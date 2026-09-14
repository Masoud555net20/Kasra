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
      const address = String(item.address ?? item.defaultAddress ?? '').trim();
      const status = String(item.status || 'فعال').trim();
      const description = String(item.description || '').trim();
      const now = new Date().toISOString();

      // created_by دارای قید کلید خارجی است؛ مقدار خالی یا ناموجود باعث خطای FK می‌شود → NULL می‌گذاریم
      let createdBy = String(item.createdBy ?? item.created_by ?? '').trim() || null;
      if (createdBy) {
        const owner = await db.prepare('SELECT id FROM users WHERE id = ?').bind(createdBy).first();
        if (!owner) createdBy = null;
      }

      if (!title) {
        return json({ ok: false, message: 'عنوان پروژه الزامی است.' }, 400);
      }

      await db.prepare(`
        INSERT INTO projects (id, title, address, status, description, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          address = excluded.address,
          status = excluded.status,
          description = excluded.description,
          created_by = excluded.created_by,
          updated_at = excluded.updated_at
      `).bind(id, title, address, status, description, createdBy, now, now).run();

      const row = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
      return json({ ok: true, project: row });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      let id = url.searchParams.get('id');
      if (!id) {
        const body = await parseJsonBody(request);
        id = String(body.id || '').trim();
      }
      if (!id) {
        return json({ ok: false, message: 'شناسه پروژه الزامی است.' }, 400);
      }

      // مأموریت‌های مرتبط ابتدا از پروژه جدا می‌شوند (عنوان پروژه در خود مأموریت حفظ می‌ماند)
      // سپس پروژه حذف می‌شود — هر دو عملیات اتمیک اجرا می‌شوند
      const now = new Date().toISOString();
      await db.batch([
        db.prepare('UPDATE missions SET project_id = NULL, updated_at = ? WHERE project_id = ?').bind(now, id),
        db.prepare('DELETE FROM projects WHERE id = ?').bind(id)
      ]);

      const stillThere = await db.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first();
      if (stillThere) {
        return json({ ok: false, message: 'حذف پروژه در دیتابیس انجام نشد.' }, 500);
      }
      return json({ ok: true, deletedId: id });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در عملیات پروژه‌ها.' }, 500);
  }
}
