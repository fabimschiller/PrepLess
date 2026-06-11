/**
 * LessonWorkspace – Arbeitsbereich für einen Slot
 *
 * Props:
 *   activeClass   – Klassen-Objekt
 *   slot          – { unit, slotIndex, lesson | null } oder null
 *   onLessonSaved – fn(lesson)
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import './LessonWorkspace.css'

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
  const [savedLessonId, setSavedLessonId] = useState(null)
  const [lessonStatus, setLessonStatus] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
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

  const abortRef = useRef(null)

  // Modal-Close: Escape-Taste
  useEffect(() => {
    if (!showMaterialsModal && !showLearningModal) return
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showMaterialsModal) setShowMaterialsModal(false)
        if (showLearningModal) setShowLearningModal(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showMaterialsModal, showLearningModal])

  // Load viewed resources wenn Learning-Modal öffnet
  useEffect(() => {
    if (showLearningModal) {
      loadViewedResources()
    }
  }, [showLearningModal])

  // Für den Generate-Payload: Schüler + letzte Beobachtungen
  useEffect(() => {
    if (!activeClass?.id) { setStudents([]); return }
    supabase
      .from('students')
      .select('id, name, notes')
      .eq('class_id', activeClass.id)
      .order('name', { ascending: true })
      .then(({ data }) => setStudents(data ?? []))
  }, [activeClass?.id])

  // Curriculum Units für Topic-Datalist laden
  useEffect(() => {
    if (!activeClass?.id) { setTopicSuggestions([]); return }
    supabase
      .from('curriculum_units')
      .select('id, title, estimated_hours')
      .eq('class_id', activeClass.id)
      .order('position', { ascending: true })
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

  // Klassenwechsel: Content sofort löschen damit kein alter Inhalt sichtbar bleibt
  useEffect(() => {
    setContent('')
    setSavedLessonId(null)
    setLessonStatus(null)
    setTopic('')
    abortRef.current?.abort()
  }, [activeClass?.id]) // eslint-disable-line

  // Slot wechselt: Felder zurücksetzen / vorbelegen
  useEffect(() => {
    abortRef.current?.abort()
    setGenerating(false)
    setRefining(false)
    setSaveSuccess(null)
    setSaveError(null)
    setGenError(null)
    setRefinement('')
    setTopicSuggesting(false)
    setAiSuggestions([])

    if (!slot) {
      setTopic(''); setContent(''); setSavedLessonId(null); setLessonStatus(null)
      return
    }

    const { unit, slotIndex, lesson } = slot
    if (lesson) {
      setTopic(lesson.title ?? '')
      setContent(lesson.content ?? '')
      setSavedLessonId(lesson.id)
      setLessonStatus(lesson.status ?? 'planned')
    } else {
      setTopic('')
      setContent('')
      setSavedLessonId(null)
      setLessonStatus(null)
      // Starte Themenvorschlag für leeren Slot
      suggestTopic()
    }
  }, [slot?.unit?.id, slot?.slotIndex, slot?.lesson?.id]) // eslint-disable-line

  async function callGenerateStream({ previousContent, refinementRequest } = {}) {
    if (!activeClass) return

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('Nicht eingeloggt.')

    // Letzte Beobachtungen je Schüler für den Prompt
    const studentNames = students.map((s) => s.name)
    const latestObs = {}
    if (students.length) {
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, note')
        .in('student_id', students.map((s) => s.id))
        .order('created_at', { ascending: false })
      if (obs) {
        for (const o of obs) {
          if (!latestObs[o.student_id]) latestObs[o.student_id] = o.note
        }
      }
    }
    const studentNotes = {}
    for (const s of students) studentNotes[s.name] = latestObs[s.id] ?? s.notes ?? ''

    // Letzte 5 Stunden für Kontext
    const { data: prevLessons } = await supabase
      .from('lessons')
      .select('title, generated_at')
      .eq('class_id', activeClass.id)
      .order('generated_at', { ascending: false })
      .limit(5)
    const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const controller = new AbortController()
    abortRef.current = controller

    const response = await fetch(`${supabaseUrl}/functions/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(
        `Generierung fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
      )
    }

    return { response, signal: controller.signal }
  }

  async function suggestTopic() {
    if (!activeClass || !slot) return
    setTopicSuggesting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Nicht eingeloggt.')

      // Letzte 5 Stunden für Kontext
      const { data: prevLessons } = await supabase
        .from('lessons')
        .select('title, generated_at')
        .eq('class_id', activeClass.id)
        .order('generated_at', { ascending: false })
        .limit(5)
      const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/functions/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          suggestionOnly: true,
          slotIndex: slot.slotIndex,
          curriculumUnitTitle: slot.unit.title,
          curriculumUnitDescription: slot.unit.description ?? '',
          estimatedHours: slot.unit.estimated_hours,
          previousLessons,
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(
          `Vorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
        )
      }

      const result = await response.json()
      if (result.suggestions && Array.isArray(result.suggestions)) {
        setAiSuggestions(result.suggestions)
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
    setSavedLessonId(null); setSaveSuccess(null); setSaveError(null)

    try {
      const { response, signal } = await callGenerateStream()
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        
        // Prüfe ob wir bereits einen Titel extrahiert haben
        if (acc.includes('TITEL:') && !acc.includes('\n\n')) {
          // Noch nicht vollständig extrahiert, warte weiter
          setContent(acc)
        } else if (acc.startsWith('TITEL:')) {
          // Titel-Zeile vorhanden, extrahiere sie
          const firstDoubleNewline = acc.indexOf('\n\n')
          if (firstDoubleNewline !== -1) {
            const titleLine = acc.substring(0, firstDoubleNewline)
            const contentAfterTitle = acc.substring(firstDoubleNewline + 2)
            
            // Extrahiere den Titel (Text nach "TITEL: ")
            const titleMatch = titleLine.match(/^TITEL:\s*(.+)$/)
            if (titleMatch && titleMatch[1]) {
              setTopic(titleMatch[1].trim())
            }
            
            // Zeige nur den Content nach der Titel-Zeile
            setContent(contentAfterTitle)
          } else {
            // Noch nicht vollständig, zeige alles
            setContent(acc)
          }
        } else {
          // Kein Titel, zeige wie vorher
          setContent(acc)
        }
      }, signal)
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
    const prevContent = content
    setContent('')

    try {
      const { response, signal } = await callGenerateStream({
        previousContent: prevContent,
        refinementRequest: req,
      })
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        
        // Prüfe ob wir bereits einen Titel extrahiert haben
        if (acc.includes('TITEL:') && !acc.includes('\n\n')) {
          // Noch nicht vollständig extrahiert, warte weiter
          setContent(acc)
        } else if (acc.startsWith('TITEL:')) {
          // Titel-Zeile vorhanden, extrahiere sie
          const firstDoubleNewline = acc.indexOf('\n\n')
          if (firstDoubleNewline !== -1) {
            const titleLine = acc.substring(0, firstDoubleNewline)
            const contentAfterTitle = acc.substring(firstDoubleNewline + 2)
            
            // Extrahiere den Titel (Text nach "TITEL: ")
            const titleMatch = titleLine.match(/^TITEL:\s*(.+)$/)
            if (titleMatch && titleMatch[1]) {
              setTopic(titleMatch[1].trim())
            }
            
            // Zeige nur den Content nach der Titel-Zeile
            setContent(contentAfterTitle)
          } else {
            // Noch nicht vollständig, zeige alles
            setContent(acc)
          }
        } else {
          // Kein Titel, zeige wie vorher
          setContent(acc)
        }
      }, signal)
      setRefinement('')
    } catch (err) {
      if (err.name !== 'AbortError') {
        setGenError(err.message ?? String(err))
        setContent(prevContent)
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

    const { data: lesson, error: insErr } = await supabase
      .from('lessons')
      .upsert({
        ...(savedLessonId ? { id: savedLessonId } : {}),
        class_id: activeClass.id,
        curriculum_unit_id: slot.unit.id,
        position: slot.slotIndex + 1,
        title: topic.trim() || `Stunde ${slot.slotIndex + 1}`,
        content: content.trim(),
      }, { onConflict: 'id' })
      .select()
      .single()

    setSaving(false)
    if (insErr) { setSaveError(insErr.message); return }
    setSavedLessonId(lesson.id)
    setLessonStatus(lesson.status ?? 'planned')
    setSaveSuccess('Stunde gespeichert.')
    onLessonSaved?.(lesson)
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
    const { data, error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', savedLessonId)

    console.log('DELETE response - data:', data, 'error:', error)

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

  async function suggestMaterials() {
    if (!content.trim() || !activeClass) return
    setMaterialsLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Nicht eingeloggt.')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/functions/v1/suggest-materials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          lessonContent: content,
          lessonTitle: topic,
          subject: activeClass.subject,
          grade: activeClass.grade,
          schoolType: activeClass.school_type,
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(
          `Material-Vorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
        )
      }

      const result = await response.json()
      setMaterials(result.materials)
    } catch (err) {
      console.error('suggestMaterials error:', err)
      setGenError(err instanceof Error ? err.message : 'Fehler beim Laden der Materialvorschläge')
    } finally {
      setMaterialsLoading(false)
    }
  }

  async function suggestLearning() {
    if (!content.trim() || !activeClass) return
    setLearningLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Nicht eingeloggt.')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/functions/v1/suggest-learning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          lessonContent: content,
          lessonTitle: topic,
          subject: activeClass.subject,
          grade: activeClass.grade,
          schoolType: activeClass.school_type,
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(
          `Fortbildungsvorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
        )
      }

      const result = await response.json()
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
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) return

      const { data: progressData } = await supabase
        .from('learning_progress')
        .select('resource_title')
        .eq('user_id', userId)
        .eq('lesson_id', savedLessonId)

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
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) throw new Error('Nicht eingeloggt')

      // Insert in learning_progress
      const { error: insertError } = await supabase
        .from('learning_progress')
        .insert({
          user_id: userId,
          lesson_id: savedLessonId,
          resource_title: resource.title,
          resource_type: resource.typ,
          xp_earned: resource.xp,
        })

      if (insertError) throw insertError

      // Update profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('total_xp')
        .eq('id', userId)
        .single()

      if (profileData) {
        const newTotal = (profileData.total_xp || 0) + resource.xp
        await supabase
          .from('profiles')
          .update({ total_xp: newTotal })
          .eq('id', userId)
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

  console.log('[LessonWorkspace Render] savedLessonId:', savedLessonId, 'isStreaming:', isStreaming, 'hasContent:', hasContent)

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
             onClick={() => {
               if (!materials) {
                 suggestMaterials()
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
                 suggestLearning()
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
          {isStreaming && !hasContent && (
            <div className="loading-indicator">
              <span className="spinner" />
              <span>Stunde wird generiert…</span>
            </div>
          )}
          {hasContent && (
            <pre className="workspace-content">
              {content}
              {isStreaming && <span className="caret">▍</span>}
            </pre>
          )}
        </div>
      )}

       {hasContent && !isStreaming && (
         <div className="workspace-save-row">
           <button
             className="btn-primary"
             type="button"
             onClick={handleSave}
             disabled={saving}
           >
             {saving ? 'Speichert…' : '💾 Stunde speichern'}
           </button>
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
                   suggestMaterials()
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
              {materialsLoading ? (
                <div className="materials-loading">
                  <div className="spinner"></div>
                  <p>Materialien werden vorgeschlagen…</p>
                </div>
              ) : !materials ? (
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
              {learningLoading ? (
                <div className="learning-loading">
                  <div className="spinner"></div>
                  <p>Ressourcen werden vorgeschlagen…</p>
                </div>
              ) : !learningResources || learningResources.length === 0 ? (
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
