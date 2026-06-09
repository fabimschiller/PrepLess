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

const SYSTEM_PROMPT = `Du bist ein erfahrener Lehrplan-Experte und kennst den LehrplanPLUS Bayern sowie die KMK-Bildungsstandards. Erstelle einen vollständigen Jahres-Lehrplan für die angegebene Klasse und das angegebene Fach.

Antworte ausschließlich mit einem JSON-Array. Jede Einheit hat die Felder:
- title: kurzer Themenname (z.B. 'Quadratische Funktionen')
- description: 1-2 Sätze Beschreibung der Inhalte
- estimated_hours: realistische Stundenanzahl (4-12)
- start_month: Schulmonat von 1 (September) bis 10 (Juli)
- end_month: Schulmonat von 1 bis 10

Der Lehrplan soll 6-10 Einheiten umfassen, chronologisch sinnvoll geordnet (position 1-N), und das gesamte Schuljahr abdecken. Halte dich an die offiziellen Lehrplanvorgaben für das genannte Bundesland.

WICHTIG: Antworte NUR mit dem JSON-Array, ohne Markdown-Codeblöcke, ohne Erklärungstext davor oder danach.`;

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
 * Extrahiert ein JSON-Array aus der Claude-Antwort. Der Prompt verlangt reinen
 * JSON-Output, aber wir bauen einen kleinen Fallback ein, falls das Modell
 * Markdown oder zusätzlichen Text mitschickt.
 */
function extractJsonArray(raw: string): unknown {
  const trimmed = raw.trim();

  // 1) Direkter Parse
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // weiter unten
  }

  // 2) Markdown-Codeblock entfernen
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch (_) {
      // weiter unten
    }
  }

  // 3) Erstes "[" bis letztes "]"
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    return JSON.parse(slice);
  }

  throw new Error("Konnte JSON-Array aus Anthropic-Antwort nicht extrahieren.");
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

  const { classId, grade, state } = body;
  if (!classId || !grade || !state) {
    return jsonError(400, "classId, grade und state sind erforderlich.");
  }

  // Anthropic aufrufen (kein Streaming – wir wollen das vollständige JSON)
  const userPrompt = buildUserPrompt({ classId, subject, grade, state });

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

  const rows = units.map((u, idx) => ({
    class_id: classId,
    position: idx + 1,
    title: u.title,
    description: u.description,
    estimated_hours: u.estimated_hours,
    start_month: u.start_month,
    end_month: u.end_month,
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
