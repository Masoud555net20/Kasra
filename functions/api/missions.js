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
        SELECT * FROM missions ORDER BY mission_date DESC, row_no DESC
      `).all();
      return json({ ok: true, items: results });
    }

    if (request.method === 'POST') {
      const body = await parseJsonBody(request);
      const item = body.mission || body;
      const id = String(item.id || crypto.randomUUID());
      let userId = String(item.userId || item.user_id || '').trim();
      let username = String(item.username || '').trim();
      let rowNo = Number(item.rowNo ?? item.row_no ?? 0);
      const missionDate = String(item.date || item.mission_date || '').trim();
      const dayName = String(item.day || '').trim();
      let projectId = String(item.projectId || item.project_id || '').trim();
      const projectTitle = String(item.projectTitle || item.project_title || '').trim();
      const location = String(item.location ?? item.defaultAddress ?? '').trim();
      const address = String(item.address || '').trim();
      const startTime = String(item.startTime || item.start_time || '').trim();
      const endTime = String(item.endTime || item.end_time || '').trim();
      const outboundVehicle = String(item.outboundVehicle || item.outbound_vehicle || '').trim();
      const outboundCost = Number(item.outboundCost ?? item.outbound_cost ?? 0);
      const inboundVehicle = String(item.inboundVehicle || item.inbound_vehicle || '').trim();
      const inboundCost = Number(item.inboundCost ?? item.inbound_cost ?? 0);
      const totalCost = Number(item.totalCost ?? item.total_cost ?? (outboundCost + inboundCost));
      const outboundReceipt = String(item.outboundReceipt ?? item.outbound_receipt ?? '').trim();
      const inboundReceipt = String(item.inboundReceipt ?? item.inbound_receipt ?? '').trim();
      const notes = String(item.notes || '').trim();
      const status = String(item.status || 'ثبت شده').trim();
      const now = new Date().toISOString();

      if (!missionDate) {
        return json({ ok: false, message: 'تاریخ مأموریت الزامی است.' }, 400);
      }

      if (!rowNo) {
        try {
          const cntRow = await db.prepare('SELECT COUNT(*) AS n FROM missions').first();
          rowNo = Number(cntRow?.n || 0) + 1;
        } catch {
          rowNo = 1;
        }
      }

      const needsReceipt = (v) => v.includes('اسنپ') || v.includes('آژانس');
      if (needsReceipt(outboundVehicle) && !outboundReceipt) {
        return json({ ok: false, message: `برای وسیله «${outboundVehicle}» پیوست تصویر رسید رفت الزامی است.` }, 400);
      }
      if (needsReceipt(inboundVehicle) && !inboundReceipt) {
        return json({ ok: false, message: `برای وسیله «${inboundVehicle}» پیوست تصویر رسید برگشت الزامی است.` }, 400);
      }

      const existingUser = userId ? await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first() : null;
      if (!existingUser && username) {
        const fullName = String(item.fullName || item.full_name || username).trim() || username;
        const safeUserId = userId || crypto.randomUUID();
        userId = safeUserId;
        await db.prepare(`
          INSERT OR IGNORE INTO users (id, username, password, full_name, role, signature, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(safeUserId, username, String(item.password || '123456'), fullName, String(item.role || 'کارشناس'), item.signature || null, 1, now, now).run();
      } else if (!existingUser && !username && userId) {
        return json({ ok: false, message: 'برای ثبت مأموریت، نام کاربر باید وجود داشته باشد.' }, 400);
      }

      const existingProject = projectId ? await db.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() : null;
      if (!existingProject) {
        const projectName = projectTitle || String(item.title || 'پروژه ناشناس').trim();
        const projectAddress = String(item.projectAddress || '').trim();
        const safeProjectId = projectId || crypto.randomUUID();
        projectId = safeProjectId;
        await db.prepare(`
          INSERT OR IGNORE INTO projects (id, title, address, status, description, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(safeProjectId, projectName, projectAddress, String(item.projectStatus || 'فعال'), String(item.description || '').trim(), userId || null, now, now).run();
      }

      if (!userId) {
        return json({ ok: false, message: 'کاربر ثبت مأموریت الزامی است.' }, 400);
      }

      if (!projectId) {
        return json({ ok: false, message: 'پروژه ثبت مأموریت الزامی است.' }, 400);
      }

      await db.prepare(`
        INSERT INTO missions (
          id, user_id, username, row_no, mission_date, day_name, project_id, project_title,
          location, address, start_time, end_time, outbound_vehicle, outbound_cost,
          inbound_vehicle, inbound_cost, total_cost, outbound_receipt, inbound_receipt,
          notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          username = excluded.username,
          row_no = excluded.row_no,
          mission_date = excluded.mission_date,
          day_name = excluded.day_name,
          project_id = excluded.project_id,
          project_title = excluded.project_title,
          location = excluded.location,
          address = excluded.address,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          outbound_vehicle = excluded.outbound_vehicle,
          outbound_cost = excluded.outbound_cost,
          inbound_vehicle = excluded.inbound_vehicle,
          inbound_cost = excluded.inbound_cost,
          total_cost = excluded.total_cost,
          outbound_receipt = excluded.outbound_receipt,
          inbound_receipt = excluded.inbound_receipt,
          notes = excluded.notes,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).bind(
        id, userId, username || 'unknown-user', rowNo, missionDate, dayName, projectId, projectTitle,
        location, address, startTime, endTime, outboundVehicle, outboundCost,
        inboundVehicle, inboundCost, totalCost, outboundReceipt, inboundReceipt,
        notes, status, now, now
      ).run();

      const row = await db.prepare('SELECT * FROM missions WHERE id = ?').bind(id).first();
      return json({ ok: true, mission: row });
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ ok: false, message: 'شناسه مأموریت الزامی است.' }, 400);
      }

      await db.prepare('DELETE FROM missions WHERE id = ?').bind(id).run();
      return json({ ok: true, deletedId: id });
    }

    return json({ ok: false, message: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ ok: false, message: error.message || 'خطا در ثبت مأموریت.' }, 500);
  }
}
