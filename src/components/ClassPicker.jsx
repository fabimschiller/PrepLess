import { useEffect, useRef, useState } from 'react'
import { useClasses } from '../context/ClassesContext'
import './ClassPicker.css'

export default function ClassPicker() {
  const { classes, activeClass, setActiveClassId, loading } = useClasses()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (loading) {
    return <div className="class-picker class-picker-loading">Lädt…</div>
  }

  if (classes.length === 0) {
    return (
      <div className="class-picker class-picker-empty">
        Keine Klassen – bitte in „Konfiguration" anlegen.
      </div>
    )
  }

  return (
    <div className={`class-picker ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="class-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="class-picker-label">
          {activeClass ? (
            <>
              <span className="class-picker-name">{activeClass.name}</span>
              <span className="class-picker-meta">
                {activeClass.subject} · Jg. {activeClass.grade}
              </span>
            </>
          ) : (
            <span className="class-picker-name">Klasse wählen…</span>
          )}
        </span>
        <span className="class-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="class-picker-list" role="listbox">
          {classes.map((c) => {
            const isActive = c.id === activeClass?.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`class-picker-option ${isActive ? 'active' : ''}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveClassId(c.id)
                    setOpen(false)
                  }}
                >
                  <span className="class-picker-name">{c.name}</span>
                  <span className="class-picker-meta">
                    {c.subject} · Jg. {c.grade} · {c.state}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
