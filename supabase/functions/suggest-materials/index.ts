// Supabase Edge Function: suggest-materials
// Schlägt Lernmaterialien zu einer generierten Unterrichtsstunde vor.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1500;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SuggestMaterialsRequest {
  lessonContent: string;
  lessonTitle: string;
  subject?: string;
  grade?: string;
  schoolType?: string;
}

interface MaterialEntry {
  beschreibung: string;
  suchbegriff: string;
  plattform?: string;
  quelle?: string;
}

interface MaterialsResponse {
  videos?: MaterialEntry[];
  artikel?: MaterialEntry[];
  podcasts?: MaterialEntry[];
  uebungsmaterial?: MaterialEntry[];
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function extractJSON(text: string): MaterialsResponse | null {
  // Versuch 1: Direktes JSON.parse
  try {
    console.log('Versuch 1: Direktes JSON.parse');
    return JSON.parse(text);
  } catch (e) {
    console.log('Versuch 1 fehlgeschlagen:', e instanceof Error ? e.message : String(e));
  }

  // Versuch 2: Markdown-Codeblock-Extraktion (```json ... ``` oder ``` ... ```)
  try {
    console.log('Versuch 2: Markdown-Codeblock-Extraktion');
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (markdownMatch) {
      const extracted = markdownMatch[1].trim();
      console.log('Markdown-Block gefunden, parsen:', extracted.substring(0, 100));
      return JSON.parse(extracted);
    }
    console.log('Kein Markdown-Block gefunden');
  } catch (e) {
    console.log('Versuch 2 fehlgeschlagen:', e instanceof Error ? e.message : String(e));
  }

  // Versuch 3: Substring von erstem { bis letztem }
  try {
    console.log('Versuch 3: Substring von { bis }');
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      console.log('Substring extrahiert, Länge:', jsonString.length);
      return JSON.parse(jsonString);
    }
    console.log('Keine Braces gefunden');
  } catch (e) {
    console.log('Versuch 3 fehlgeschlagen:', e instanceof Error ? e.message : String(e));
  }

  return null;
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
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

  let body: SuggestMaterialsRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Ungültiger JSON-Body.");
  }

  const userPrompt = `Zu dieser Unterrichtsstunde:

Titel: ${body.lessonTitle}
Fach: ${body.subject ?? "unbekannt"}
Jahrgang: ${body.grade ?? "unbekannt"}
Schultyp: ${body.schoolType ?? "unbekannt"}

Stundeninhalt:
${body.lessonContent}

Schlage passende Materialien vor, die Lehrkräfte verwenden oder Schülern mitgeben können.`;

  const systemPrompt = `Du bist ein Bildungsexperte der passendes Lernmaterial für Schüler empfiehlt. Schlage zu der vorliegenden Unterrichtsstunde ergänzendes Material vor, das Schüler selbstständig nutzen können - zum Vertiefen, Nachschlagen oder Weiterlernen.

WICHTIG: 
- Die Vorschläge sind FÜR SCHÜLER, nicht für Lehrkräfte
- Kein didaktisches Material, keine Unterrichtsmethoden, keine Lehrerhandbücher
- Stattdessen: verständliche Erklärvideos, spannende Artikel, interaktive Übungen, anschauliche Podcasts die Schüler selbst konsumieren können
- Sprache und Niveau sollen zur Altersgruppe passen (Jahrgang ${body.grade}, ${body.schoolType})
- Erfinde KEINE konkreten URLs - gib Suchempfehlungen mit konkreten Suchbegriffen

Antworte AUSSCHLIESSLICH mit dem JSON-Objekt ohne Markdown:
{
  "videos": [{ "beschreibung": "...", "suchbegriff": "...", "plattform": "YouTube / funk / ZDFmediathek" }],
  "artikel": [{ "beschreibung": "...", "suchbegriff": "...", "quelle": "z.B. Klexikon, Spektrum, SWR Wissen" }],
  "podcasts": [{ "beschreibung": "...", "suchbegriff": "...", "plattform": "Spotify / ARD Audiothek" }],
  "uebungsmaterial": [{ "beschreibung": "...", "suchbegriff": "...", "quelle": "Khan Academy / Mathebuch.de / etc." }]
}

Pro Kategorie 2-4 Vorschläge.

Beginne mit { und ende mit }.`;

  try {
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
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "");
      return jsonError(
        anthropicRes.status || 502,
        `Anthropic-API-Fehler: ${errText || anthropicRes.statusText}`
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text?.trim() ?? "";

    console.log('RAW MATERIAL RESPONSE:', JSON.stringify(rawText));

    // JSON extrahieren (robust mit Fallbacks)
    const materials = extractJSON(rawText);

    if (!materials) {
      console.error("Fehler beim JSON-Parsing:", rawText);
      return jsonError(502, "Fehler beim Parsen der Material-Vorschläge.");
    }

    return new Response(
      JSON.stringify({
        materials: {
          videos: materials.videos ?? [],
          artikel: materials.artikel ?? [],
          podcasts: materials.podcasts ?? [],
          uebungsmaterial: materials.uebungsmaterial ?? [],
        },
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("suggest-materials error:", err);
    return jsonError(
      500,
      `Interner Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`
    );
  }
});
