// VECINDARIO · Misterio diario · validación del resultado oficial.
//
// El navegador manda sólo { date, version, log }: qué casas interrogó, si pidió
// ayuda y a quién acusó, en orden. Este servidor regenera el caso con el mismo
// núcleo que el juego (`_shared/vecindario-core.mjs`, generado por build.cjs),
// reproduce el registro y calcula puntaje, vidas y calificación. Nunca usa un
// número enviado por el cliente. La clave primaria impide un segundo resultado
// oficial del mismo día.
//
// Despliegue:  supabase functions deploy daily-submit
// Variables:   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (las inyecta Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  dailyDateKey, shiftDateKey, isDateKey, dailyVersionFor, generateDailyLevel, replayDaily, msUntilNextDaily,
} from '../_shared/vecindario-core.mjs';

// Una partida empezada antes de la medianoche se puede cerrar hasta 30 minutos después.
const GRACE_MS = 30 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return reply(401, { error: 'unauthorized' });

  let body: { date?: unknown; version?: unknown; log?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: 'json' }); }
  const { date, version, log } = body;
  if (typeof date !== 'string' || !isDateKey(date) || typeof version !== 'number' || !Array.isArray(log)) return reply(400, { error: 'payload' });

  // Sólo cuenta el día en curso en Buenos Aires (con una breve gracia tras medianoche).
  const now = new Date();
  const today = dailyDateKey(now);
  const sinceMidnight = 86400000 - msUntilNextDaily(now);
  const open = date === today || (date === shiftDateKey(today, -1) && sinceMidnight < GRACE_MS);
  if (!open) return reply(422, { error: 'date_closed' });

  const entry = dailyVersionFor(date);
  if (!entry || entry.version !== version) return reply(422, { error: 'version' });

  // Sólo se aceptan eventos con la forma exacta que produce el juego.
  const clean = [];
  for (const ev of log) {
    if (!ev || typeof ev !== 'object') return reply(400, { error: 'event' });
    if (ev.t === 'hint') clean.push({ t: 'hint' });
    else if ((ev.t === 'ask' || ev.t === 'accuse') && typeof ev.id === 'string') clean.push({ t: ev.t, id: ev.id });
    else return reply(400, { error: 'event' });
  }

  const { level } = generateDailyLevel(date, version);
  const result = replayDaily(level, clean);
  if (!result.valid) return reply(422, { error: `log_${result.reason}` });
  if (!result.finished) return reply(422, { error: 'unfinished' });

  const { error } = await admin.from('daily_results').insert({
    user_id: auth.user.id,
    date_key: date,
    version,
    points: result.points,
    grade: result.grade,
    won: result.won,
    deduced: result.deduced,
    questions: result.questions,
    minimum: result.minimum,
    lives: result.lives,
    wrong_accusations: result.wrongAccusations,
    hint_used: result.hintUsed,
    log: clean,
  });
  if (error?.code === '23505') return reply(409, { error: 'already_submitted' });
  if (error) return reply(500, { error: 'storage' });

  return reply(200, { points: result.points, grade: result.grade, questions: result.questions, minimum: result.minimum });
});
