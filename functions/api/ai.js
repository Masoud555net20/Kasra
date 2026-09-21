import { json, parseJsonBody } from './_helpers.js';

/* ---------- دستیار هوش مصنوعی ابری (Cloudflare Workers AI) ----------
   تمام درخواست‌های هوش مصنوعی برنامه از این مسیر عبور می‌کنند:
   ۱) رایگان با همان اکانت Cloudflare — بدون نیاز به هیچ کلید API
   ۲) اجرا روی سرورهای کلادفلر → بدون مشکل تحریم و فیلترینگ برای کاربران ایران
   ۳) پاسخ‌ها در قالب استاندارد Gemini نرمال‌سازی می‌شوند تا منطق فرانت‌اند تغییر نکند */

const TEXT_MODELS = [
  /* مدل‌های تأییدشده روی همین اکانت (npx wrangler ai models) — به ترتیب کیفیت فارسی:
     DeepSeek-V4-Flash (جدیدترین، فارسی و JSON عالی) → Llama 3.3 70B (امتحان‌شده) → Qwen3-30B → Mistral-Small-3.1 → Llama 3.1 */
  '@cf/deepseek-ai/deepseek-v4-flash-0731',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8'
];

const VISION_MODELS = [
  '@cf/meta/llama-3.2-11b-vision-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct'
];

const IMAGE_MODELS = [
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/stabilityai/stable-diffusion-xl-base-9.0'
];

const STT_MODELS = [
  /* whisper (small) روی این اکانت تست لایو شد و پاسخ داد — اول قرار می‌گیرد تا تلاش ناموفق turbo وقت نگیرد */
  '@cf/openai/whisper',
  '@cf/openai/whisper-large-v3-turbo'
];

const MAX_STT_AUDIO_BYTES = 8 * 1024 * 1024; // سقف ~۸ مگابایت برای هر فایل صوتی

const MAX_INPUT_CHARS = 40000;

function requireAi(env) {
  if (!env || !env.AI) {
    throw new Error('موتور هوش مصنوعی ابری (Workers AI) روی این محیط فعال نیست.');
  }
  return env.AI;
}

function partsToText(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map(p => (p && typeof p.text === 'string') ? p.text : '')
    .join('\n')
    .trim();
}

function extractImagePart(contents) {
  for (const c of (Array.isArray(contents) ? contents : [])) {
    for (const p of ((c && c.parts) || [])) {
      if (p && p.inlineData && p.inlineData.data) return p.inlineData;
    }
  }
  return null;
}

function buildJsonInstruction(generationConfig) {
  if (!generationConfig) return '';
  const wantsJson = generationConfig.responseMimeType === 'application/json' || generationConfig.responseSchema;
  if (!wantsJson) return '';
  let hint = '\n\nمهم: پاسخ را فقط و فقط به‌صورت یک شیء JSON معتبر و خالص برگردان؛ بدون هیچ توضیح اضافه، متن خوشامد یا بلوک کد.';
  if (generationConfig.responseSchema) {
    hint += '\nساختار خروجی نمونه (فقط همین کلیدها را در سطح اولِ شیء JSON برگردان و مقادیر را از متن کاربر پر کن): ' + JSON.stringify(schemaToExample(generationConfig.responseSchema));
  }
  return hint;
}

/* مقادیر نمونه بر اساس نام فیلد — به مدل‌های کوچک کمک می‌کند فرمت درست را تقلید کنند */
const FIELD_EXAMPLES = {
  date: '1404-06-15', day: 'پنجشنبه', time: '08:00',
  startTime: '08:00', endTime: '12:30',
  location: 'بهداشت و درمان صنعت نفت', address: 'نشانی کامل محل مأموریت',
  outboundVehicle: 'اسنپ/تپسی', inboundVehicle: 'آژانس', vehicleType: 'اسنپ/تپسی',
  outboundCost: 600000, inboundCost: 0, amount: 600000, suggestedProjectId: '1'
};

/* اسکیمای Gemini را به نمونه تخت تبدیل می‌کند تا مدل به‌جای داده، ساختار اسکیما را اکو نکند */
function schemaToExample(schema) {
  if (!schema || typeof schema !== 'object') return '';
  const type = String(schema.type || '').toUpperCase();
  if (schema.properties && typeof schema.properties === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out[k] = Object.prototype.hasOwnProperty.call(FIELD_EXAMPLES, k) ? FIELD_EXAMPLES[k] : schemaToExample(v);
    }
    return out;
  }
  if (type === 'ARRAY') return [schemaToExample(schema.items)];
  if (type === 'NUMBER' || type === 'INTEGER') return 0;
  if (type === 'BOOLEAN') return true;
  return '';
}

function looksLikeSchemaEcho(v) {
  return !!(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 &&
    Object.keys(v).every(k => ['type', 'properties', 'items', 'description', 'required', 'enum', 'format'].includes(k)));
}

