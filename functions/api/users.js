import { json, parseJsonBody, ensureDb, sanitizeUser, hashPassword } from './_helpers.js';

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
      const password = String(item.password ?? '').trim();
      const fullName = String(item.fullName || item.full_name || '').trim();
      const role = String(item.role || 'کارشناس').trim();
      const signature = item.signature || null;
      const isActive = item.isActive ?? item.is_active ?? 1;
      const now = new Date().toISOString();

      if (!username || !fullName) {
        return json({ ok: false, message: 'نام کاربری و نام کامل الزامی هستند.' }, 400);
      }

      const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();

      // جلوگیری از نام کاربری تکراری (به‌صورت case-insensitive) با کاربر دیگری
      const duplicate = await db
        .prepare('SELECT id, full_name FROM users WHERE lower(username) = lower(?) AND id <> ?')
        .bind(username, id)
        .first();
      if (duplicate) {
        return json({
          ok: false,
          message: `نام کاربری «${username}» قبلاً برای کاربر «${duplicate.full_name}» ثبت شده است.`
        }, 409);
      }

      // رمز عبور: در ایجاد الزامی است؛ در ویرایش اگر خالی بود رمز قبلی حفظ می‌شود
      let storedPassword = existing ? existing.password : null;
      if (password) {
        storedPassword = await hashPassword(password);
      }
      if (!storedPassword) {
        return json({ ok: false, message: 'رمز عبور برای کاربر جدید الزامی است.' }, 400);
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
      `).bind(id, username, storedPassword, fullName, role, signature, isActive ? 1 : 0, now, now).run();

      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      return json({ ok: true, user: sanitizeUser(row) });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      let id = url.searchParams.get('id');
      if (!id) {
        const body = await parseJsonBody(request);
        id = String(body.id || '').trim();
      }
      if (!id) {
        return json({ ok: false, message: 'شناسه کاربر الزامی است.' }, 400);
      }

      const user = await db.prepare('SELECT id, full_name FROM users WHERE id = ?').bind(id).first();
      if (!user) {
        return json({ ok: false, message: 'کاربر مورد نظر یافت نشد.' }, 404);
      }

      // کاربری که مأموریت ثبت‌شده دارد قابل حذف نیست (user_id در missions اجباری است)
      const cnt = await db.prepare('SELECT COUNT(*) AS n FROM missions WHERE user_id = ?').bind(id).first();
      const missionCount = Number(cnt?.n || 0);
      if (missionCount > 0) {
        return json({
          ok: false,
          message: `کاربر «${user.full_name}» دارای ${missionCount} مأموریت ثبت‌شده است و حذف نشد؛ ابتدا مأموریت‌های او را حذف یا منتقل کنید.`
        }, 409);
      }

      // لاگ‌های ورود/فعالیت و پروژه‌های ایجادشده بدون کاربر باقی می‌مانند (ارجاع NULL می‌شود)
      await db.batch([
        db.prepare('UPDATE login_logs SET user_id = NULL WHERE user_id = ?').bind(id),
        db.prepare('UPDATE activity_logs SET user_id = NULL WHERE user_id = ?').bind(id),
        db.prepare('UPDATE projects SET created_by = NULL WHERE created_by = ?').bind(id),
        db.prepare('DELETE FROM users WHERE id = ?').bind(id)
      ]);

      const stillThere = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
      if (stillThere) {
        return json({ ok: false, message: 'حذف کاربر در دیتابیس انجام نشد.' }, 500);
      }
      return json({ ok: true, deletedId: id });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در عملیات کاربران.' }, 500);
  }
}
