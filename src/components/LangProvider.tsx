import React from 'react'
import { db } from '@/firebase'
import { onValue, ref, update } from 'firebase/database'

type Lang = 'ar' | 'en'

interface LangContextType {
  lang: Lang
  setLang: (l: Lang) => void
  t: (ar: string, en: string) => string
}

const LangContext = React.createContext<LangContextType>({
  lang: 'ar',
  setLang: () => {},
  t: (ar) => ar,
})

export const useLang = () => React.useContext(LangContext)

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from localStorage on mount (survives crash/reload).
  // Fallback to 'en' as default (user prefers English).
  const [lang, setLangState] = React.useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('app-lang') as Lang | null
      return saved === 'ar' || saved === 'en' ? saved : 'en'
    } catch {
      return 'en'
    }
  })

  // Sync with Firebase on mount (read current setting from DB).
  // This allows multi-device sync but respects localStorage if DB is slow.
  React.useEffect(() => {
    const off = onValue(ref(db, 'settings/lang'), (snap) => {
      const v = snap.val() as Lang | undefined
      const newLang = v === 'ar' || v === 'en' ? v : 'en'
      setLangState(newLang)
      // Update localStorage whenever DB changes
      try {
        localStorage.setItem('app-lang', newLang)
      } catch {}
    })
    return () => off()
  }, [])

  const setLang = async (l: Lang) => {
    // Save to localStorage immediately (survives crash before DB sync)
    try {
      localStorage.setItem('app-lang', l)
    } catch {}
    // Then sync to Firebase for multi-device consistency
    await update(ref(db), { 'settings/lang': l })
  }

  const t = (ar: string, en: string) => (lang === 'en' ? en : ar)

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}
