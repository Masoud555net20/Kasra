import { json, parseJsonBody, ensureDb, verifyPassword, hashPassword, isHashedPassword, normalizeUsername } from '../_helpers.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  const body = await parseJsonBody(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '').trim();

  if (!username || !password) {
    return json({ ok: false, message: 'نام کاربری و کلمه عبور الزامی هستند.' }, 400);
  }

  try {
    const db = ensureDb(env);

    /* Bootstrap: فقط اگر جدول users کاملاً خالی باشد، کاربر مدیر اولیه ساخته می‌شود.
       در غیر این صورت احراز هویت صرفاً از روی جدول users دیتابیس انجام می‌شود. */
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM users').first();
    if (Number(cnt?.n || 0) === 0) {
      const now = new Date().toISOString();
      await db.prepare(`
        INSERT INTO users (id, username, password, full_name, role, signature, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)
      `).bind('u_admin', 'admin', await hashPassword(password), 'مدیر سیستم', 'مدیر سیستم', now, now).run();
    }

    const row = await db.prepare(`
      SELECT *
      FROM users
      WHERE lower(username) = lower(?)
      LIMIT 1
    `).bind(username).first();

    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null;
    const userAgent = request.headers.get('User-Agent') || null;

    const logFailure = async (message) => {
      await db.prepare(`
        INSERT INTO login_logs (id, username, ip_address, user_agent, success, error_message, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).bind(crypto.randomUUID(), username, clientIp, userAgent, message, new Date().toISOString()).run();
    };

    if (!row) {
      await logFailure('کاربر یافت نشد');
      return json({
        ok: false,
        message: `نام کاربری «${username}» در سامانه ثبت نشده است. لطفاً نام کاربری را بررسی کنید (بدون فاصله و با حروف لاتین).`
      }, 401);
    }

    if (Number(row.is_active ?? 1) !== 1) {
      await logFailure('حساب کاربری غیرفعال');
      return json({ ok: false, message: 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سیستم تماس بگیرید.' }, 403);
    }

    const passwordOk = await verifyPassword(password, row.password);
    if (!passwordOk) {
      await logFailure('رمز عبور اشتباه');
      return json({ ok: false, message: 'کلمه عبور اشتباه است. دوباره تلاش کنید.' }, 401);
    }

    // ارتقای شفاف رمزهای متنی قدیمی به hash (یک‌بار برای هر کاربر)
    if (!isHashedPassword(row.password)) {
      try {
        await db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?')
          .bind(await hashPassword(password), new Date().toISOString(), row.id).run();
      } catch (e) {
        console.warn('Password hash upgrade failed:', e);
      }
    }

    await db.prepare(`
      INSERT INTO login_logs (id, user_id, username, ip_address, user_agent, success, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).bind(crypto.randomUUID(), row.id, row.username, clientIp, userAgent, new Date().toISOString()).run();

    await db.prepare(`
      UPDATE users
      SET last_login_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), new Date().toISOString(), row.id).run();

    const user = { ...row };
    delete user.password;

    return json({ ok: true, user });
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در ورود به سیستم.' }, 500);
  }
}
