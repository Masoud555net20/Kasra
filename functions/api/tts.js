import { json } from './_helpers.js';

/* ---------- پروکسی تبدیل متن فارسی به گفتار (TTS) ----------
   از سرویس رایگان گوگل ترنسلیت استفاده می‌کند تا صدای فارسی طبیعی تولید شود
   (چون صدای فارسی روی اکثر مرورگرهای ویندوز نصب نیست و متن انگلیسی خوانده می‌شد).
   درخواست از سرورهای کلادفلر ارسال می‌شود؛ بدون محدودیت جغرافیایی برای کاربر. */

const UPSTREAMS = [
  'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fa&q=',
  'https://clients5.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fa&q='
];

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  if (request.method !== 'GET') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const text = (url.searchParams.get('text') || '').trim();
  if (!text) {
    return json({ ok: false, message: 'متن صوتی ارسال نشده است.' }, 400);
  }
  if (text.length > 200) {
    return json({ ok: false, message: 'متن صوتی بیش از حد طولانی است (حداکثر ۲۰۰ نویسه).' }, 400);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://translate.google.com/'
  };

  for (const base of UPSTREAMS) {
    try {
      const upstream = await fetch(base + encodeURIComponent(text), { headers });
      if (!upstream.ok) continue;
      const audio = await upstream.arrayBuffer();
      if (audio.byteLength < 500) continue;
      return new Response(audio, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      continue;
    }
  }

  return json({ ok: false, message: 'سرویس تولید صدا در دسترس نیست.' }, 502);
}