// Supabase Edge Function: generate-curriculum
// Erzeugt einen Jahres-Lehrplan via Anthropic Claude und schreibt die Einheiten
// in die Tabelle `curriculum_units`.
//
// Lokales Testen:
//   supabase functions serve generate-curriculum
//   curl -i -X POST 'http://127.0.0.1:54321/functions/v1/generate-curriculum' \
//     -H 'Content-Type: application/json' \
//     -H 'apikey: <anon-key>' \
//     -H 'Authorization: Bearer <user-jwt>' \
//     -d '{"classId":"<uuid>","subject":"Mathematik","grade":"8","state":"Bayern"}'

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein erfahrener Lehrplan-Experte und kennst den LehrplanPLUS Bayern sowie die KMK-Bildungsstandards. Erstelle einen vollständigen Jahres-Lehrplan für die angegebene Klasse.

Deine Antwort MUSS ein JSON-Array sein und NICHTS ANDERES. Kein einleitender Text, kein abschließender Text, keine Markdown-Codeblöcke (keine Backticks), kein Objekt drum herum.

Das Array hat exakt dieses Format:
[
  {
    "title": "Kurzer Themenname",
    "description": "1-2 Sätze zu den Inhalten",
    "estimated_hours": 6,
    "start_month": 1,
    "end_month": 2
  }
]

Felder:
- title: kurzer Themenname (z.B. "Quadratische Funktionen")
- description: 1-2 Sätze Beschreibung der Inhalte
- estimated_hours: ganze Zahl zwischen 4 und 12
- start_month: Schulmonat als Zahl: 1=September, 2=Oktober, 3=November, 4=Dezember, 5=Januar, 6=Februar, 7=März, 8=April, 9=Mai, 10=Juli
- end_month: Schulmonat als Zahl (wie start_month)

6-10 Einheiten, chronologisch, gesamtes Schuljahr abdeckend.
Halte dich an die Lehrplanvorgaben für das genannte Bundesland und den Schultyp.

ANTWORTE NUR MIT DEM JSON-ARRAY. BEGINNE MIT [ UND ENDE MIT ].`;

interface GenerateCurriculumRequest {
  classId?: string;
  subject?: string;
  subjects?: string[];
  school_type?: string;
  grade?: string;
  state?: string;
}

interface CurriculumUnit {
  title: string;
  description: string;
  estimated_hours: number;
  start_month: number;
  end_month: number;
}

function buildUserPrompt(body: GenerateCurriculumRequest): string {
  const schoolType = body.school_type ?? "";
  const subjects = body.subjects?.length
    ? body.subjects
    : body.subject
    ? [body.subject]
    : [];

  const lines = [
    `Bitte erstelle einen vollständigen Jahres-Lehrplan für folgende Klasse:`,
    `- Jahrgangsstufe: ${body.grade}`,
    `- Bundesland: ${body.state}`,
  ];

  if (schoolType) {
    lines.push(`- Schultyp: ${schoolType}`);
    lines.push(
      `  Beachte die spezifischen Lehrplanvorgaben für diesen Schultyp in Bayern.`
    );
    lines.push(`  Erstelle den Lehrplan passend für ${schoolType}-Niveau.`);
  }

  if (subjects.length > 0) {
    lines.push(`- Fächer dieser Klasse: ${subjects.join(", ")}`);
  }

  lines.push(
    ``,
    `Berücksichtige die offiziellen Lehrplanvorgaben des Bundeslandes. Gib die Einheiten in chronologisch sinnvoller Reihenfolge zurück, sodass sie das gesamte Schuljahr (September bis Juli) abdecken.`
  );

  return lines.join("\n");
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return jsonResponse(status, { error: message });
}

/**
 * Extrahiert ein JSON-Array aus der Claude-Antwort.
 * Drei Versuche in absteigender Präzision.
 */
function extractJsonArray(raw: string): unknown {
  const text = raw.trim();

  // Hilfsfunktion: wenn das Ergebnis ein Objekt statt Array ist,
  // nach dem ersten Array-Wert darin suchen
  function unwrapIfNeeded(val: unknown): unknown {
    if (Array.isArray(val)) return val;
    if (val && typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length > 0) return v;
      }
    }
    return val;
  }

  // 1) Direkter Parse
  try { return unwrapIfNeeded(JSON.parse(text)); } catch { /* weiter */ }

  // 2) Markdown-Codeblock (```json … ``` oder ``` … ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return unwrapIfNeeded(JSON.parse(fence[1].trim())); } catch { /* weiter */ }
  }

  // 3) Erstes '[' bis letztes ']'
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try { return unwrapIfNeeded(JSON.parse(text.slice(start, end + 1))); } catch { /* weiter */ }
  }

  throw new Error("Konnte JSON-Array nicht extrahieren. Antwort: " + text.slice(0, 300));
}

