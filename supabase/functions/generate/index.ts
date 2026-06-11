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
const MAX_TOKENS = 6000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein erfahrener Bildungsexperte. Du kennst die Forschung von John Hattie (Visible Learning), den Podcast 'Psychologie fürs Klassenzimmer' von Dr. Benedikt Wisniewski, und die Erkenntnisse aus 'Die Bildungsweltmeister' von Alexander Brand über die besten Schulsysteme (Finnland, Estland, Japan, Singapur).

Erstelle eine vollständige, wissenschaftlich fundierte Unterrichtsstunde (45 Minuten).

Die Stunde sollte folgende Struktur haben:
1. LERNZIELE (konkret, messbar) — Alle Schüler verfolgen dasselbe anspruchsvolle Lernziel
2. EINSTIEG & VORWISSEN AKTIVIEREN (5 min)
3. ERARBEITUNG (20 min) – kognitiv aktivierend
4. SICHERUNG & FORMATIVES FEEDBACK (10 min)
5. ÜBUNG & TRANSFER (8 min)
6. ABSCHLUSS & METAKOGNITION (2 min)

KURZFASSUNG PRO PHASE: Jede Phase bekommt ein Feld "kurzfassung" – ein prägnanter Satz (MAX 15 WÖRTER) als Gedächtnisstütze für die Lehrkraft während des Unterrichts. 
Beispiele:
- Einstieg: "Schüler aktivieren Vorwissen durch Impulsfrage an der Tafel."
- Erarbeitung: "Partnerarbeit mit Strukturhilfen; schnellere Schüler vertiefen eigenständig."
- Sicherung: "Think-Pair-Share mit formativem Feedback; Lehrkraft zeigt Visualisierung."
WICHTIG: Max. 15 Wörter, prägnant, konkret!

DIFFERENZIERUNG: Gemeinsames Lernziel, individuelle Wege
- Differenziere NICHT durch reduzierte Lernziele, sondern durch unterschiedliche Wege dorthin
- Für schwächere Schüler: konkrete Stützen (Strukturhilfen, Visualisierungen, Scaffolding)
- Für schnellere Schüler: vertiefende Aufgaben am gleichen Lernziel, höhere kognitive Anforderung
- Optional: Peer-Tutoring als Lerncoach

WISSENSCHAFT: Begründe mit Hattie-Effekten und Forschung (Brand: hohe Erwartungen; Hattie: teacher expectations d=0,42)

REALITÄTS-CHECK (zwingend vor Ausgabe):
ZEIT:
- 45 Min = 35-38 Min Netto-Lernzeit
- Jeder Phasenwechsel: 2-4 Min (Transition, Material, Ruhe)
- 20% Puffer (30% für Förderschule)
- Zeitplanung explizit: Netto + Puffer + Transitions

KOGNITION:
- Können Schüler der Jahrgangsstufe/Schulart die Aufgaben selbstständig lösen?
- Arbeitsanweisungen max. 1-2 Sätze
- Förderschule: konkret, handlungsorientiert, 1 Schritt
- Grundschule 1-2: kein Abstraktes, nur Material zum Anfassen

HERAUSFORDERUNGEN:
- Plan wie schwächere Schüler eingebunden werden (nicht bremsen)
- Konkreter Plan B wenn Schüler aussteigt

TRANSITIONS:
- Alle Übergänge geplant + zeitlich
- Klare Signale für Phasenwechsel
- Material vorbereitet
- Max. 4 Phasenwechsel

SELBSTPRÜFUNG:
1. Zeitplanung realistisch inkl. Transitions?
2. Können ALLE Schüler etwas Sinnvolles tun?
3. Funktioniert auch wenn 20% mehr Zeit vergeht?

Wenn NEIN: Überarbeite die Stunde.

---

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in folgendem Format.
Kein Markdown, keine Codeblöcke, kein Text davor oder danach.
Beginne mit { und ende mit }.

