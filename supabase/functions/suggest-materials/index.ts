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
  // Versuche zuerst JSON direkt zu parsen
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: Suche nach JSON-Block in Markdown-Code-Blöcken
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (markdownMatch) {
      try {
        return JSON.parse(markdownMatch[1]);
      } catch {
        // Fallback: Suche nach { ... } mit beliebigem Whitespace
        const jsonMatch = text.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[1]);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
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

  const systemPrompt = `Du bist ein Bildungsexperte mit großer Kenntnis deutschsprachiger Bildungsmedien. Schlage zu der vorliegenden Unterrichtsstunde passende Materialien vor, die Lehrkräfte verwenden oder Schülern mitgeben können.

WICHTIG: Erfinde KEINE konkreten URLs oder Titel. Gib stattdessen Suchempfehlungen mit konkreten Suchbegriffen und Hinweisen, was die Lehrkraft suchen soll.

Strukturiere die Antwort als JSON-Objekt mit diesen Kategorien:
{
  "videos": [{ "beschreibung": "...", "suchbegriff": "...", "plattform": "YouTube / Mediathek / ..." }],
  "artikel": [{ "beschreibung": "...", "suchbegriff": "...", "quelle": "z.B. SPIEGEL Wissen, Planet Wissen, etc." }],
  "podcasts": [{ "beschreibung": "...", "suchbegriff": "...", "plattform": "Spotify / ARD Audiothek / ..." }],
  "uebungsmaterial": [{ "beschreibung": "...", "suchbegriff": "...", "quelle": "4teachers / lehrermarktplatz / etc." }]
}

Pro Kategorie 2-4 Vorschläge. Antworte NUR mit dem JSON-Objekt.`;

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
