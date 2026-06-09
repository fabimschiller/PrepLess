// Supabase Edge Function: generate
// Erstellt eine vollständige Unterrichtsstunde via Anthropic Claude (Streaming).
//
// Lokales Testen:
//   supabase functions serve generate --no-verify-jwt
//   curl -N -X POST 'http://127.0.0.1:54321/functions/v1/generate' \
//     -H 'Content-Type: application/json' \
//     -H 'apikey: <anon-key>' \
//     -d '{"className":"8b","subject":"Mathe","grade":"8","state":"Bayern","studentNames":["Anna","Ben"],"studentNotes":{"Anna":"sehr stark","Ben":"braucht Ruhe"},"topic":"Lineare Funktionen"}'

import "@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2500;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein erfahrener Bildungsexperte. Du kennst die Forschung von John Hattie (Visible Learning), den Podcast 'Psychologie fürs Klassenzimmer' von Dr. Benedikt Wisniewski, und die Erkenntnisse aus 'Die Bildungsweltmeister' von Alexander Brand über die besten Schulsysteme (Finnland, Estland, Japan, Singapur).

Erstelle eine vollständige, wissenschaftlich fundierte Unterrichtsstunde (45 Minuten). Struktur:
1. LERNZIELE (konkret, messbar)
2. EINSTIEG & VORWISSEN AKTIVIEREN (5 min)
3. ERARBEITUNG (20 min) – kognitiv aktivierend
4. SICHERUNG & FORMATIVES FEEDBACK (10 min)
5. ÜBUNG & TRANSFER (8 min)
6. ABSCHLUSS & METAKOGNITION (2 min)
7. DIFFERENZIERUNG – konkret pro Schüler mit besonderen Bedürfnissen
8. WISSENSCHAFTLICHE BEGRÜNDUNG – welche Hattie-Effekte stecken dahinter

Praxisnah, direkt umsetzbar, keine Floskeln. Markiere jede Sektion mit einem klaren Header in Großbuchstaben.`;

interface GenerateRequest {
  className?: string;
  subject?: string;
  grade?: string;
  state?: string;
  studentNames?: string[];
  studentNotes?: Record<string, string>;
  topic?: string;
  // previousLessons darf Array (Titel-Liste) oder String sein
  previousLessons?: string[] | string;
  curriculumUnitTitle?: string;
  curriculumUnitDescription?: string;
}

function formatPreviousLessons(input: GenerateRequest["previousLessons"]): string {
  if (Array.isArray(input)) {
    const titles = input
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    if (titles.length === 0) return "noch keine";
    return `Bereits behandelt: ${titles.join(", ")}`;
  }
  if (typeof input === "string" && input.trim().length > 0) {
    return input.trim();
  }
  return "noch keine";
}

function buildUserPrompt(body: GenerateRequest): string {
  const className = body.className ?? "";
  const subject = body.subject ?? "";
  const grade = body.grade ?? "";
  const state = body.state ?? "";
  const topic = body.topic ?? "";
  const previousLessons = formatPreviousLessons(body.previousLessons);
  const unitTitle = (body.curriculumUnitTitle ?? "").trim();
  const unitDesc = (body.curriculumUnitDescription ?? "").trim();

  const studentNames = Array.isArray(body.studentNames)
    ? body.studentNames
    : [];
  const studentNotes = body.studentNotes ?? {};

  const notesLines = Object.entries(studentNotes)
    .filter(([, notiz]) => typeof notiz === "string" && notiz.trim().length > 0)
    .map(([name, notiz]) => `${name}: ${notiz}`)
    .join("\n");

  const lines = [
    `Klasse: ${className}, ${subject}, ${state} (Lehrplan beachten)`,
    `Jahrgang: ${grade}`,
    `Thema: ${topic}`,
  ];

  if (unitTitle) {
    lines.push(`Aktuelle Lehrplan-Einheit: ${unitTitle}`);
    if (unitDesc) {
      lines.push(`Inhalte der Einheit: ${unitDesc}`);
    }
  }

  lines.push(
    `Vorherige Stunden: ${previousLessons}`,
    `Schüler in der Klasse: ${studentNames.join(", ")}`,
    `Bekannte Besonderheiten:`,
    notesLines.length > 0 ? notesLines : "(keine)",
    `Klassengröße: ${studentNames.length}`,
  );

  return lines.join("\n");
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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

  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Ungültiger JSON-Body.");
  }

  const userPrompt = buildUserPrompt(body);

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
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text().catch(() => "");
    return jsonError(
      anthropicRes.status || 502,
      `Anthropic-API-Fehler: ${errText || anthropicRes.statusText}`,
    );
  }

  // SSE-Stream von Anthropic 1:1 an den Client durchreichen.
  return new Response(anthropicRes.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
