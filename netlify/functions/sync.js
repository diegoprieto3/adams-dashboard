// Lcdo. Francisco Adams Quesada — copies Vapi calls into the Supabase archive.
// Run once after deploy, then daily via cron-job.org:
//   https://YOUR-SITE.netlify.app/.netlify/functions/sync
const ASSISTANT_ID = '24969b57-4fae-49ae-bc02-72c97a6f8573';
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
function sbHeaders(prefer) {
  const h = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  if (SUPABASE_KEY && !String(SUPABASE_KEY).startsWith('sb_secret_')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}
const INTAKE_ID = '7095b51b-ae6c-46f4-912c-b274ec260835'; // "Francisco Adams Intake" structured output

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function getIntake(c) {
  const so = c.artifact?.structuredOutputs;
  if (!so || typeof so !== 'object') return {};
  if (so[INTAKE_ID]?.result) return so[INTAKE_ID].result;
  const byName = Object.values(so).find(o => o && o.name === 'Francisco Adams Intake' && o.result);
  return byName ? byName.result : {};
}
function duration(c) {
  if (c.startedAt && c.endedAt) {
    const d = (new Date(c.endedAt) - new Date(c.startedAt)) / 1000;
    return d > 0 ? Math.round(d) : 0;
  }
  return 0;
}

exports.handler = async function () {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'supabase not configured' }) };
  try {
    const r = await fetch(`https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=1000`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    if (!r.ok) return json(r.status, { error: 'Vapi ' + r.status });
    const data = await r.json();
    const calls = Array.isArray(data) ? data : (data.results || data.calls || []);

    const rows = calls
      .filter(c => c.startedAt && c.status === 'ended')
      .map(c => {
        const intake = getIntake(c);
        return {
          id: c.id,
          assistant_id: ASSISTANT_ID,
          caller_number: c.customer?.number || null,
          caller_name: intake.nombre_cliente || null,
          duration: duration(c),
          started_at: c.startedAt,
          ended_at: c.endedAt || null,
          recording_url: c.artifact?.recordingUrl || c.recordingUrl || null,
          summary: c.analysis?.summary || null,
          call_reason: intake.motivo || null,
          transcript: c.artifact?.transcript || null,
          end_reason: c.endedReason || null
        };
      });

    if (!rows.length) return json(200, { synced: 0 });

    const up = await fetch(`${SUPABASE_URL}/rest/v1/calls?on_conflict=id`, {
      method: 'POST',
      headers: sbHeaders('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(rows)
    });
    if (!up.ok) return json(up.status, { error: 'Supabase ' + up.status + ': ' + (await up.text()) });
    return json(200, { synced: rows.length });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
const {withAuth} = require('./_auth');
exports.handler = withAuth(exports.handler);
