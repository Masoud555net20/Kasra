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
      const userId = String(item.userId || item.user_id || '');
      const username = String(item.username || '').trim();
      const rowNo = Number(item.rowNo ?? item.row_no ?? 0);
      const missionDate = String(item.date || item.mission_date || '').trim();
      const dayName = String(item.day || '').trim();
      const projectId = String(item.projectId || item.project_id || '');
      const projectTitle = String(item.projectTitle || item.project_title || '').trim();
      const location = String(item.location || '').trim();
      const address = String(item.address || '').trim();
      const startTime = String(item.startTime || item.start_time || '').trim();
      const endTime = String(item.endTime || item.end_time || '').trim();
      const outboundVehicle = String(item.outboundVehicle || item.outbound_vehicle || '').trim();
      const outboundCost = Number(item.outboundCost ?? item.outbound_cost ?? 0);
      const inboundVehicle = String(item.inboundVehicle || item.inbound_vehicle || '').trim();
      const inboundCost = Number(item.inboundCost ?? item.inbound_cost ?? 0);
      const totalCost = Number(item.totalCost ?? item.total_cost ?? (outboundCost + inboundCost));
      const notes = String(item.notes || '').trim();
      const status = String(item.status || 'ثبت شده').trim();
      const now = new Date().toISOString();

      if (!missionDate || !userId) {
        return json({ ok: false, message: 'تاریخ و کاربر ثبت مأموریت الزامی هستند.' }, 400);
      }

      await db.prepare(`
        INSERT INTO missions (
          id, user_id, username, row_no, mission_date, day_name, project_id, project_title,
          location, address, start_time, end_time, outbound_vehicle, outbound_cost,
          inbound_vehicle, inbound_cost, total_cost, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          notes = excluded.notes,
          status = excluded.status,
          updated_at = excluded.updated_at
      `).bind(
        id, userId, username, rowNo, missionDate, dayName, projectId, projectTitle,
        location, address, startTime, endTime, outboundVehicle, outboundCost,
        inboundVehicle, inboundCost, totalCost, notes, status, now, now
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
