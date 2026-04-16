/**
 * AppTabs — top navigation bar for Vigil
 */

const TABS = [
  { id: 'monitor',  label: 'Monitor'  },
  { id: 'services', label: 'Services' },
  { id: 'config',   label: 'Config',  adminOnly: true, icon: '⚙' },
];

export default function AppTabs({ active, onSelect, isAdmin }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'stretch',
      background:     '#15151f',
      borderBottom:   '1px solid #2a2a3e',
      flexShrink:     0,
      height:         '40px',
      userSelect:     'none',
    }}>
      {/* Brand */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        padding:     '0 18px 0 14px',
        borderRight: '1px solid #2a2a3e',
        marginRight: '6px',
      }}>
        {/* Vigil "eye" icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="12" cy="12" rx="10" ry="6" stroke="#5599ff" strokeWidth="1.8"/>
          <circle cx="12" cy="12" r="3" fill="#5599ff"/>
          <circle cx="12" cy="12" r="1.2" fill="#15151f"/>
        </svg>
        <span style={{ color: '#e8e8f0', fontSize: '13px', fontWeight: '700', letterSpacing: '1.5px' }}>
          VIGIL
        </span>
        <span style={{ color: '#444466', fontSize: '10px', fontWeight: '400', letterSpacing: '0.5px', marginTop: '1px' }}>
          OPS MONITOR
        </span>
      </div>

      {/* Tabs */}
      {TABS
        .filter(t => !t.adminOnly || isAdmin)
        .map(t => {
          const isActive = t.id === active;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '5px',
                padding:      '0 18px',
                cursor:       'pointer',
                fontSize:     '12px',
                fontWeight:   isActive ? '600' : '400',
                color:        isActive ? '#ffffff' : '#7777aa',
                borderBottom: isActive ? '2px solid #5599ff' : '2px solid transparent',
                transition:   'color 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#bbbbdd'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#7777aa'; }}
            >
              {t.icon && <span style={{ fontSize: '11px' }}>{t.icon}</span>}
              {t.label}
            </div>
          );
        })
      }
    </div>
  );
}
