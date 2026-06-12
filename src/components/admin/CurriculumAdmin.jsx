import { useCallback, useEffect, useState } from 'react'
import {
  getCurriculumUnits,
  updateCurriculumUnit,
  deleteCurriculumUnit,
  deleteCurriculumUnitsByClass,
} from '../../lib/db'
import { useClasses } from '../../context/ClassesContext'
import {
  generateCurriculumForClass,
  monthLabel,
} from '../../lib/curriculum'
import './AdminTables.css'

const MONTH_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} – ${monthLabel(i + 1)}`,
}))

// ─── Pro-Klasse-Sektion ────────────────────────────────────────────────────────

function ClassCurriculumSection({ cls }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({})

  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState(null)
  const [regenSuccess, setRegenSuccess] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await getCurriculumUnits(cls.id)
    if (err) {
      setError(err.message)
      setUnits([])
    } else {
      setUnits(data ?? [])
    }
    setLoading(false)
  }, [cls.id])

  useEffect(() => {
    load()
  }, [load])

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

  function cancelEdit() {
    setEditId(null)
    setEditValues({})
  }

  async function saveEdit() {
    const payload = {
      title: editValues.title.trim(),
      description: editValues.description.trim(),
      estimated_hours: Number(editValues.estimated_hours),
      start_month: Number(editValues.start_month),
      end_month: Number(editValues.end_month),
    }
    const { data, error: updErr } = await updateCurriculumUnit(editId, payload)
    if (updErr) {
      alert(updErr.message)
      return
    }
    setUnits((prev) =>
      prev.map((u) => (u.id === data.id ? { ...u, ...data } : u))
    )
    cancelEdit()
  }

  async function deleteUnit(u) {
    if (!confirm(`Einheit „${u.title}" wirklich löschen?`)) return
    const { error: delErr } = await deleteCurriculumUnit(u.id)
    if (delErr) {
      alert(delErr.message)
      return
    }
    setUnits((prev) => prev.filter((x) => x.id !== u.id))
  }

  async function regenerate(skipConfirm = false) {
    if (
      !skipConfirm &&
      units.length > 0 &&
      !confirm(
        `Lehrplan für „${cls.name}" neu generieren? Alle bestehenden Einheiten werden gelöscht.`
      )
    ) {
      return
    }
    setRegenerating(true)
    setRegenError(null)
    setRegenSuccess(null)
    try {
      if (units.length > 0) {
        const { error: delErr } = await deleteCurriculumUnitsByClass(cls.id)
        if (delErr) throw new Error(delErr.message)
      }
      await generateCurriculumForClass(cls)
      await load()
      setRegenSuccess('Lehrplan neu generiert.')
    } catch (err) {
      setRegenError(err.message ?? String(err))
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <section className="card">
      <div className="card-row">
        <div>
          <h2>Lehrplan – {cls.name}</h2>
          <p className="card-subtitle">
            {cls.subject} · Jahrgang {cls.grade} · {cls.state}
          </p>
        </div>
        {/* Neu-Generieren-Button nur anzeigen wenn schon Einheiten vorhanden */}
        {units.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => regenerate(false)}
            disabled={regenerating}
          >
            {regenerating ? 'Generiert…' : 'Neu generieren'}
          </button>
        )}
      </div>

      {regenerating && (
        <div className="loading-indicator" style={{ marginTop: 8 }}>
          <span className="spinner" />
          <span>Lehrplan wird generiert…</span>
        </div>
      )}
      {regenError && (
        <div className="alert error" style={{ marginTop: 8 }}>
          {regenError}
        </div>
      )}
      {regenSuccess && (
        <div className="alert success" style={{ marginTop: 8 }}>
          {regenSuccess}
        </div>
      )}

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}

      {/* Noch kein Lehrplan: prominenter Generate-Button */}
      {!loading && !error && units.length === 0 && !regenerating && (
        <div className="curriculum-empty">
          <p className="empty-state">
            Noch kein Lehrplan vorhanden für diese Klasse.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => regenerate(true)}
          >
            Lehrplan generieren
          </button>
        </div>
      )}

      {units.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Titel</th>
              <th>Beschreibung</th>
              <th>Std.</th>
              <th>Start</th>
              <th>Ende</th>
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
                      <td>
                        <input
                          value={editValues.title}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              title: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td>
                        <textarea
                          rows={2}
                          value={editValues.description}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              description: e.target.value,
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={editValues.estimated_hours}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              estimated_hours: e.target.value,
                            }))
                          }
                          className="num-input"
                        />
                      </td>
                      <td>
                        <select
                          value={editValues.start_month}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              start_month: e.target.value,
                            }))
                          }
                        >
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={editValues.end_month}
                          onChange={(e) =>
                            setEditValues((v) => ({
                              ...v,
                              end_month: e.target.value,
                            }))
                          }
                        >
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="admin-table-actions">
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={saveEdit}
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={cancelEdit}
                        >
                          Abbrechen
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <strong>{u.title}</strong>
                      </td>
                      <td className="cell-description">
                        {u.description ?? '—'}
                      </td>
                      <td>{u.estimated_hours} h</td>
                      <td>{monthLabel(u.start_month)}</td>
                      <td>{monthLabel(u.end_month)}</td>
                      <td className="admin-table-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => startEdit(u)}
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => deleteUnit(u)}
                        >
                          Löschen
                        </button>
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
  const { activeClass } = useClasses()

  if (!activeClass) {
    return (
      <div className="card">
        <p className="empty-state">
          Bitte erst eine Klasse in der Sidebar auswählen.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-block">
      <ClassCurriculumSection key={activeClass.id} cls={activeClass} />
    </div>
  )
}
