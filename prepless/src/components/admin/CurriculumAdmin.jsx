import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  generateCurriculumForClass,
  monthLabel,
} from '../../lib/curriculum'
import './AdminTables.css'

const MONTH_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} – ${monthLabel(i + 1)}`,
}))

export default function CurriculumAdmin({ activeClass }) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({})

  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState(null)
  const [regenSuccess, setRegenSuccess] = useState(null)

  const load = useCallback(async () => {
    if (!activeClass?.id) {
      setUnits([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('curriculum_units')
      .select(
        'id, class_id, position, title, description, estimated_hours, start_month, end_month'
      )
      .eq('class_id', activeClass.id)
      .order('position', { ascending: true })
    if (err) {
      setError(err.message)
      setUnits([])
    } else {
      setUnits(data ?? [])
    }
    setLoading(false)
  }, [activeClass?.id])

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
    const { data, error: updErr } = await supabase
      .from('curriculum_units')
      .update(payload)
      .eq('id', editId)
      .select()
      .single()
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
    if (!confirm(`Einheit "${u.title}" wirklich löschen?`)) return
    const { error: delErr } = await supabase
      .from('curriculum_units')
      .delete()
      .eq('id', u.id)
    if (delErr) {
      alert(delErr.message)
      return
    }
    setUnits((prev) => prev.filter((x) => x.id !== u.id))
  }

  async function regenerate() {
    if (!activeClass) return
    if (
      !confirm(
        'Lehrplan neu generieren? Alle bestehenden Einheiten dieser Klasse werden gelöscht.'
      )
    ) {
      return
    }
    setRegenerating(true)
    setRegenError(null)
    setRegenSuccess(null)
    try {
      const { error: delErr } = await supabase
        .from('curriculum_units')
        .delete()
        .eq('class_id', activeClass.id)
      if (delErr) throw new Error(delErr.message)

      await generateCurriculumForClass(activeClass)
      await load()
      setRegenSuccess('Lehrplan neu generiert.')
    } catch (err) {
      setRegenError(err.message ?? String(err))
    } finally {
      setRegenerating(false)
    }
  }

  if (!activeClass) {
    return (
      <div className="card">
        <p className="empty-state">
          Bitte zuerst in der Topbar (Seite „Unterricht") eine Klasse aktiv
          setzen.
        </p>
      </div>
    )
  }

  return (
    <div className="admin-block">
      <section className="card">
        <div className="card-row">
          <div>
            <h2>Lehrplan – {activeClass.name}</h2>
            <p className="card-subtitle">
              {activeClass.subject} · Jahrgang {activeClass.grade} ·{' '}
              {activeClass.state}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={regenerate}
            disabled={regenerating}
          >
            {regenerating ? 'Generiert…' : 'Lehrplan neu generieren'}
          </button>
        </div>

        {regenerating && (
          <div className="loading-indicator">
            <span className="spinner" />
            <span>Lehrplan wird generiert…</span>
          </div>
        )}
        {regenError && <div className="alert error">{regenError}</div>}
        {regenSuccess && <div className="alert success">{regenSuccess}</div>}

        {loading && <p className="empty-state">Lädt…</p>}
        {error && <div className="alert error">{error}</div>}
        {!loading && units.length === 0 && (
          <p className="empty-state">
            Noch kein Lehrplan vorhanden. Klick rechts oben auf „Lehrplan neu
            generieren".
          </p>
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
    </div>
  )
}