/* اگر مدل ساختار اسکیما را به‌جای داده برگرداند، داده واقعی بیرون کشیده می‌شود */
function unwrapSchemaEcho(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (looksLikeSchemaEcho(obj) && obj.properties) return unwrapSchemaEcho(obj.properties);
  const out = {};
  let changed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (looksLikeSchemaEcho(v)) {
      out[k] = v.properties ? unwrapSchemaEcho(v.properties) : (v.items ? [unwrapSchemaEcho(v.items)] : '');
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return changed ? out : obj;
}

function extractJsonBlock(raw) {
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  return text;
}

function textResponseShape(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function clampInput(text) {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return text.slice(0, MAX_INPUT_CHARS) + '\n\n[توجه: داده‌های ورودی برای پردازش کوتاه شده‌اند]';
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildMessages(payload) {
  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  const messages = [];
  const systemText = partsToText(
    (payload.systemInstruction && payload.systemInstruction.parts) ||
    (payload.system_instruction && payload.system_instruction.parts) ||
    []
  );
  if (systemText) messages.push({ role: 'system', content: systemText });
  for (const c of contents) {
    const role = c && c.role === 'model' ? 'assistant' : 'user';
    const text = clampInput(partsToText((c && c.parts) || []));
    if (text) messages.push({ role, content: text });
  }
  return messages;
}

/* مدل‌های استدلالی (DeepSeek/Qwen) ممکن است بلوک «تفکر» برگردانند — حذف می‌شود */
function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .replace(/<\|begin_of_thought\|>[\s\S]*?(?:<\|end_of_thought\|>|$)/g, '')
    .trim();
}

function coerceModelText(out) {
  if (typeof out === 'string') return stripThink(out);
  if (!out || typeof out !== 'object') return out == null ? '' : String(out);
  const v = out.response ?? out.result ?? out.description ?? out.text ?? out.content ?? out.message;
  if (typeof v === 'string') return stripThink(v);
  if (v && typeof v === 'object') {
    if (typeof v.text === 'string') return stripThink(v.text);
    if (typeof v.content === 'string') return stripThink(v.content);
    if (typeof v.response === 'string') return stripThink(v.response);
    return ''; // ساختار ناشناخته → فرصت به مدل بعدی داده می‌شود
  }
  return v == null ? '' : String(v);
}

function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

async function runTextChain(ai, messages, temperature, needsJson) {
  const errors = [];
  const variants = [
    { messages, max_tokens: 4096, temperature },
    { messages, max_tokens: 2048, temperature: 0.2 }
  ];
  for (const model of TEXT_MODELS) {
    for (const inputs of variants) {
      try {
        const out = await ai.run(model, inputs);
        const raw = coerceModelText(out);
        if (!raw || !raw.trim()) {
          errors.push(model + ': پاسخ خالی');
          continue;
        }
        if (needsJson) {
          const parsed = tryParseJson(extractJsonBlock(raw));
          if (!parsed) {
            errors.push(model + ': پاسخ JSON معتبر نبود');
            continue; // مدل/تلاش بعدی امتحان می‌شود
          }
          return { model, text: JSON.stringify(unwrapSchemaEcho(parsed)) };
        }
        return { model, text: raw };
      } catch (err) {
        errors.push(model + ': ' + String((err && err.message) || err).slice(0, 120));
      }
    }
  }
  throw new Error('مدل‌های متنی هوش مصنوعی پاسخ معتبر ندادند. ' + errors.slice(0, 3).join(' | '));
}

async function handleText(ai, payload) {
  const imagePart = extractImagePart(payload.contents);
  if (imagePart) return handleVision(ai, payload, imagePart);

  const jsonHint = buildJsonInstruction(payload.generationConfig);
  const messages = buildMessages(payload);
  if (!messages.length) throw new Error('متن درخواست ارسال نشده است.');

  const last = messages[messages.length - 1];
  if (last.role === 'user') last.content += jsonHint;
  else messages.push({ role: 'user', content: jsonHint.trim() });

  const temperature = Number((payload.generationConfig && payload.generationConfig.temperature) ?? 0.4);
  const { model, text } = await runTextChain(ai, messages, temperature, !!jsonHint);
  return { model, data: textResponseShape(text) };
}

async function handleVision(ai, payload, imagePart) {
  const jsonHint = buildJsonInstruction(payload.generationConfig);
  let prompt = partsToText((payload.systemInstruction && payload.systemInstruction.parts) || []);
  for (const c of (Array.isArray(payload.contents) ? payload.contents : [])) {
    const t = partsToText((c && c.parts) || []);
    if (t) prompt += (prompt ? '\n' : '') + t;
  }
  prompt = clampInput(prompt + jsonHint);

  const dataUrl = 'data:' + (imagePart.mimeType || 'image/jpeg') + ';base64,' + imagePart.data;
  const errors = [];

  for (const model of VISION_MODELS) {
    const variants = [
      { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 1024 },
      { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: dataUrl }] }], max_tokens: 1024 },
      { prompt, image: Array.from(base64ToUint8(imagePart.data)), max_tokens: 512 }
    ];
    for (const inputs of variants) {
      try {
        const out = await ai.run(model, inputs);
        const raw = coerceModelText(out);
        if (raw && raw.trim()) {
          if (jsonHint) {
            const parsed = tryParseJson(extractJsonBlock(raw));
            if (!parsed) {
              errors.push(model + ': پاسخ JSON معتبر نبود');
              continue;
            }
            return { model, data: textResponseShape(JSON.stringify(unwrapSchemaEcho(parsed))) };
          }
          return { model, data: textResponseShape(raw) };
        }
        errors.push(model + ': پاسخ خالی');
      } catch (err) {
        errors.push(model + ': ' + String((err && err.message) || err).slice(0, 120));
      }
    }
  }
  throw new Error('مدل‌های بینایی (تحلیل تصویر رسید) پاسخ ندادند. ' + errors.slice(0, 3).join(' | '));
}

