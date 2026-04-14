import { useState } from 'react';
import TreeQuerySection  from './TreeQuerySection';
import ServicesSection   from './ServicesSection';
import MappingsSection   from './MappingsSection';

const SECTIONS = [
  { id: 'tree',     label: 'Tree Query' },
  { id: 'services', label: 'Services'   },
  { id: 'mappings', label: 'Mappings'   },
];

export default function ConfigTab() {
  const [section, setSection] = useState('tree');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#1e1e1e' }}>

      {/* Sub-nav */}
      <div style={{
        display: 'flex',
        background: '#212130',
        borderBottom: '1px solid #3a3a5a',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        {SECTIONS.map(s => {
          const active = s.id === section;
          return (
            <div
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                padding: '9px 18px',
                cursor: 'pointer',
                fontSize: '12px',
                color: active ? '#ffffff' : '#7777aa',
                borderBottom: active ? '2px solid #5599ff' : '2px solid transparent',
                userSelect: 'none',
              }}
            >
              {s.label}
            </div>
          );
        })}
      </div>

      {/* Section body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        {section === 'tree'     && <TreeQuerySection />}
        {section === 'services' && <ServicesSection  />}
        {section === 'mappings' && <MappingsSection  />}
      </div>
    </div>
  );
}
