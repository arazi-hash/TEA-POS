import React from 'react'

interface BottomNavigationProps {
    activeTab: 'sales' | 'expenses'
    onTabChange: (tab: 'sales' | 'expenses') => void
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onTabChange }) => {
    const handleTabClick = (tab: 'sales' | 'expenses') => {
        if (tab === activeTab) return

        if (tab === 'expenses') {
            const pin = prompt('Enter PIN for Admin Access:')
            if (pin === '522') {
                onTabChange(tab)
            } else {
                alert('Wrong PIN')
            }
        } else {
            onTabChange(tab)
        }
    }

    return (
        <nav style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50px',
            backgroundColor: '#fff',
            borderTop: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            zIndex: 1000,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
        }}>
            <button
                onClick={() => handleTabClick('sales')}
                style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    background: activeTab === 'sales' ? '#eef2ff' : 'transparent',
                    color: activeTab === 'sales' ? '#4f46e5' : '#6b7280',
                    fontSize: '13px',
                    fontWeight: activeTab === 'sales' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px'
                }}
            >
                <span style={{ fontSize: '18px' }}>🛒</span>
                <span>Sales (POS)</span>
            </button>

            <div style={{ width: '1px', height: '24px', backgroundColor: '#ddd' }}></div>

            <button
                onClick={() => handleTabClick('expenses')}
                style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    background: activeTab === 'expenses' ? '#fef2f2' : 'transparent',
                    color: activeTab === 'expenses' ? '#ef4444' : '#6b7280',
                    fontSize: '13px',
                    fontWeight: activeTab === 'expenses' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px'
                }}
            >
                <span style={{ fontSize: '18px' }}>📊</span>
                <span>Expenses & Profit</span>
            </button>
        </nav>
    )
}
