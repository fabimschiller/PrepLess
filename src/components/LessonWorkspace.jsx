/**
 * LessonWorkspace – Arbeitsbereich für einen Slot
 *
 * Props:
 *   activeClass   – Klassen-Objekt
 *   slot          – { unit, slotIndex, lesson | null } oder null
 *   onLessonSaved – fn(lesson)
 */
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG as QRCode } from 'qrcode.react'
import {
  getStudents as getStudentsDb,
  getCurriculumUnits,
  getLessons,
  getObservations,
  upsertLesson,
  deleteLesson,
  getLearningProgressByLesson,
  createLearningProgress,
  getProfile,
  updateProfile,
} from '../lib/db'
import { getSession } from '../lib/auth'
import { generateLesson, suggestMaterials, suggestLearning, suggestTopic as suggestTopicAPI } from '../lib/api'
import LessonRenderer from './LessonRenderer'
import './LessonWorkspace.css'

// ─── Partial JSON Extraction ──────────────────────────────────────────────────
function extractPartialLesson(jsonString) {
  const partial = {}

  // titel: extrahiere String zwischen "titel": "..." 
  const titelMatch = jsonString.match(/"titel"\s*:\s*"([^"]+)"/)
  if (titelMatch) {
    partial.titel = titelMatch[1]
  }

  // lernziele: extrahiere Array
  const lernzieleMatch = jsonString.match(/"lernziele"\s*:\s*\[([\s\S]*?)\]/)
  if (lernzieleMatch) {
    try {
      const arrayStr = `[${lernzieleMatch[1]}]`
      partial.lernziele = JSON.parse(arrayStr)
    } catch (e) {
      // Noch nicht vollständig
    }
  }

  // phasen: extrahiere Array mit vollständigen Objekten
  // Finde den Anfang von "phasen": [
  const phasenStart = jsonString.indexOf('"phasen"')
  if (phasenStart !== -1) {
    const afterPhasen = jsonString.indexOf('[', phasenStart)
    if (afterPhasen !== -1) {
      try {
        // Finde alle vollständigen Objekte { ... }
        const phasen = []
        let depth = 0
        let current = ''
        let bracketDepth = 0
        
        for (let i = afterPhasen; i < jsonString.length; i++) {
          const char = jsonString[i]
          
          // Verfolge die äußere Array-Klammer
          if (char === '[') bracketDepth++
          if (char === ']') {
            bracketDepth--
            if (bracketDepth === 0) break // Ende des phasen-Arrays
          }
          
          // Verfolge die inneren Objekt-Klammern
          if (char === '{') depth++
          if (char === '}') depth--
          
          current += char
          
          if (depth === 0 && current.trim().endsWith('}')) {
            try {
              // Cleanup: entferne führendes Komma und [ 
              const cleaned = current.trim().replace(/^[,\[\s]*/, '').trim()
              if (cleaned.startsWith('{')) {
                const phase = JSON.parse(cleaned)
                phasen.push(phase)
                current = ''
              }
            } catch (e) {
              // Skip malformed
            }
          }
        }
        
        if (phasen.length > 0) {
          partial.phasen = phasen
        }
      } catch (e) {
        // Noch nicht vollständig
      }
    }
  }

  // differenzierung: extrahiere Objekt
  const diffMatch = jsonString.match(/"differenzierung"\s*:\s*\{([\s\S]*?)\}(?:\s*,\s*"wissenschaft"|\s*\})/)
  if (diffMatch) {
    try {
      const diffStr = `{${diffMatch[1]}}`
      partial.differenzierung = JSON.parse(diffStr)
    } catch (e) {
      // Noch nicht vollständig
    }
  }

  // wissenschaft: extrahiere String
  const wissMatch = jsonString.match(/"wissenschaft"\s*:\s*"([\s\S]*?)"(?:\s*\}|$)/)
  if (wissMatch) {
    partial.wissenschaft = wissMatch[1]
  }

  return partial
}

