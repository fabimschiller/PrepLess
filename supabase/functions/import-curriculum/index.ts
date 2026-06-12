// Supabase Edge Function: import-curriculum
// Nimmt einen Freitext-Lehrplan (z.B. aus PDF/Word copy-paste),
// lässt Claude die Einheiten strukturieren und speichert sie in curriculum_units.

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

const SYSTEM_PROMPT = `Du bist ein Assistent der Lehrpläne strukturiert. Der Nutzer gibt dir einen Lehrplan als Freitext (z.B. copy-paste aus einem PDF oder Word-Dokument). Deine Aufgabe ist es, die Themeneinheiten daraus zu extrahieren und als JSON-Array zurückzugeben.

Deine Antwort MUSS ein JSON-Array sein und NICHTS ANDERES. Kein Text davor oder danach, keine Markdown-Codeblöcke.

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
- title: kurzer Themenname (aus dem Text übernehmen oder sinnvoll kürzen)
- description: 1-2 Sätze Beschreibung der Inhalte (aus dem Text ableiten)
- estimated_hours: Stundenanzahl als ganze Zahl – aus dem Text übernehmen wenn angegeben, sonst schätzen (4–12)
- start_month: Schulmonat als Zahl: 1=September, 2=Oktober, 3=November, 4=Dezember, 5=Januar, 6=Februar, 7=März, 8=April, 9=Mai, 10=Juli
- end_month: Schulmonat als Zahl (wie start_month) – aus dem Text ableiten wenn angegeben, sonst anhand der Stundenanzahl und Reihenfolge schätzen

Verteile die Einheiten chronologisch über das Schuljahr (September bis Juli).
Wenn der Text keine klaren Monatsangaben macht, verteile gleichmäßig.

ANTWORTE NUR MIT DEM JSON-ARRAY. BEGINNE MIT [ UND ENDE MIT ].`;

interface ImportCurriculumRequest {
  classId: string;
  rawText: string;
}

interface CurriculumUnit {
  title: string;
  description: string;
  estimated_hours: number;
  start_month: number;
  end_month: number;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function extractJSONArray(text: string): CurriculumUnit[] | null {
  // Versuch 1: Direktes Parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { /* weiter */ }

  // Versuch 2: Markdown-Codeblock
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) { /* weiter */ }

  // Versuch 3: Erstes [ bis letztes ]
  try {
    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first !== -1 && last !== -1 && first < last) {
      const parsed = JSON.parse(text.substring(first, last + 1));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) { /* weiter */ }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed. Use POST.");
  }

  // Auth-Check
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonError(401, "Authorization-Header fehlt.");
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return jsonError(500, "ANTHROPIC_API_KEY ist nicht gesetzt.");
  }

  let body: ImportCurriculumRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Ungültiger JSON-Body.");
  }

  if (!body.classId) return jsonError(400, "classId fehlt.");
  if (!body.rawText?.trim()) return jsonError(400, "rawText fehlt.");
  if (body.rawText.length > 20000) {
    return jsonError(400, "Text zu lang (max. 20.000 Zeichen).");
  }

  // Claude den Freitext strukturieren lassen
  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: false,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Hier ist der Lehrplan-Text:\n\n${body.rawText.trim()}`,
        },
      ],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => "");
    return jsonError(502, `Anthropic-Fehler: ${errText || anthropicRes.statusText}`);
  }

  const anthropicData = await anthropicRes.json();
  const rawJson = anthropicData.content?.[0]?.text?.trim() ?? "";

  const units = extractJSONArray(rawJson);
  if (!units || units.length === 0) {
    return jsonError(502, "Konnte keine Einheiten aus dem Text extrahieren.");
  }

  // Supabase-Client mit User-Token (RLS greift)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Bestehende Einheiten löschen
  const { error: delErr } = await supabase
    .from("curriculum_units")
    .delete()
    .eq("class_id", body.classId);

  if (delErr) {
    return jsonError(500, `Fehler beim Löschen bestehender Einheiten: ${delErr.message}`);
  }

  // Neue Einheiten einfügen
  const rows = units.map((u, idx) => ({
    class_id: body.classId,
    position: idx + 1,
    title: String(u.title ?? "").trim(),
    description: String(u.description ?? "").trim(),
    estimated_hours: Math.max(1, Number(u.estimated_hours) || 6),
    start_month: Math.min(10, Math.max(1, Number(u.start_month) || 1)),
    end_month: Math.min(10, Math.max(1, Number(u.end_month) || 1)),
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("curriculum_units")
    .insert(rows)
    .select();

  if (insertErr) {
    return jsonError(500, `Fehler beim Speichern: ${insertErr.message}`);
  }

  return new Response(
    JSON.stringify({ units: inserted ?? [], count: rows.length }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    }
  );
});
