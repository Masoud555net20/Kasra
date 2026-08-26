import { json, parseJsonBody, ensureDb } from './_helpers.js';

const GEMINI_KEY_ROW = 'gemini_api_key';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  try {
    const db = ensureDb(env);

    if (request.method === 'GET') {
      const row = await db
        .prepare('SELECT value, updated_at FROM settings WHERE key = ?')
        .bind(GEMINI_KEY_ROW)
        .first();
      return json({
        ok: true,
        settings: {
          geminiApiKey: row?.value || '',
          updatedAt: row?.updated_at || null
        }
      });
    }

    if (request.method === 'POST') {
      const body = await parseJsonBody(request);
      const apiKey = String(body.geminiApiKey ?? body.apiKey ?? '').trim();
      const now = new Date().toISOString();

      await db.prepare(`
        INSERT INTO settings (id, key, value, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind('set-gemini', GEMINI_KEY_ROW, apiKey, 'کلید API دستیار هوشمند Gemini', now, now).run();

      return json({ ok: true, message: 'تنظیمات ذخیره شد.' });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در عملیات تنظیمات.' }, 500);
  }
}