async function handleImagen(ai, payload) {
  const prompt = payload && payload.instances && payload.instances[0] ? String(payload.instances[0].prompt || '') : '';
  if (!prompt) throw new Error('متن تولید تصویر (prompt) ارسال نشده است.');
  const errors = [];

  for (const model of IMAGE_MODELS) {
    try {
      const out = await ai.run(model, { prompt });
      const b64 = typeof out === 'string' ? out : (out && (out.image ?? out.img_b64));
      if (b64) {
        return { model, data: { predictions: [{ bytesBase64Encoded: b64, mimeType: 'image/png' }] } };
      }
      errors.push(model + ': تصویری برگردانده نشد');
    } catch (err) {
      errors.push(model + ': ' + String((err && err.message) || err).slice(0, 120));
    }
  }
  throw new Error('مدل‌های تولید تصویر پاسخ ندادند. ' + errors.slice(0, 3).join(' | '));
}

/* تبدیل گفتار به متن (Speech-to-Text) با Whisper کلادفلر — برای ثبت صوتی روی موبایل.
   ورودی: payload.audio (base64 فایل صوتی webm/mp4/wav) — خروجی: { text } */
async function handleStt(ai, payload) {
  const b64 = payload && payload.audio ? String(payload.audio) : '';
  if (!b64) throw new Error('فایل صوتی (audio) ارسال نشده است.');
  const bytes = base64ToUint8(b64);
  if (!bytes.length) throw new Error('فایل صوتی خالی است.');
  if (bytes.length > MAX_STT_AUDIO_BYTES) {
    throw new Error('حجم فایل صوتی بیش از حد مجاز است (حداکثر ۸ مگابایت).');
  }

  const errors = [];
  for (const model of STT_MODELS) {
    const variants = [
      { audio: Array.from(bytes), task: 'transcribe', language: 'fa' },
      { audio: Array.from(bytes), task: 'transcribe' },
      { audio: Array.from(bytes) }
    ];
    for (const inputs of variants) {
      try {
        const out = await ai.run(model, inputs);
        const text = out && typeof out.text === 'string' ? out.text.trim() : '';
        return { model, data: { text } }; // متن خالی هم موفق است (سکوت/نویز)
      } catch (err) {
        errors.push(model + ': ' + String((err && err.message) || err).slice(0, 100));
      }
    }
  }
  throw new Error('تبدیل گفتار به متن (Whisper) پاسخ نداد. ' + errors.slice(0, 3).join(' | '));
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({ ok: true }, 200);
  }

  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'cloudflare-workers-ai',
      hasAiBinding: !!(env && env.AI),
      models: { text: TEXT_MODELS, vision: VISION_MODELS, image: IMAGE_MODELS, stt: STT_MODELS }
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  try {
    const ai = requireAi(env);
    const body = await parseJsonBody(request);
    const kind = String(body.kind || 'text');
    const payload = body.payload;

    if (!payload || typeof payload !== 'object') {
      return json({ ok: false, message: 'داده درخواست (payload) ارسال نشده است.' }, 400);
    }

    let result;
    if (kind === 'imagen') {
      result = await handleImagen(ai, payload);
    } else if (kind === 'text' || kind === 'vision') {
      result = await handleText(ai, payload);
    } else if (kind === 'stt') {
      result = await handleStt(ai, payload);
    } else if (kind === 'tts') {
      return json({ ok: false, message: 'قرائت صوتی اکنون مستقیماً در مرورگر انجام می‌شود و به سرور نیازی ندارد.' }, 400);
    } else {
      return json({ ok: false, message: 'نوع درخواست هوش مصنوعی نامعتبر است.' }, 400);
    }

    return json({ ok: true, provider: 'cloudflare', model: result.model, data: result.data });
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در پردازش درخواست هوش مصنوعی.' }, 502);
  }
}