import Anthropic from '@anthropic-ai/sdk'

const anthropicApiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

if (!anthropicApiKey) {
  console.warn(
    'Anthropic API Key fehlt. Bitte VITE_ANTHROPIC_API_KEY in .env.local setzen.'
  )
}

// Hinweis: Der API-Key sollte in Produktion NICHT im Browser ausgeliefert werden.
// Für die Entwicklung erlauben wir hier den Browser-Zugriff. Später besser über
// eine eigene Backend-Route / Edge Function proxien.
export const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
  dangerouslyAllowBrowser: true,
})