function validateUnits(arr: unknown): CurriculumUnit[] {
  if (!Array.isArray(arr)) {
    throw new Error("Anthropic-Antwort ist kein JSON-Array.");
  }
  const units: CurriculumUnit[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const description =
      typeof o.description === "string" ? o.description.trim() : "";
    const estimated_hours = Number(o.estimated_hours);
    const start_month = Number(o.start_month);
    const end_month = Number(o.end_month);

    if (!title) continue;
    if (
      !Number.isFinite(estimated_hours) ||
      !Number.isFinite(start_month) ||
      !Number.isFinite(end_month)
    ) {
      continue;
    }

    units.push({
      title,
      description,
      estimated_hours,
      start_month,
      end_month,
    });
  }
  if (units.length === 0) {
    throw new Error("Anthropic lieferte keine gültigen Einheiten.");
  }
  return units;
}

Deno.serve(async (req: Request) => {
  // CORS Preflight – muss vor jeder anderen Logik laufen
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed. Use POST.");
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonError(500, "ANTHROPIC_API_KEY ist nicht gesetzt.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return jsonError(500, "Supabase-Umgebungsvariablen fehlen.");
  }

  // Auth-Header durchreichen, damit RLS greift
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonError(401, "Authorization-Header fehlt.");
  }

  let body: GenerateCurriculumRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Ungültiger JSON-Body.");
  }

  const { classId, subject, subjects, school_type, grade, state } = body;
  if (!classId || !grade || !state) {
    return jsonError(400, "classId, grade und state sind erforderlich.");
  }

  // Anthropic aufrufen (kein Streaming – wir wollen das vollständige JSON)
  const userPrompt = buildUserPrompt({ classId, subject, subjects, school_type, grade, state });

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: false,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return jsonError(
      anthropicRes.status || 502,
      `Anthropic-API-Fehler: ${errText || anthropicRes.statusText}`,
    );
  }

  let anthropicJson: {
    content?: Array<{ type: string; text?: string }>;
  };
  try {
    anthropicJson = await anthropicRes.json();
  } catch {
    return jsonError(502, "Anthropic-Antwort konnte nicht geparst werden.");
  }

  const rawText =
    (anthropicJson.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n")
      .trim();

  if (!rawText) {
    return jsonError(502, "Anthropic lieferte keinen Text-Content.");
  }

  let units: CurriculumUnit[];
  try {
    const parsed = extractJsonArray(rawText);
    units = validateUnits(parsed);
  } catch (err) {
    return jsonError(
      502,
      `Parsing der Anthropic-Antwort fehlgeschlagen: ${(err as Error).message}`,
    );
  }

  // In curriculum_units einfügen (mit User-Token → RLS greift)
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Welches Fach soll in den Units gespeichert werden?
  // Wenn ein einzelnes Fach übergeben wurde, dieses; sonst null.
  const subjectForUnits = subjects?.length === 1
    ? subjects[0]
    : (subject ?? null);

  const rows = units.map((u, idx) => ({
    class_id: classId,
    position: idx + 1,
    title: u.title,
    description: u.description,
    estimated_hours: u.estimated_hours,
    start_month: u.start_month,
    end_month: u.end_month,
    subject: subjectForUnits,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("curriculum_units")
    .insert(rows)
    .select();

  if (insertErr) {
    return jsonError(
      500,
      `Einfügen in curriculum_units fehlgeschlagen: ${insertErr.message}`,
    );
  }

  return jsonResponse(200, { units: inserted ?? [] });
});
