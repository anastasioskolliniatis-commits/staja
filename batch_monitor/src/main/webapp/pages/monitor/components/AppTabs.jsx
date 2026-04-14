/**
 * AppTabs — top-level navigation bar for Batch Monitor
 * Tabs: Monitor | Services | Config (admin only)
 */

const TABS = [
  { id: 'monitor',  label: 'Monitor'  },
  { id: 'services', label: 'Services' },
  { id: 'config',   label: 'Config \u2699', adminOnly: true },
];

export default function AppTabs({ active, onSelect, isAdmin }) {
  return (
    <div style={{
      display: 'flex',
      background: '#1a1a2a',
      borderBottom: '1px solid #3a3a5a',
      flexShrink: 0,
    }}>
      {TABS
        .filter(t => !t.adminOnly || isAdmin)
        .map(t => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                padding: '9px 22px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '400',
                color: isActive ? '#ffffff' : '#8888aa',
                borderBottom: isActive ? '2px solid #5599ff' : '2px solid transparent',
                userSelect: 'none',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </div>
          );
        })
      }
    </div>
  );
}