{
  "titel": "Kurzer prägnanter Stundentitel",
  "fach": "string",
  "jahrgang": "string",
  "schultyp": "string",
  "dauer_minuten": 45,
  "lernziele": ["string", "string"],
  "phasen": [
    {
      "nummer": 1,
      "titel": "Phasentitel",
      "dauer_minuten": 5,
      "kurzfassung": "Prägnanter Satz max. 15 Wörter als Gedächtnisstütze",
      "inhalt": "Was in dieser Phase passiert",
      "lehreraktion": "Was die Lehrkraft konkret tut",
      "schueleraktion": "Was die Schüler konkret tun",
      "material": ["Material 1", "Material 2"],
      "transition": "Wie zur nächsten Phase gewechselt wird"
    }
  ],
  "differenzierung": {
    "foerderung": "Konkrete Maßnahmen für schwächere Schüler",
    "erweiterung": "Konkrete Maßnahmen für schnellere Schüler"
  },
  "wissenschaft": "Welche Hattie-Effekte und Forschung stecken dahinter"
}`;

interface GenerateRequest {
  className?: string;
  subject?: string;
  grade?: string;
  state?: string;
  school_type?: string;
  studentNames?: string[];
  studentNotes?: Record<string, string>;
  topic?: string;
  // previousLessons darf Array (Titel-Liste) oder String sein
  previousLessons?: string[] | string;
  curriculumUnitTitle?: string;
  curriculumUnitDescription?: string;
  // Refinement: wenn beide gesetzt → Multi-Turn Konversation
  previousContent?: string;
  refinementRequest?: string;
  // Vorschlag-Modus: nur Titel generieren
  suggestionOnly?: boolean;
  slotIndex?: number;
  estimatedHours?: number;
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

function parseJSON(text: string): unknown {
  // Versuch 1: Direktes JSON.parse
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log('Versuch 1 fehlgeschlagen');
  }

  // Versuch 2: Markdown-Codeblock-Extraktion (```json ... ``` oder ``` ... ```)
  try {
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (markdownMatch) {
      const extracted = markdownMatch[1].trim();
      return JSON.parse(extracted);
    }
  } catch (e) {
    console.log('Versuch 2 fehlgeschlagen');
  }

  // Versuch 3: Objekt-Extraktion von { bis }
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonString);
    }
  } catch (e) {
    console.log('Versuch 3 fehlgeschlagen');
  }

  return null;
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

  const schoolType = (body.school_type ?? "").trim();

  const lines = [
    `Klasse: ${className}, ${subject}, ${state} (Lehrplan beachten)`,
    `Jahrgang: ${grade}`,
    ...(schoolType
      ? [
          `Schultyp: ${schoolType}. Passe Niveau, Methodik und Sprache entsprechend an.`,
        ]
      : []),
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

  const isSuggestionOnly = body.suggestionOnly === true;

  // Modus 1: Nur Vorschläge generieren
  if (isSuggestionOnly) {
    const previousLessonsText = Array.isArray(body.previousLessons)
      ? body.previousLessons.join(", ")
      : body.previousLessons ?? "noch keine";

    const suggestionPrompt = `Schlage MINDESTENS DREI verschiedene prägnante Titel für Stunde ${(body.slotIndex ?? 0) + 1} von ${body.estimatedHours ?? 1} der Einheit '${body.curriculumUnitTitle ?? ""}' vor.

WICHTIG: Du MUSST exakt 3 Titel ausgeben, einen pro Zeile.

Jeder Titel max. 60 Zeichen.

Keine Nummerierung, keine Erklärung, keine leeren Zeilen.

Bereits behandelt: ${previousLessonsText}

Beispiel-Format:

Einführung in lineare Gleichungen

Lösen von Gleichungen mit einer Unbekannten

Anwendungsaufgaben zu linearen Gleichungen`;

    const suggestionRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        stream: false,
        system: "Du bist ein Experte für Lehrplan-Struktur. Generiere prägnante, fokussierte Stundentitel für Lehrer.",
        messages: [{ role: "user", content: suggestionPrompt }],
      }),
    });

    if (!suggestionRes.ok) {
      const errText = await suggestionRes.text().catch(() => "");
      return jsonError(
        suggestionRes.status || 502,
        `Anthropic-API-Fehler: ${errText || suggestionRes.statusText}`
      );
    }

    const suggestionData = await suggestionRes.json();
    const rawText = suggestionData.content?.[0]?.text?.trim() ?? "";
    
    console.log('RAW SUGGESTION TEXT:', JSON.stringify(rawText));
    console.log('SUGGESTION DATA:', JSON.stringify(suggestionData, null, 2));
    
    // Splitte nach Zeilenumbruch und filtere leere Zeilen
    const suggestions = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 3); // Maximal 3 Vorschläge

    console.log('PARSED SUGGESTIONS:', JSON.stringify(suggestions));

    return new Response(
      JSON.stringify({ 
        suggestions,
        debug: {
          rawText: rawText,
          splitLines: rawText.split("\n"),
          trimmedLines: rawText.split("\n").map((l) => l.trim()),
          filteredLines: rawText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
        }
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }

  // Modus 2: Vollständige Stunde generieren (Streaming)
  const userPrompt = buildUserPrompt(body);
  const isRefinement =
    typeof body.previousContent === "string" &&
    body.previousContent.trim().length > 0 &&
    typeof body.refinementRequest === "string" &&
    body.refinementRequest.trim().length > 0;

  const messages = isRefinement
    ? [
        { role: "user", content: userPrompt },
        { role: "assistant", content: body.previousContent!.trim() },
        { role: "user", content: body.refinementRequest!.trim() },
      ]
    : [{ role: "user", content: userPrompt }];

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
      messages,
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
