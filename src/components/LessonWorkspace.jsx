/**
 * LessonWorkspace – Arbeitsbereich für einen Slot
 *
 * Props:
 *   activeClass   – Klassen-Objekt
 *   slot          – { unit, slotIndex, lesson | null } oder null
 *   onLessonSaved – fn(lesson)
 */
import { useEffect, useState } from 'react'
import {
  getStudents as getStudentsDb,
  getCurriculumUnits,
  getLearningProgressByLesson,
  createLearningProgress,
  getProfile,
  updateProfile,
} from '../lib/db'
import { getSession } from '../lib/auth'
import { suggestMaterials, suggestLearning } from '../lib/api'
import { useLessonSave } from '../hooks/useLessonSave'
import { useLessonStream } from '../hooks/useLessonStream'
import LessonRenderer from './LessonRenderer'
import MaterialsModal from './MaterialsModal'
import LearningModal from './LearningModal'
import StartModal from './StartModal'
import './LessonWorkspace.css'

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function LessonWorkspace({ activeClass, slot, onLessonSaved }) {
  const [topic, setTopic] = useState('')
  const [content, setContent] = useState('')
  const [students, setStudents] = useState([])
  const [topicSuggestions, setTopicSuggestions] = useState([])
  const [materials, setMaterials] = useState(null)
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [showMaterialsModal, setShowMaterialsModal] = useState(false)
  const [learningResources, setLearningResources] = useState(null)
  const [learningLoading, setLearningLoading] = useState(false)
  const [showLearningModal, setShowLearningModal] = useState(false)
  const [viewedResources, setViewedResources] = useState(new Set())
  const [viewingResourceId, setViewingResourceId] = useState(null)
  const [showStartModal, setShowStartModal] = useState(false)

  const {
    savedLessonId, lessonStatus,
    saving, saveError, saveSuccess,
    autoSaving, autoSaveError, wasAutoSaved,
    hasUnsavedRefinement, setHasUnsavedRefinement,
    handleSave, handleAutoSave, handleDelete,
    reset: resetSave,
  } = useLessonSave({ activeClass, slot, topic, content, onLessonSaved })

  const {
    parsedLesson, setParsedLesson,
    partialLesson,
    generating,
    genError, setGenError,
    refinement, setRefinement,
    refining,
    topicSuggesting,
    aiSuggestions, setAiSuggestions,
    handleGenerate,
    handleRefine,
    handleAbort,
    suggestTopic,
    resetStream,
    parseLessonContent,
  } = useLessonStream({ activeClass, slot, topic, students, content, setContent, handleAutoSave, setHasUnsavedRefinement, resetSave })

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

  // JSON-Parser: content → parsedLesson (content kommt aus dem Hook, parsedLesson auch)
  useEffect(() => {
    setParsedLesson(content.trim() ? parseLessonContent(content) : null)
  }, [content]) // eslint-disable-line

  // Klassenwechsel: alles zurücksetzen
  useEffect(() => {
    setTopic('')
    resetStream()
    resetSave()
  }, [activeClass?.id]) // eslint-disable-line

  // Slot wechselt: Felder zurücksetzen / vorbelegen
  useEffect(() => {
    resetStream()
    resetSave()

    if (!slot) return

    const { lesson } = slot

    if (lesson) {
      setTopic(lesson.title ?? '')
      setContent(lesson.content ?? '')  // Setzt content → trigger Parser-useEffect
      resetSave({ lessonId: lesson.id, status: lesson.status ?? 'planned' })
    } else {
      setTopic('')
      suggestTopic()
    }
  }, [slot]) // eslint-disable-line

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
        <MaterialsModal
          materials={materials}
          onClose={() => setShowMaterialsModal(false)}
        />
      )}

      {showLearningModal && (
        <LearningModal
          learningResources={learningResources}
          viewedResources={viewedResources}
          viewingResourceId={viewingResourceId}
          onMarkViewed={markAsViewed}
          onClose={() => setShowLearningModal(false)}
        />
      )}

      {showStartModal && (
        <StartModal
          lessonId={savedLessonId}
          onClose={() => setShowStartModal(false)}
        />
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