// ─── SSE-Parser ───────────────────────────────────────────────────────────────
async function streamSSE(response, onChunk, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal?.aborted) break
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        const dataLines = raw
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
        if (!dataLines.length) continue
        const dataStr = dataLines.join('\n')
        if (dataStr === '[DONE]') continue

        try {
          const evt = JSON.parse(dataStr)
          if (
            evt.type === 'content_block_delta' &&
            evt.delta?.type === 'text_delta' &&
            typeof evt.delta.text === 'string'
          ) {
            onChunk(evt.delta.text)
          } else if (evt.type === 'error') {
            throw new Error(evt.error?.message ?? 'Anthropic-Stream-Fehler')
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Anthropic')) throw e
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function LessonWorkspace({ activeClass, slot, onLessonSaved }) {
  const [topic, setTopic] = useState('')
  const [content, setContent] = useState('')
  const [parsedLesson, setParsedLesson] = useState(null)
  const [partialLesson, setPartialLesson] = useState({})
  const [savedLessonId, setSavedLessonId] = useState(null)
  const [lessonStatus, setLessonStatus] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveError, setAutoSaveError] = useState(null)
  const [wasAutoSaved, setWasAutoSaved] = useState(false)
  const [hasUnsavedRefinement, setHasUnsavedRefinement] = useState(false)
  const [refinement, setRefinement] = useState('')
  const [refining, setRefining] = useState(false)
  const [topicSuggesting, setTopicSuggesting] = useState(false)
  const [students, setStudents] = useState([])
  const [topicSuggestions, setTopicSuggestions] = useState([])
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [materials, setMaterials] = useState(null)
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [showMaterialsModal, setShowMaterialsModal] = useState(false)
  const [learningResources, setLearningResources] = useState(null)
  const [learningLoading, setLearningLoading] = useState(false)
  const [showLearningModal, setShowLearningModal] = useState(false)
  const [viewedResources, setViewedResources] = useState(new Set())
  const [viewingResourceId, setViewingResourceId] = useState(null)
  const [showStartModal, setShowStartModal] = useState(false)

  const abortRef = useRef(null)

  // Modal-Close: Escape-Taste
  useEffect(() => {
    if (!showMaterialsModal && !showLearningModal && !showStartModal) return
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showMaterialsModal) setShowMaterialsModal(false)
        if (showLearningModal) setShowLearningModal(false)
        if (showStartModal) setShowStartModal(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showMaterialsModal, showLearningModal, showStartModal])

  // Load viewed resources wenn Learning-Modal öffnet
  useEffect(() => {
    if (showLearningModal) {
      loadViewedResources()
    }
  }, [showLearningModal])

  // Für den Generate-Payload: Schüler + letzte Beobachtungen
  useEffect(() => {
    if (!activeClass?.id) { setStudents([]); return }
    getStudentsDb(activeClass.id)
      .then(({ data }) => setStudents(data ?? []))
  }, [activeClass?.id])

  // Curriculum Units für Topic-Datalist laden
  useEffect(() => {
    if (!activeClass?.id) { setTopicSuggestions([]); return }
    getCurriculumUnits(activeClass.id)
      .then(({ data: units }) => {
        if (!units) return
        const suggestions = []
        for (const unit of units) {
          for (let i = 1; i <= unit.estimated_hours; i++) {
            suggestions.push(`${unit.title} – Stunde ${i} von ${unit.estimated_hours}`)
          }
        }
        setTopicSuggestions(suggestions)
      })
  }, [activeClass?.id])

  // JSON-Parser: Versuche content als JSON zu parsen
  useEffect(() => {
    if (!content.trim()) {
      setParsedLesson(null)
      return
    }

    console.log('content slice:', content?.substring(0, 100))

    try {
      // Versuch 1: Direktes JSON.parse
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object' && parsed.titel) {
        console.log('✓ JSON.parse succeeded, parsedLesson set')
        setParsedLesson(parsed)
        return
      }
    } catch (e) {
      console.log('JSON parse failed, trying markdown extraction')
    }

    // Versuch 2: Markdown-Codeblock-Extraktion
    try {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        const parsed = JSON.parse(match[1].trim())
        if (parsed && typeof parsed === 'object' && parsed.titel) {
          setParsedLesson(parsed)
          return
        }
      }
    } catch (e) {
      console.log('Markdown extraction failed')
    }

    // Versuch 3: Objekt-Extraktion von { bis }
    try {
      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        const jsonStr = content.substring(firstBrace, lastBrace + 1)
        const parsed = JSON.parse(jsonStr)
        if (parsed && typeof parsed === 'object' && parsed.titel) {
          setParsedLesson(parsed)
          return
        }
      }
    } catch (e) {
      console.log('Object extraction failed')
    }

    // Kein gültiges JSON gefunden → Fallback auf Plaintext
    setParsedLesson(null)
  }, [content])

  // Klassenwechsel: Content sofort löschen damit kein alter Inhalt sichtbar bleibt
  useEffect(() => {
    setContent('')
    setParsedLesson(null)
    setSavedLessonId(null)
    setLessonStatus(null)
    setTopic('')
    abortRef.current?.abort()
  }, [activeClass?.id]) // eslint-disable-line

  // Slot wechselt: Felder zurücksetzen / vorbelegen
  useEffect(() => {
    console.log('🎯 Slot useEffect fired', {
      slotExists: !!slot,
      hasLesson: !!slot?.lesson,
      lessonId: slot?.lesson?.id
    })

    abortRef.current?.abort()
    setGenerating(false)
    setRefining(false)
    setSaveSuccess(null)
    setSaveError(null)
    setGenError(null)
    setRefinement('')
    setTopicSuggesting(false)
    setAiSuggestions([])
    setHasUnsavedRefinement(false)

    if (!slot) {
      setTopic(''); setContent(''); setSavedLessonId(null); setLessonStatus(null)
      return
    }

    const { unit, slotIndex, lesson } = slot
    console.log('🎯 After destructure:', { unit: !!unit, slotIndex, lesson: !!lesson })
    
    if (lesson) {
      console.log('Loading lesson:', lesson.id, 'hasContent:', !!lesson.content, 'contentSlice:', lesson.content?.substring(0, 100))
      setTopic(lesson.title ?? '')
      setContent(lesson.content ?? '')  // Setzt content → trigger Parser-useEffect
      setSavedLessonId(lesson.id)
      setLessonStatus(lesson.status ?? 'planned')
      // parsedLesson wird durch den content-useEffect gesetzt
    } else {
      console.log('🎯 Empty slot detected, resetting state...')
      setTopic('')
      setContent('')
      setSavedLessonId(null)
      setLessonStatus(null)
      setParsedLesson(null)
      // Leerer Slot → suggestTopic aufrufen
      console.log('🎯 About to call suggestTopic()')
      try {
        suggestTopic()
        console.log('🎯 suggestTopic() called successfully')
      } catch (err) {
        console.error('🎯 Error calling suggestTopic:', err)
      }
    }
  }, [slot]) // eslint-disable-line

  async function callGenerateStream({ previousContent, refinementRequest } = {}) {
    if (!activeClass) return

    // Letzte Beobachtungen je Schüler für den Prompt
    const studentNames = students.map((s) => s.name)
    const latestObs = {}
    if (students.length) {
      const { data: obs } = await getObservations(students.map((s) => s.id))
      if (obs) {
        for (const o of obs) {
          if (!latestObs[o.student_id]) latestObs[o.student_id] = o.note
        }
      }
    }
    const studentNotes = {}
    for (const s of students) studentNotes[s.name] = latestObs[s.id] ?? s.notes ?? ''

    // Letzte 5 Stunden für Kontext
    const { data: prevLessons } = await getLessons(activeClass.id, 5)
    const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

    const controller = new AbortController()
    abortRef.current = controller

    const { response, signal } = await generateLesson({
      className: activeClass.name,
      subject: (activeClass.subjects ?? []).join(', ') || activeClass.subject,
      school_type: activeClass.school_type ?? '',
      grade: activeClass.grade,
      state: activeClass.state,
      studentNames,
      studentNotes,
      topic: topic.trim(),
      previousLessons,
      curriculumUnitTitle: slot?.unit?.title ?? '',
      curriculumUnitDescription: slot?.unit?.description ?? '',
      ...(previousContent && refinementRequest
        ? { previousContent, refinementRequest }
        : {}),
    }, controller.signal)

    return { response, signal: controller.signal }
  }

  async function suggestTopic() {
    console.log('suggestTopic: start', { activeClass: !!activeClass, slot: !!slot })
    if (!activeClass || !slot) {
      console.log('suggestTopic: early return - missing activeClass or slot')
      return
    }
    setTopicSuggesting(true)
    try {
      // Letzte 5 Stunden für Kontext
      const { data: prevLessons } = await getLessons(activeClass.id, 5)
      const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

      console.log('suggestTopic: calling suggestTopicAPI from lib/api')
      const result = await suggestTopicAPI({
        suggestionOnly: true,
        slotIndex: slot.slotIndex,
        curriculumUnitTitle: slot.unit.title,
        curriculumUnitDescription: slot.unit.description ?? '',
        estimatedHours: slot.unit.estimated_hours,
        previousLessons,
      })

      console.log('suggestTopic: response', { result })
      if (result.suggestions && Array.isArray(result.suggestions)) {
        console.log('suggestTopic: suggestions set', result.suggestions)
        setAiSuggestions(result.suggestions)
      } else {
        console.log('suggestTopic: no suggestions in response', { suggestions: result.suggestions })
      }
    } catch (err) {
      console.error('suggestTopic error:', err)
      setAiSuggestions([])
      // Fehler ignorieren, Nutzer kann manuell eingeben
    } finally {
      setTopicSuggesting(false)
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) { setGenError('Bitte ein Thema eingeben.'); return }
    setGenerating(true); setGenError(null); setContent('')
    setPartialLesson({}); setParsedLesson(null)
    setSavedLessonId(null); setSaveSuccess(null); setSaveError(null)
    setHasUnsavedRefinement(false)  // Keine ungespeicherten Verfeinerungen nach neuer Generierung

    try {
      const { response, signal } = await callGenerateStream()
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
        
        // Progressive JSON-Extraktion: extrahiere Felder während Streaming
        const partial = extractPartialLesson(acc)
        setPartialLesson(partial)
      }, signal)

       // Nach Ende des Streams: vollständiges JSON parsen
        try {
          const parsed = JSON.parse(acc)
          if (parsed && typeof parsed === 'object' && parsed.titel) {
            setParsedLesson(parsed)
            setPartialLesson(parsed)
            // Auto-Save nach erfolgreicher Generation
            console.log('Stream erfolgreich, starte Auto-Save...')
            await handleAutoSave(acc)
            return
          }
        } catch (e) {
          console.log('Full JSON parse failed')
        }

        // Fallback: Markdown-Extraktion
        try {
          const match = acc.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (match) {
            const parsed = JSON.parse(match[1].trim())
            if (parsed && typeof parsed === 'object' && parsed.titel) {
              setParsedLesson(parsed)
              setPartialLesson(parsed)
              // Auto-Save nach erfolgreicher Generation
              console.log('Markdown-Parse erfolgreich, starte Auto-Save...')
              await handleAutoSave(acc)
              return
            }
          }
        } catch (e) {
          console.log('Markdown parse failed')
        }

        // Fallback: Objekt-Extraktion
        try {
          const firstBrace = acc.indexOf('{')
          const lastBrace = acc.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
            const jsonStr = acc.substring(firstBrace, lastBrace + 1)
            const parsed = JSON.parse(jsonStr)
            if (parsed && typeof parsed === 'object' && parsed.titel) {
              setParsedLesson(parsed)
              setPartialLesson(parsed)
              // Auto-Save nach erfolgreicher Generation
              console.log('Objekt-Extraktion erfolgreich, starte Auto-Save...')
              await handleAutoSave(acc)
              return
            }
          }
        } catch (e) {
          console.log('Object extract failed')
        }
     } catch (err) {
       if (err.name !== 'AbortError') setGenError(err.message ?? String(err))
     } finally {
       setGenerating(false)
     }
  }

  async function handleRefine() {
    const req = refinement.trim()
    if (!req || !content) return
    setRefining(true); setGenError(null)
    const prevParsedLesson = parsedLesson
    setContent('')
    setPartialLesson({})

    try {
      // previousContent muss als JSON-String übergeben werden
      const previousContent = parsedLesson ? JSON.stringify(parsedLesson) : content
      const { response, signal } = await callGenerateStream({
        previousContent,
        refinementRequest: req,
      })
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
        
        // Progressive JSON-Extraktion während Refinement
        const partial = extractPartialLesson(acc)
        setPartialLesson(partial)
      }, signal)
      setRefinement('')

       // Nach Ende des Streams: vollständiges JSON parsen
       try {
         const parsed = JSON.parse(acc)
         if (parsed && typeof parsed === 'object' && parsed.titel) {
           setParsedLesson(parsed)
           setPartialLesson(parsed)
           setHasUnsavedRefinement(true)
           return
         }
       } catch (e) {
         console.log('Full JSON parse failed')
       }

       // Fallback: Markdown-Extraktion
       try {
         const match = acc.match(/```(?:json)?\s*([\s\S]*?)```/)
         if (match) {
           const parsed = JSON.parse(match[1].trim())
           if (parsed && typeof parsed === 'object' && parsed.titel) {
             setParsedLesson(parsed)
             setPartialLesson(parsed)
             setHasUnsavedRefinement(true)
             return
           }
         }
       } catch (e) {
         console.log('Markdown parse failed')
       }

       // Fallback: Objekt-Extraktion
       try {
         const firstBrace = acc.indexOf('{')
         const lastBrace = acc.lastIndexOf('}')
         if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
           const jsonStr = acc.substring(firstBrace, lastBrace + 1)
           const parsed = JSON.parse(jsonStr)
           if (parsed && typeof parsed === 'object' && parsed.titel) {
             setParsedLesson(parsed)
             setPartialLesson(parsed)
             setHasUnsavedRefinement(true)
             return
           }
         }
       } catch (e) {
         console.log('Object extract failed')
       }
     } catch (err) {
       if (err.name !== 'AbortError') {
         setGenError(err.message ?? String(err))
         setParsedLesson(prevParsedLesson)
       }
     } finally {
       setRefining(false)
     }
  }

  function handleAbort() {
    abortRef.current?.abort()
  }

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    const heading = `${activeClass.name} – ${topic.trim() || slot?.unit?.title || 'Unterrichtsstunde'}`
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    win.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>${heading}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.65;
      color: #111;
      background: #fff;
      padding: 28mm 24mm;
      max-width: 210mm;
      margin: 0 auto;
    }
    h1 {
      font-size: 16pt;
      font-weight: bold;
      margin-bottom: 18pt;
      padding-bottom: 8pt;
      border-bottom: 1.5px solid #333;
    }
    pre {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>${heading}</h1>
  <pre>${escapedContent}</pre>
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`)
    win.document.close()
  }

  async function handleSave() {
    if (!content.trim() || !activeClass || !slot) return
    setSaving(true); setSaveError(null); setSaveSuccess(null)

    const { data: lesson, error: insErr } = await upsertLesson({
      ...(savedLessonId ? { id: savedLessonId } : {}),
      class_id: activeClass.id,
      curriculum_unit_id: slot.unit.id,
      position: slot.slotIndex + 1,
      title: topic.trim() || `Stunde ${slot.slotIndex + 1}`,
      content: content.trim(),
    })

      setSaving(false)
      if (insErr) { setSaveError(insErr.message); return }
      console.log('lesson.id from Supabase:', lesson.id, 'type:', typeof lesson.id)
      setSavedLessonId(lesson.id)
      setLessonStatus(lesson.status ?? 'planned')
      setSaveSuccess('Stunde gespeichert.')
      setHasUnsavedRefinement(false)
      onLessonSaved?.(lesson)
  }

    async function handleAutoSave(contentToSave) {
      console.log('🔄 Auto-Save start', { hasContent: !!contentToSave, activeClass: !!activeClass, slot: !!slot })
      
      // Nutze den übergebenen contentToSave oder den State-Wert
      const saveContent = contentToSave ?? content
      if (!saveContent.trim() || !activeClass || !slot) {
        console.log('🔄 Auto-Save early return - missing data')
        return
      }
      setAutoSaving(true); setAutoSaveError(null)

      const { data: lesson, error: insErr } = await upsertLesson({
        ...(savedLessonId ? { id: savedLessonId } : {}),
        class_id: activeClass.id,
        curriculum_unit_id: slot.unit.id,
        position: slot.slotIndex + 1,
        title: topic.trim() || `Stunde ${slot.slotIndex + 1}`,
        content: saveContent.trim(),
      })

      setAutoSaving(false)
      if (insErr) { 
        setAutoSaveError(insErr.message)
        console.error('Auto-Save fehlgeschlagen:', insErr.message)
        return 
      }
      
       console.log('Auto-Save erfolgreich:', lesson.id)
       setSavedLessonId(lesson.id)
       setLessonStatus(lesson.status ?? 'planned')
       setWasAutoSaved(true)
       setHasUnsavedRefinement(false)
       onLessonSaved?.(lesson)
       
       // Erfolgs-Meldung nach 3 Sekunden ausblenden
       setTimeout(() => setWasAutoSaved(false), 3000)
   }

   async function handleDelete() {
     console.log('handleDelete called, savedLessonId:', savedLessonId)
    if (!savedLessonId) {
      console.log('savedLessonId is null/undefined, returning')
      return
    }
    
    const confirmed = window.confirm('Stunde wirklich löschen?')
    console.log('Confirm dialog result:', confirmed)
    if (!confirmed) return

    console.log('Starting DELETE for id:', savedLessonId)
    const { error } = await deleteLesson(savedLessonId)

    console.log('DELETE response - error:', error)

    if (error) {
      console.error('Löschen fehlgeschlagen:', error)
      setGenError(`Fehler beim Löschen: ${error.message}`)
      return
    }

    console.log('DELETE successful, reloading page')
    // Temporärer Fix: reload() statt State-Reset
    // TODO: Später saubere Cache-Invalidierung implementieren
    window.location.reload()
  }

  async function handleSuggestMaterials() {
    if (!content.trim() || !activeClass) return
    setMaterialsLoading(true)
    try {
      const result = await suggestMaterials({
        lessonContent: content,
        lessonTitle: topic,
        subject: activeClass.subject,
        grade: activeClass.grade,
        schoolType: activeClass.school_type,
      })

      setMaterials(result.materials)
    } catch (err) {
      console.error('suggestMaterials error:', err)
      setGenError(err instanceof Error ? err.message : 'Fehler beim Laden der Materialvorschläge')
    } finally {
      setMaterialsLoading(false)
    }
  }

  async function handleSuggestLearning() {
    if (!content.trim() || !activeClass) return
    setLearningLoading(true)
    try {
      const result = await suggestLearning({
        lessonContent: content,
        lessonTitle: topic,
        subject: activeClass.subject,
        grade: activeClass.grade,
        schoolType: activeClass.school_type,
      })

      setLearningResources(result.resources)
    } catch (err) {
      console.error('suggestLearning error:', err)
      setGenError(err instanceof Error ? err.message : 'Fehler beim Laden der Fortbildungsressourcen')
    } finally {
      setLearningLoading(false)
    }
  }

  async function loadViewedResources() {
    if (!savedLessonId) return
    try {
      const { data: sessionData } = await getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) return

      const { data: progressData } = await getLearningProgressByLesson(userId, savedLessonId)

      if (progressData) {
        const titles = new Set(progressData.map(p => p.resource_title))
        setViewedResources(titles)
      }
    } catch (err) {
      console.error('Error loading viewed resources:', err)
    }
  }

  async function markAsViewed(resource) {
    setViewingResourceId(resource.title)
    try {
      const { data: sessionData } = await getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) throw new Error('Nicht eingeloggt')

      // Insert in learning_progress
      const { error: insertError } = await createLearningProgress(
        userId,
        savedLessonId,
        resource.title,
        resource.typ,
        resource.xp
      )

      if (insertError) throw insertError

      // Update profiles
      const { data: profileData } = await getProfile(userId)

      if (profileData) {
        const newTotal = (profileData.total_xp || 0) + resource.xp
        await updateProfile(userId, { total_xp: newTotal })
      }

      // Mark as viewed locally
      setViewedResources(prev => new Set([...prev, resource.title]))
    } catch (err) {
      console.error('Error marking resource as viewed:', err)
      setGenError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setViewingResourceId(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!slot) {
    return (
      <section className="workspace card">
        <p className="empty-state workspace-placeholder">
          Wähle eine Stunde aus dem Lehrplan oben.
        </p>
      </section>
    )
  }

    const { unit, slotIndex } = slot
    const isStreaming = generating || refining
    const hasContent = content.length > 0
    const displayLesson = Object.keys(partialLesson).length > 0 
      ? partialLesson 
      : parsedLesson

    console.log('🔥 RENDER v2', {
      hasParsedLesson: parsedLesson !== null,
      parsedLessonTitel: parsedLesson?.titel,
      hasPartialLesson: Object.keys(partialLesson).length > 0,
      hasUnsavedRefinement: hasUnsavedRefinement,
      savedLessonId: savedLessonId,
      wasAutoSaved: wasAutoSaved,
    })

  return (
    <section className="workspace card">
      <div className="workspace-header">
        <div>
          <h2>{unit.title} · Stunde {slotIndex + 1}</h2>
          <p className="card-subtitle">
            {activeClass.subject} · Jg. {activeClass.grade} · {activeClass.state}
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ws-topic">Thema der Stunde</label>
        <input
          id="ws-topic"
          type="text"
          placeholder="Vorschlag wählen oder Thema selbst festlegen"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={isStreaming}
          autoComplete="off"
        />
        
        {/* Suggestion Chips - sichtbar wenn: kein saveLessonId, kein content, suggestions vorhanden */}
        {!savedLessonId && !content && aiSuggestions.length > 0 && (
          <div className="suggestions-section">
            <div className="suggestions-hint">Vorschläge basierend auf deinem Lehrplan:</div>
            <div className="suggestions-chips">
              {aiSuggestions.map((suggestion, idx) => (
                <button
                  key={`chip-${idx}`}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => setTopic(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="workspace-actions">
        <button
          className="btn-primary"
          type="button"
          onClick={handleGenerate}
          disabled={isStreaming || !topic.trim()}
        >
          {generating ? 'Generiert…' : 'Stunde generieren'}
        </button>
        {isStreaming && (
          <button className="btn-secondary" type="button" onClick={handleAbort}>
            Abbrechen
          </button>
        )}
         {hasContent && !isStreaming && (
           <button
             className="btn-primary"
             type="button"
             onClick={handleSave}
             disabled={saving}
           >
             {saving ? 'Speichert…' : '💾 Stunde speichern'}
           </button>
         )}
         {savedLessonId && !isStreaming && (
           <button
             className="btn-primary"
             type="button"
             onClick={() => setShowStartModal(true)}
           >
             ▶ Stunde starten
           </button>
         )}
          {savedLessonId && !isStreaming && (
           <button
             className="btn-primary"
             type="button"
          onClick={() => {
                if (!materials) {
                  handleSuggestMaterials()
                }
                setShowMaterialsModal(true)
              }}
             disabled={materialsLoading}
           >
             {materialsLoading ? 'Materialien werden vorgeschlagen…' : '📚 Material'}
           </button>
         )}
         {savedLessonId && !isStreaming && (
           <button
             className="btn-primary"
             type="button"
          onClick={() => {
                if (!learningResources) {
                  handleSuggestLearning()
                }
                setShowLearningModal(true)
              }}
             disabled={learningLoading}
           >
             {learningLoading ? 'Ressourcen werden vorgeschlagen…' : '🎓 Dahinter steckt…'}
           </button>
         )}
         <div className="workspace-actions-spacer" />
        {hasContent && !isStreaming && (
          <button
            className="btn-secondary"
            type="button"
            onClick={handlePrint}
          >
            🖨 Drucken
          </button>
        )}
        {savedLessonId && !isStreaming && (
          <button
            className="btn-delete-text"
            type="button"
            onClick={handleDelete}
          >
            Löschen
          </button>
        )}
       </div>

      {genError && <div className="alert error">{genError}</div>}

       {(isStreaming || hasContent) && (
         <div className="workspace-content-wrap">
             {hasContent && (
               <>
                 {(isStreaming || displayLesson) ? (
                   <LessonRenderer lessonJson={displayLesson} isStreaming={isStreaming} />
                 ) : (
                   <pre className="workspace-content">
                     {content}
                   </pre>
                 )}
               </>
             )}
         </div>
       )}

         {hasContent && !isStreaming && (
           <div className="workspace-save-row">
              {/* Speichern-Button: nur sichtbar wenn ungespeicherte Verfeinerung */}
              {hasUnsavedRefinement && (
                <button
                  className="btn-primary"
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Speichert…' : '💾 Verfeinerte Version speichern'}
                </button>
              )}
            
            {/* Auto-Save Status */}
            {autoSaving && <span className="workspace-save-status">Wird automatisch gespeichert…</span>}
            {wasAutoSaved && !refining && <span className="workspace-save-ok">✓ Automatisch gespeichert</span>}
            {autoSaveError && <span className="workspace-save-error">{autoSaveError}</span>}
            
            {saveError && <span className="workspace-save-error">{saveError}</span>}
            {saveSuccess && <span className="workspace-save-ok">{saveSuccess}</span>}
           {savedLessonId && (
             <button
               className="btn-delete-text"
               type="button"
               onClick={handleDelete}
             >
               Löschen
             </button>
           )}
           {savedLessonId && !isStreaming && (
             <button
               className="btn-primary"
               type="button"
            onClick={() => {
                  if (!materials) {
                    handleSuggestMaterials()
                  }
                  setShowMaterialsModal(true)
                }}
               disabled={materialsLoading}
             >
               {materialsLoading ? 'Materialien werden vorgeschlagen…' : '📚 Material'}
             </button>
           )}
         </div>
       )}

      {/* Material-Modal Overlay */}
      {showMaterialsModal && (
        <div className="materials-modal-overlay" onClick={() => setShowMaterialsModal(false)}>
          <div className="materials-modal" onClick={(e) => e.stopPropagation()}>
            <div className="materials-modal-header">
              <h2>📚 Ergänzendes Material zur Stunde</h2>
              <button
                className="materials-modal-close"
                type="button"
                onClick={() => setShowMaterialsModal(false)}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            <div className="materials-modal-content">
               {!materials ? (
                 <div className="materials-error">
                   <p>Keine Materialien geladen.</p>
                 </div>
               ) : (
                 <>
                   <h3 className="materials-title">📚 Lernmaterialien zur Stunde</h3>

                  {materials.videos && materials.videos.length > 0 && (
            <div className="material-category">
              <h4 className="material-category-title">🎥 Videos</h4>
              <div className="material-list">
                {materials.videos.map((item, idx) => (
                  <div key={`video-${idx}`} className="material-item">
                    <p className="material-description">{item.beschreibung}</p>
                    <div className="material-search-code">{item.suchbegriff}</div>
                    {item.plattform && <p className="material-source">{item.plattform}</p>}
                    <button
                      type="button"
                      className="material-search-btn"
                      onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                    >
                      🔍 Suchen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {materials.artikel && materials.artikel.length > 0 && (
            <div className="material-category">
              <h4 className="material-category-title">📖 Artikel</h4>
              <div className="material-list">
                {materials.artikel.map((item, idx) => (
                  <div key={`artikel-${idx}`} className="material-item">
                    <p className="material-description">{item.beschreibung}</p>
                    <div className="material-search-code">{item.suchbegriff}</div>
                    {item.quelle && <p className="material-source">{item.quelle}</p>}
                    <button
                      type="button"
                      className="material-search-btn"
                      onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                    >
                      🔍 Suchen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {materials.podcasts && materials.podcasts.length > 0 && (
            <div className="material-category">
              <h4 className="material-category-title">🎧 Podcasts</h4>
              <div className="material-list">
                {materials.podcasts.map((item, idx) => (
                  <div key={`podcast-${idx}`} className="material-item">
                    <p className="material-description">{item.beschreibung}</p>
                    <div className="material-search-code">{item.suchbegriff}</div>
                    {item.plattform && <p className="material-source">{item.plattform}</p>}
                    <button
                      type="button"
                      className="material-search-btn"
                      onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                    >
                      🔍 Suchen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {materials.uebungsmaterial && materials.uebungsmaterial.length > 0 && (
            <div className="material-category">
              <h4 className="material-category-title">📋 Übungsmaterial</h4>
              <div className="material-list">
                {materials.uebungsmaterial.map((item, idx) => (
                  <div key={`uebung-${idx}`} className="material-item">
                    <p className="material-description">{item.beschreibung}</p>
                    <div className="material-search-code">{item.suchbegriff}</div>
                    {item.quelle && <p className="material-source">{item.quelle}</p>}
                    <button
                      type="button"
                      className="material-search-btn"
                      onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                    >
                      🔍 Suchen
                    </button>
                  </div>
                ))}
              </div>
             </div>
           )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Learning-Modal Overlay */}
      {showLearningModal && (
        <div className="learning-modal-overlay" onClick={() => setShowLearningModal(false)}>
          <div className="learning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="learning-modal-header">
              <h2>🎓 Fortbildungsressourcen für Lehrkräfte</h2>
              <button
                className="learning-modal-close"
                type="button"
                onClick={() => setShowLearningModal(false)}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            <div className="learning-modal-content">
               {!learningResources || learningResources.length === 0 ? (
                 <div className="learning-error">
                   <p>Keine Ressourcen geladen.</p>
                 </div>
               ) : (
                 <>
                   <div className="learning-resources-list">
                    {learningResources.map((resource, idx) => (
                      <div
                        key={`resource-${idx}`}
                        className={`learning-resource-item ${viewedResources.has(resource.title) ? 'viewed' : ''}`}
                      >
                        <div className="learning-resource-header">
                          <h3 className="learning-resource-title">{resource.title}</h3>
                          <span className="learning-resource-xp">+{resource.xp} XP</span>
                        </div>
                        <p className="learning-resource-description">{resource.beschreibung}</p>
                        <div className="learning-resource-meta">
                          <span className="learning-resource-type">{resource.typ}</span>
                          <span className="learning-resource-time">⏱ {resource.minuten} Min</span>
                        </div>
                        <div className="learning-resource-search">
                          <span className="learning-resource-search-term">{resource.suchbegriff}</span>
                          <button
                            type="button"
                            className="learning-search-btn"
                            onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(resource.suchbegriff)}`, '_blank')}
                          >
                            🔍 Suchen
                          </button>
                        </div>
                        {resource.plattform && (
                          <p className="learning-resource-plattform">📍 {resource.plattform}</p>
                        )}
                        <div className="learning-resource-action">
                          <button
                            type="button"
                            className="learning-mark-viewed-btn"
                            onClick={() => markAsViewed(resource)}
                            disabled={viewedResources.has(resource.title) || viewingResourceId === resource.title}
                          >
                            {viewedResources.has(resource.title) ? '✓ Gesehen' : `+ ${resource.xp} XP · Gesehen`}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
       )}

       {/* Start-Modal mit QR-Code */}
       {showStartModal && (() => {
         console.log('savedLessonId type:', typeof savedLessonId, savedLessonId)
         const qrUrl = `https://prep-less-lyart.vercel.app/stunde/${savedLessonId}`
         console.log('[QR-Code Modal] QR URL:', qrUrl)
         return (
           <div className="start-modal-overlay" onClick={() => setShowStartModal(false)}>
             <div className="start-modal" onClick={(e) => e.stopPropagation()}>
               <div className="start-modal-header">
                 <h2>▶ Stunde starten</h2>
                 <button
                   className="start-modal-close"
                   type="button"
                   onClick={() => setShowStartModal(false)}
                   aria-label="Schließen"
                 >
                   ✕
                 </button>
               </div>

               <div className="start-modal-content">
                 <p className="start-modal-text">Scanne den QR-Code mit deinem Smartphone</p>
                 
                 <div className="start-modal-qr-container">
                   <QRCode 
                     value={qrUrl}
                     size={200}
                     level="H"
                     includeMargin={true}
                   />
                 </div>

                 <p className="start-modal-url">
                   <a 
                     href={qrUrl}
                     target="_blank"
                     rel="noopener noreferrer"
                   >
                     {qrUrl}
                   </a>
                 </p>

                 <p style={{ fontSize: '11px', wordBreak: 'break-all', color: '#999', marginTop: '12px' }}>
                   {qrUrl}
                 </p>
               </div>
             </div>
           </div>
         )
       })()}

       {hasContent && (
         <div className="workspace-refine">
          <div className="field">
            <label htmlFor="ws-refine">Verfeinern</label>
            <div className="refine-row">
              <input
                id="ws-refine"
                type="text"
                placeholder="z.B. Mach den Einstieg kürzer, füge mehr Gruppenarbeit ein…"
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                disabled={isStreaming}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isStreaming) handleRefine() }}
              />
              <button
                className="refine-send"
                type="button"
                onClick={handleRefine}
                disabled={isStreaming || !refinement.trim()}
                aria-label="Verfeinern"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
