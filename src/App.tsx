import React, { useState } from 'react'
import { Header } from './components/Header'
import { NewOrderForm } from './components/NewOrderForm'
import { Dashboard } from './components/Dashboard'
import { Kanban } from './components/Kanban'
import { AlertsListener } from './components/AlertsListener'
import { Settings } from './components/Settings'
import { useLang } from './components/LangProvider'
import { BottomNavigation } from './components/BottomNavigation'
import { ExpensesPage } from './components/ExpensesPage'

export default function App() {
  const { lang } = useLang()
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales')

  React.useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  }, [lang])

  return (
    <div className="app" style={{ paddingBottom: '60px' }}> {/* Add padding for bottom nav */}
      <AlertsListener />

      {activeTab === 'sales' ? (
        <>
          <Header />
          <main className="container">
            <section id="new-order">
              <NewOrderForm />
            </section>
            <section id="kanban">
              <Kanban />
            </section>
            <Dashboard />
            <Settings />
          </main>
        </>
      ) : (
        <>
          {/* Reuse Header or create a simplified one? User didn't specify. Keeping Header seems safe for lang switch etc. */}
          <Header />
          <ExpensesPage />
        </>
      )}

      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}
