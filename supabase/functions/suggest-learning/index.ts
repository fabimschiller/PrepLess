// Supabase Edge Function: suggest-learning
// Schlägt Fortbildungsressourcen für Lehrkräfte vor

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SuggestLearningRequest {
  lessonContent: string;
  lessonTitle: string;
  subject?: string;
  grade?: string;
  schoolType?: string;
}

interface LearningResource {
  title: string;
  beschreibung: string;
  typ: 'video' | 'artikel' | 'podcast';
  suchbegriff: string;
  plattform: string;
  minuten: number;
  xp?: number;
}

interface LearningResponse {
  resources: LearningResource[];
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function calculateXP(minuten: number): number {
  if (minuten <= 7) return 10;
  if (minuten <= 15) return 20;
  return 40;
}

function extractJSON(text: string): LearningResponse | null {
  // Versuch 1: Direktes JSON.parse
  try {
    console.log('Versuch 1: Direktes JSON.parse');
    return JSON.parse(text);
  } catch (e) {
    console.log('Versuch 1 fehlgeschlagen:', e instanceof Error ? e.message : String(e));
  }

  // Versuch 2: Markdown-Codeblock-Extraktion
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

  // Versuch 3: Objekt-Extraktion von { bis }
  try {
    console.log('Versuch 3: Objekt-Extraktion');
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const jsonString = text.substring(firstBrace, lastBrace + 1);
      console.log('Objekt extrahiert, Länge:', jsonString.length);
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS, status: 200 });
  }

  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed. Use POST.');
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return jsonError(500, 'ANTHROPIC_API_KEY ist nicht gesetzt.');
  }

  let body: SuggestLearningRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Ungültiger JSON-Body.');
  }

  const userPrompt = `Unterrichtsstunde: ${body.lessonTitle}
Fach: ${body.subject ?? 'unbekannt'}, Jahrgang: ${body.grade ?? 'unbekannt'}, Schultyp: ${body.schoolType ?? 'unbekannt'}

Inhalt der Stunde (Zusammenfassung):
${body.lessonContent.slice(0, 1000)}

Schlage passende Fortbildungsressourcen für die Lehrkraft vor.`;

  const systemPrompt = `Du bist ein Experte für Lehrerfortbildung und Bildungswissenschaft. Schlage zu der vorliegenden Unterrichtsstunde Lernressourcen vor, mit denen die Lehrkraft die pädagogischen und didaktischen Prinzipien dieser Stunde vertiefen kann.

Die Ressourcen sind FÜR LEHRKRÄFTE zur professionellen Weiterentwicklung. Erkläre kurz welches pädagogische Prinzip dahinter steckt. Gib für jede Ressource eine realistische Zeitschätzung in Minuten an.

Erfinde KEINE konkreten URLs. Gib Suchempfehlungen.

Antworte NUR mit diesem JSON-Objekt, kein Markdown, kein Text davor oder danach:
{
  "resources": [
    {
      "title": "Kurzer prägnanter Titel",
      "beschreibung": "Was die Lehrkraft lernt und welches pädagogische Prinzip dahinter steckt",
      "typ": "video" | "artikel" | "podcast",
      "suchbegriff": "konkreter Suchbegriff",
      "plattform": "YouTube / Spotify / etc.",
      "minuten": 10
    }
  ]
}

Pro Typ (video, artikel, podcast) genau 2 Vorschläge = 6 Ressourcen gesamt.
Beginne mit { und ende mit }.`;

  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: false,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      return jsonError(
        anthropicRes.status || 502,
        `Anthropic-API-Fehler: ${errText || anthropicRes.statusText}`
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text?.trim() ?? '';

    console.log('RAW LEARNING RESPONSE:', JSON.stringify(rawText));

    // JSON extrahieren (robust mit Fallbacks)
    const parsed = extractJSON(rawText);

    if (!parsed || !parsed.resources) {
      console.error('Fehler beim JSON-Parsing:', rawText);
      return jsonError(502, 'Fehler beim Parsen der Fortbildungsressourcen.');
    }

    // XP berechnen für jede Ressource
    const resourcesWithXP = parsed.resources.map((resource) => ({
      ...resource,
      xp: calculateXP(resource.minuten),
    }));

    return new Response(
      JSON.stringify({
        resources: resourcesWithXP,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('suggest-learning error:', err);
    return jsonError(
      500,
      `Interner Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`
    );
  }
});
