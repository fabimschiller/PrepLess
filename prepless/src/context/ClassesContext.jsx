import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'prepless.activeClassId'

const ClassesContext = createContext(null)

export function ClassesProvider({ children }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeClassId, setActiveClassIdState] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(STORAGE_KEY) ?? null
  })

  const setActiveClassId = useCallback((id) => {
    setActiveClassIdState(id)
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const loadClasses = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('classes')
      .select('id, name, subject, grade, state, created_at')
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
      setClasses([])
    } else {
      setClasses(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadClasses()
  }, [loadClasses])

  // Wenn aktive Klasse nicht (mehr) existiert: zur erstgeladenen fallen
  useEffect(() => {
    if (loading) return
    if (classes.length === 0) {
      if (activeClassId) setActiveClassId(null)
      return
    }
    const exists = classes.some((c) => c.id === activeClassId)
    if (!exists) setActiveClassId(classes[0].id)
  }, [classes, loading, activeClassId, setActiveClassId])

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId]
  )

  const value = useMemo(
    () => ({
      classes,
      loading,
      error,
      activeClassId,
      activeClass,
      setActiveClassId,
      reloadClasses: loadClasses,
      addClass: (cls) => setClasses((prev) => [cls, ...prev]),
      updateClass: (cls) =>
        setClasses((prev) => prev.map((c) => (c.id === cls.id ? cls : c))),
      removeClass: (id) =>
        setClasses((prev) => prev.filter((c) => c.id !== id)),
    }),
    [classes, loading, error, activeClassId, activeClass, setActiveClassId, loadClasses]
  )

  return (
    <ClassesContext.Provider value={value}>{children}</ClassesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClasses() {
  const ctx = useContext(ClassesContext)
  if (!ctx) {
    throw new Error('useClasses muss innerhalb von <ClassesProvider> verwendet werden.')
  }
  return ctx
}
