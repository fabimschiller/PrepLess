import { useRef, useState } from 'react'
import { upsertLesson, deleteLesson } from '../lib/db'

/**
 * Kapselt die gesamte Speicher-Logik für eine Unterrichtsstunde.
 *
 * @param {Object} params
 * @param {Object}   params.activeClass  - Aktive Klasse
 * @param {Object}   params.slot         - Aktiver Slot { unit, slotIndex }
 * @param {string}   params.topic        - Aktuelles Thema
 * @param {string}   params.content      - Aktueller Lesson-Content
 * @param {Function} params.onLessonSaved - Callback nach erfolgreichem Speichern
 */
export function useLessonSave({ activeClass, slot, topic, content, onLessonSaved }) {
  const [savedLessonId, setSavedLessonId] = useState(null)
  const [lessonStatus, setLessonStatus] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveError, setAutoSaveError] = useState(null)
  const [wasAutoSaved, setWasAutoSaved] = useState(false)
  const autoSaveTimerRef = useRef(null)

  const [hasUnsavedRefinement, setHasUnsavedRefinement] = useState(false)

  // ─── Hilfsfunktion: gemeinsame Upsert-Logik ─────────────────────────
  function buildPayload(contentToSave) {
    return {
      ...(savedLessonId ? { id: savedLessonId } : {}),
      class_id: activeClass.id,
      curriculum_unit_id: slot.unit.id,
      position: slot.slotIndex + 1,
      title: topic.trim() || `Stunde ${slot.slotIndex + 1}`,
      content: contentToSave.trim(),
    }
  }

  // ─── Manuell speichern ───────────────────────────────────────────────
  async function handleSave() {
    if (!content.trim() || !activeClass || !slot) return
    setSaving(true); setSaveError(null); setSaveSuccess(null)

    const { data: lesson, error } = await upsertLesson(buildPayload(content))

    setSaving(false)
    if (error) { setSaveError(error.message); return }

    setSavedLessonId(lesson.id)
    setLessonStatus(lesson.status ?? 'planned')
    setSaveSuccess('Stunde gespeichert.')
    setHasUnsavedRefinement(false)
    onLessonSaved?.(lesson)
  }

  // ─── Auto-Save (nach Generierung) ───────────────────────────────────
  // contentToSave wird direkt übergeben weil React-State noch nicht
  // aktualisiert sein könnte wenn handleAutoSave aufgerufen wird.
  async function handleAutoSave(contentToSave) {
    const saveContent = contentToSave ?? content
    if (!saveContent.trim() || !activeClass || !slot) return
    setAutoSaving(true); setAutoSaveError(null)

    const { data: lesson, error } = await upsertLesson(buildPayload(saveContent))

    setAutoSaving(false)
    if (error) {
      setAutoSaveError(error.message)
      console.error('Auto-Save fehlgeschlagen:', error.message)
      return
    }

    setSavedLessonId(lesson.id)
    setLessonStatus(lesson.status ?? 'planned')
    setWasAutoSaved(true)
    setHasUnsavedRefinement(false)
    onLessonSaved?.(lesson)

    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => setWasAutoSaved(false), 3000)
  }

  // ─── Löschen ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!savedLessonId) return
    if (!window.confirm('Stunde wirklich löschen?')) return

    const { error } = await deleteLesson(savedLessonId)
    if (error) {
      console.error('Löschen fehlgeschlagen:', error)
      return { error }
    }

    // TODO: Später saubere Cache-Invalidierung statt reload()
    window.location.reload()
  }

  // ─── Reset (beim Slot-Wechsel) ────────────────────────────────────────
  function reset({ lessonId = null, status = null } = {}) {
    setSavedLessonId(lessonId)
    setLessonStatus(status)
    setSaveError(null)
    setSaveSuccess(null)
    setAutoSaveError(null)
    setWasAutoSaved(false)
    setHasUnsavedRefinement(false)
  }

  return {
    // State
    savedLessonId,
    lessonStatus,
    saving,
    saveError,
    saveSuccess,
    autoSaving,
    autoSaveError,
    wasAutoSaved,
    hasUnsavedRefinement,
    // Setter (für externe Kontrolle aus handleGenerate/handleRefine)
    setHasUnsavedRefinement,
    // Aktionen
    handleSave,
    handleAutoSave,
    handleDelete,
    reset,
  }
}
