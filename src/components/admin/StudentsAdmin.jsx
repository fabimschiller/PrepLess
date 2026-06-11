import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useClasses } from '../../context/ClassesContext'
import './AdminTables.css'

export default function StudentsAdmin() {
  const { activeClass } = useClasses()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({ name: '', notes: '' })

  const load = useCallback(async () => {
    if (!activeClass?.id) {
      setStudents([])
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('students')
      .select('id, class_id, name, notes, created_at')
      .eq('class_id', activeClass.id)
      .order('name', { ascending: true })
    if (err) {
      setError(err.message)
      setStudents([])
    } else {
      setStudents(data ?? [])
    }
    setLoading(false)
  }, [activeClass?.id])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    if (!activeClass?.id) return
    const name = newName.trim()
    if (!name) return

    setAdding(true)
    setError(null)
    const { data, error: insErr } = await supabase
      .from('students')
      .insert({
        class_id: activeClass.id,
        name,
        notes: newNotes.trim() || null,
      })
      .select()
      .single()
    setAdding(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    setStudents((prev) =>
      [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    )
    setNewName('')
    setNewNotes('')
  }

  function startEdit(s) {
    setEditId(s.id)
    setEditValues({ name: s.name, notes: s.notes ?? '' })
  }

  function cancelEdit() {
    setEditId(null)
    setEditValues({ name: '', notes: '' })
  }

  async function saveEdit() {
    const { data, error: updErr } = await supabase
      .from('students')
      .update({
        name: editValues.name.trim(),
        notes: editValues.notes.trim() || null,
      })
      .eq('id', editId)
      .select()
      .single()
    if (updErr) {
      alert(updErr.message)
      return
    }
    setStudents((prev) =>
      prev
        .map((s) => (s.id === data.id ? data : s))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    )
    cancelEdit()
  }

  async function deleteStudent(s) {
    if (!confirm(`Schüler "${s.name}" wirklich löschen?`)) return
    const { error: delErr } = await supabase
      .from('students')
      .delete()
      .eq('id', s.id)
    if (delErr) {
      alert(delErr.message)
      return
    }
    setStudents((prev) => prev.filter((x) => x.id !== s.id))
  }

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
      <section className="card">
        <h2>Schüler hinzufügen – {activeClass.name}</h2>
        <form className="form" onSubmit={handleAdd}>
          <div className="admin-form-row">
            <div className="field">
              <label htmlFor="newName">Name</label>
              <input
                id="newName"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name des Schülers"
                required
              />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="newNotes">Notiz (optional)</label>
              <input
                id="newNotes"
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="z.B. Brille, sitzt links vorn"
              />
            </div>
          </div>
          {error && <div className="alert error">{error}</div>}
          <button
            className="btn-primary"
            type="submit"
            disabled={adding || !newName.trim()}
          >
            {adding ? 'Fügt hinzu…' : 'Hinzufügen'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Schüler in dieser Klasse</h2>
        {loading && <p className="empty-state">Lädt…</p>}
        {!loading && students.length === 0 && (
          <p className="empty-state">Noch keine Schüler.</p>
        )}

        {students.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Notiz</th>
                <th className="admin-table-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const isEditing = editId === s.id
                return (
                  <tr key={s.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            value={editValues.name}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                name: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={editValues.notes}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                notes: e.target.value,
                              }))
                            }
                          />
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
                          <strong>{s.name}</strong>
                        </td>
                        <td>{s.notes ?? <span className="muted">—</span>}</td>
                        <td className="admin-table-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startEdit(s)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => deleteStudent(s)}
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
