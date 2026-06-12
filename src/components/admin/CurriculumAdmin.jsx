import { useCallback, useEffect, useState } from 'react'
import {
  getCurriculumUnits,
  updateCurriculumUnit,
  deleteCurriculumUnit,
  deleteCurriculumUnitsBySubject,
  updateClass,
} from '../../lib/db'
import { useClasses } from '../../context/ClassesContext'
import {
  generateCurriculumForClass,
  monthLabel,
} from '../../lib/curriculum'
import { importCurriculum } from '../../lib/api'
import { SUBJECTS_BY_TYPE } from '../../lib/schoolTypes'
import './AdminTables.css'

const MONTH_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} – ${monthLabel(i + 1)}`,
}))

// ─── Lehrplan-Sektion pro Fach ────────────────────────────────────────────────

function SubjectCurriculumSection({ cls, subject }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({})

  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState(null)
  const [regenSuccess, setRegenSuccess] = useState(null)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSuccess, setImportSuccess] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await getCurriculumUnits(cls.id, subject)
    if (err) {
      setError(err.message)
      setUnits([])
    } else {
      setUnits(data ?? [])
    }
    setLoading(false)
  }, [cls.id, subject])

  useEffect(() => { load() }, [load])

  function startEdit(u) {
    setEditId(u.id)
    setEditValues({
      title: u.title,
      description: u.description ?? '',
      estimated_hours: u.estimated_hours,
      start_month: u.start_month,
      end_month: u.end_month,
    })
  }

  function cancelEdit() { setEditId(null); setEditValues({}) }

  async function saveEdit() {
    const payload = {
      title: editValues.title.trim(),
      description: editValues.description.trim(),
      estimated_hours: Number(editValues.estimated_hours),
      start_month: Number(editValues.start_month),
      end_month: Number(editValues.end_month),
    }
    const { data, error: updErr } = await updateCurriculumUnit(editId, payload)
    if (updErr) { alert(updErr.message); return }
    setUnits((prev) => prev.map((u) => (u.id === data.id ? { ...u, ...data } : u)))
    cancelEdit()
  }

  async function deleteUnit(u) {
    if (!confirm(`Einheit „${u.title}" wirklich löschen?`)) return
    const { error: delErr } = await deleteCurriculumUnit(u.id)
    if (delErr) { alert(delErr.message); return }
    setUnits((prev) => prev.filter((x) => x.id !== u.id))
  }

  async function regenerate(skipConfirm = false) {
    if (
      !skipConfirm &&
      units.length > 0 &&
      !confirm(`Lehrplan für „${subject}" in „${cls.name}" neu generieren? Bestehende Einheiten werden gelöscht.`)
    ) return

    setRegenerating(true); setRegenError(null); setRegenSuccess(null)
    try {
      if (units.length > 0) {
        const { error: delErr } = await deleteCurriculumUnitsBySubject(cls.id, subject)
        if (delErr) throw new Error(delErr.message)
      }
      await generateCurriculumForClass(cls, subject)
      await load()
      setRegenSuccess('Lehrplan neu generiert.')
    } catch (err) {
      setRegenError(err.message ?? String(err))
    } finally {
      setRegenerating(false)
    }
  }

  async function handleImport() {
    if (!importText.trim()) return
    if (
      units.length > 0 &&
      !confirm(`Bestehende Einheiten für „${subject}" werden durch den Import ersetzt. Fortfahren?`)
    ) return

    setImporting(true); setImportError(null); setImportSuccess(null)
    try {
      const result = await importCurriculum({
        classId: cls.id,
        rawText: importText.trim(),
        subject,
      })
      await load()
      setImportSuccess(`${result.count} Einheiten importiert.`)
      setImportText('')
      setShowImport(false)
    } catch (err) {
      setImportError(err.message ?? String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="card-row">
        <div>
          <h2>{subject}</h2>
          <p className="card-subtitle">
            {cls.name} · Jg. {cls.grade} · {units.length} Einheit{units.length !== 1 ? 'en' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setShowImport((v) => !v); setImportError(null) }}
            disabled={regenerating || importing}
          >
            Eigenen importieren
          </button>
          {units.length > 0 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => regenerate(false)}
              disabled={regenerating || importing}
            >
              {regenerating ? 'Generiert…' : 'Neu generieren'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => regenerate(true)}
              disabled={regenerating || importing}
            >
              {regenerating ? 'Generiert…' : 'Lehrplan generieren'}
            </button>
          )}
        </div>
      </div>

      {/* Import-Bereich */}
      {showImport && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #666)', margin: 0 }}>
            Kopiere deinen Lehrplan für <strong>{subject}</strong> aus einem PDF, Word-Dokument oder einer Website und füge ihn hier ein.
          </p>
          <textarea
            rows={7}
            placeholder={`z.B.: 1. Quadratische Funktionen (10 Std., September–Oktober)\n2. Lineare Gleichungssysteme (8 Std., November)\n…`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            disabled={importing}
            style={{ fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleImport}
              disabled={importing || !importText.trim()}
            >
              {importing ? 'Wird importiert…' : 'Importieren'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setShowImport(false); setImportText(''); setImportError(null) }}
              disabled={importing}
            >
              Abbrechen
            </button>
          </div>
          {importError && <div className="alert error">{importError}</div>}
        </div>
      )}

      {importing && (
        <div className="loading-indicator" style={{ marginTop: 8 }}>
          <span className="spinner" /><span>Lehrplan wird aus Text extrahiert…</span>
        </div>
      )}
      {importSuccess && <div className="alert success" style={{ marginTop: 8 }}>{importSuccess}</div>}
      {regenerating && (
        <div className="loading-indicator" style={{ marginTop: 8 }}>
          <span className="spinner" /><span>Lehrplan wird generiert…</span>
        </div>
      )}
      {regenError && <div className="alert error" style={{ marginTop: 8 }}>{regenError}</div>}
      {regenSuccess && <div className="alert success" style={{ marginTop: 8 }}>{regenSuccess}</div>}

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && units.length === 0 && !regenerating && !importing && (
        <p className="empty-state" style={{ marginTop: 8 }}>
          Noch kein Lehrplan für {subject}. Generieren oder eigenen Text importieren.
        </p>
      )}

      {units.length > 0 && (
        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>#</th><th>Titel</th><th>Beschreibung</th>
              <th>Std.</th><th>Start</th><th>Ende</th>
              <th className="admin-table-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const isEditing = editId === u.id
              return (
                <tr key={u.id}>
                  <td>{u.position}</td>
                  {isEditing ? (
                    <>
                      <td><input value={editValues.title}
                        onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))} /></td>
                      <td><textarea rows={2} value={editValues.description}
                        onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))} /></td>
                      <td><input type="number" min={1} value={editValues.estimated_hours} className="num-input"
                        onChange={(e) => setEditValues((v) => ({ ...v, estimated_hours: e.target.value }))} /></td>
                      <td>
                        <select value={editValues.start_month}
                          onChange={(e) => setEditValues((v) => ({ ...v, start_month: e.target.value }))}>
                          {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={editValues.end_month}
                          onChange={(e) => setEditValues((v) => ({ ...v, end_month: e.target.value }))}>
                          {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </td>
                      <td className="admin-table-actions">
                        <button type="button" className="btn-primary btn-sm" onClick={saveEdit}>Speichern</button>
                        <button type="button" className="btn-secondary" onClick={cancelEdit}>Abbrechen</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{u.title}</strong></td>
                      <td className="cell-description">{u.description ?? '—'}</td>
                      <td>{u.estimated_hours} h</td>
                      <td>{monthLabel(u.start_month)}</td>
                      <td>{monthLabel(u.end_month)}</td>
                      <td className="admin-table-actions">
                        <button type="button" className="btn-secondary" onClick={() => startEdit(u)}>Bearbeiten</button>
                        <button type="button" className="btn-danger" onClick={() => deleteUnit(u)}>Löschen</button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

export default function CurriculumAdmin() {
  const { activeClass, updateClass: updateClassInContext } = useClasses()

  const [showAddSubject, setShowAddSubject] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [addingSubject, setAddingSubject] = useState(false)
  const [addSubjectError, setAddSubjectError] = useState(null)

  if (!activeClass) {
    return (
      <div className="card">
        <p className="empty-state">Bitte erst eine Klasse in der Sidebar auswählen.</p>
      </div>
    )
  }

  const subjects = activeClass.subjects?.length
    ? activeClass.subjects
    : activeClass.subject
    ? [activeClass.subject]
    : []

  // Verfügbare Fächer die noch nicht hinzugefügt wurden
  const availableSubjects = (SUBJECTS_BY_TYPE[activeClass.school_type] ?? [])
    .filter((s) => !subjects.includes(s))

  async function handleAddSubject(e) {
    e.preventDefault()
    if (!newSubject) return
    setAddingSubject(true); setAddSubjectError(null)
    const updatedSubjects = [...subjects, newSubject]
    const { data, error } = await updateClass(activeClass.id, {
      name: activeClass.name,
      school_type: activeClass.school_type,
      subjects: updatedSubjects,
      grade: activeClass.grade,
      state: activeClass.state,
    })
    if (error) { setAddSubjectError(error.message); setAddingSubject(false); return }
    updateClassInContext(data)
    setNewSubject('')
    setShowAddSubject(false)
    setAddingSubject(false)
  }

  return (
    <div className="admin-block">
      {subjects.map((subject) => (
        <SubjectCurriculumSection
          key={`${activeClass.id}-${subject}`}
          cls={activeClass}
          subject={subject}
        />
      ))}

      {/* Fach hinzufügen */}
      {!showAddSubject ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => { setShowAddSubject(true); setAddSubjectError(null) }}
        >
          + Fach anlegen
        </button>
      ) : (
        <section className="card">
          <h2>Fach anlegen</h2>
          <form onSubmit={handleAddSubject} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {availableSubjects.length > 0 ? (
              <select
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                required
                style={{ minWidth: 200 }}
              >
                <option value="">Fach wählen…</option>
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <p className="empty-state" style={{ margin: 0 }}>
                Alle Fächer für diesen Schultyp bereits angelegt.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {availableSubjects.length > 0 && (
                <button type="submit" className="btn-primary" disabled={addingSubject || !newSubject}>
                  {addingSubject ? 'Wird hinzugefügt…' : 'Hinzufügen'}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowAddSubject(false); setNewSubject(''); setAddSubjectError(null) }}
              >
                Abbrechen
              </button>
            </div>
            {addSubjectError && <div className="alert error" style={{ width: '100%' }}>{addSubjectError}</div>}
          </form>
        </section>
      )}
    </div>
  )
}
