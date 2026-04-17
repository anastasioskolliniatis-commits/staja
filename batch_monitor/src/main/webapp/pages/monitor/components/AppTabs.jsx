/**
 * AppTabs — top navigation bar for Vigil
 */

const TABS = [
  { id: 'monitor',  label: 'Monitor'  },
  { id: 'services', label: 'Services' },
  { id: 'alerts',   label: 'Alerts',  icon: '🔔' },
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
        {/* Straja — watchtower icon */}
        <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          {/* Tower silhouette with battlements */}
          <path
            d="M4 19 L4 7 L4 3 L7 3 L7 7 L8.5 7 L8.5 3 L11.5 3 L11.5 7 L13 7 L13 3 L16 3 L16 7 L16 19 Z"
            fill="#5599ff"
          />
          {/* Arched window */}
          <rect x="8.6" y="8.8" width="2.8" height="3.2" rx="1.4" fill="#15151f"/>
          {/* Arched door (cutout to bottom) */}
          <path d="M8.2 19.5 L8.2 15 Q8.2 13 10 13 Q11.8 13 11.8 15 L11.8 19.5 Z" fill="#15151f"/>
        </svg>
        <span style={{ color: '#e8e8f0', fontSize: '13px', fontWeight: '700', letterSpacing: '1.5px' }}>
          STRAJA
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
