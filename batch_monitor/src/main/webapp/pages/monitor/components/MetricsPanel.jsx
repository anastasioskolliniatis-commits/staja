import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#cc7700',
  critical: '#cc0000',
  error:    '#9900cc',
  no_data:  '#445566',
  stale:    '#334455',
  unknown:  '#555555',
};

// ── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, activeTab, onSelect, onClose }) {
  return (
    <div style={{
      display:       'flex',
      background:    '#252535',
      borderBottom:  '1px solid #3a3a5a',
      flexShrink:    0,
      overflowX:     'auto',
    }}>
      {tabs.length === 0 && (
        <div style={{ padding: '7px 14px', color: '#555', fontSize: '11px' }}>Metrics</div>
      )}
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '6px',
              padding:    '6px 12px',
              cursor:     'pointer',
              background: active ? '#3a3a5c' : 'transparent',
              color:      active ? '#ffffff' : '#8888aa',
              borderRight: '1px solid #3a3a5a',
              borderBottom: active ? '2px solid #5599ff' : '2px solid transparent',
              fontSize:   '11px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {/* Status dot — spinner if loading */}
            {tab._loading ? (
              <span style={{ fontSize: '10px', color: '#888' }}>&#8987;</span>
            ) : (
              <span style={{
                width: '8px', height: '8px', borderRadius: '2px', flexShrink: 0,
                background: STATUS_COLOR[tab.status] || STATUS_COLOR.unknown,
              }} />
            )}
            {tab.label}
            <span
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{ color: '#555', marginLeft: '4px', fontSize: '14px', lineHeight: 1 }}
              title="Close"
            >
              &times;
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────
function ResultsTable({ columns, rows }) {
  const tdBase = {
    padding:       '5px 10px',
    borderBottom:  '1px solid #e8e8e8',
    color:         '#222',
    fontSize:      '12px',
    whiteSpace:    'nowrap',
  };

  if (!columns || columns.length === 0) {
    return (
      <div style={{ color: '#999', padding: '24px', fontSize: '12px' }}>
        No columns defined.
      </div>
    );
  }

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={{
              ...tdBase,
              background:     '#eaeaea',
              color:          '#444',
              fontWeight:     '600',
              textTransform:  'uppercase',
              fontSize:       '10px',
              letterSpacing:  '0.5px',
              borderBottom:   '2px solid #ccc',
              position:       'sticky',
              top:            0,
            }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ ...tdBase, color: '#aaa', textAlign: 'center', padding: '32px' }}>
              No data returned.
            </td>
          </tr>
        ) : rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f7f7f7' }}>
            {columns.map(col => {
              const val = row[col] ?? '';
              // Colour service_status values inline
              const isStatus = col === 'service_status';
              return (
                <td key={col} style={tdBase}>
                  {isStatus ? (
                    <span style={{
                      display:      'inline-block',
                      padding:      '1px 7px',
                      borderRadius: '3px',
                      fontSize:     '10px',
                      fontWeight:   '700',
                      background:   STATUS_COLOR[String(val).toLowerCase()] || '#888',
                      color:        '#fff',
                    }}>
                      {String(val).toUpperCase()}
                    </span>
                  ) : String(val)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main MetricsPanel ─────────────────────────────────────────────────────────
export default function MetricsPanel({
  openTabs, activeTab, activeNode,
  onSelectTab, onCloseTab, onRefreshTab,
}) {
  const [search, setSearch] = useState('');

  const filteredRows = activeNode && !activeNode._loading
    ? (activeNode.rows || []).filter(row =>
        !search || Object.values(row).some(v =>
          String(v).toLowerCase().includes(search.toLowerCase())
        )
      )
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f4f4' }}>

      {/* Tab bar */}
      <TabBar
        tabs={openTabs}
        activeTab={activeTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
      />

      {/* Empty state */}
      {!activeNode && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#999', flexDirection: 'column', gap: '8px',
        }}>
          <span style={{ fontSize: '32px' }}>&#9672;</span>
          <span style={{ fontSize: '13px' }}>Select a node from the State Tree</span>
        </div>
      )}

      {/* Active node */}
      {activeNode && (
        <>
          {/* Title bar */}
          <div style={{
            background:   '#3a3a5a',
            color:        '#ffffff',
            padding:      '7px 12px',
            fontSize:     '11px',
            borderBottom: '1px solid #2a2a4a',
            flexShrink:   0,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px',
                background: STATUS_COLOR[activeNode.status] || STATUS_COLOR.unknown,
              }} />
              {activeNode.label}
              {activeNode._svcName && (
                <span style={{ color: '#8888cc', fontWeight: '400', fontSize: '10px' }}>
                  &nbsp;·&nbsp;{activeNode._svcName}
                </span>
              )}
            </div>

            {/* Refresh button for live nodes */}
            {activeNode._live && (
              <button
                onClick={() => onRefreshTab(activeNode.id)}
                disabled={activeNode._loading}
                title="Re-run search"
                style={{
                  background: 'none', border: '1px solid #5555aa',
                  borderRadius: '3px', color: activeNode._loading ? '#555' : '#aaa',
                  cursor: activeNode._loading ? 'default' : 'pointer',
                  padding: '2px 8px', fontSize: '11px',
                }}
              >
                &#x21BB; Refresh
              </button>
            )}
          </div>

          {/* Description + search bar */}
          <div style={{
            background:   '#ebebf5',
            borderBottom: '1px solid #d0d0e0',
            padding:      '6px 12px',
            flexShrink:   0,
          }}>
            <div style={{ color: '#333', marginBottom: '4px', fontSize: '12px' }}>
              {activeNode.description}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#888', fontSize: '11px' }}>
                &#x21BB;&nbsp;{activeNode.sampleInfo || (activeNode._loading ? 'Running search\u2026' : '')}
              </div>
              {!activeNode._loading && (
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter rows\u2026"
                  style={{
                    padding: '3px 8px', fontSize: '11px',
                    border: '1px solid #bbb', borderRadius: '3px',
                    background: '#fff', color: '#333', outline: 'none', width: '160px',
                  }}
                />
              )}
            </div>
          </div>

          {/* Loading spinner */}
          {activeNode._loading && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '12px', background: '#fff', color: '#888',
            }}>
              <span style={{ fontSize: '24px' }}>&#8987;</span>
              <span style={{ fontSize: '12px' }}>Running search&hellip;</span>
            </div>
          )}

          {/* Error state */}
          {!activeNode._loading && activeNode._error && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '10px', background: '#fff',
            }}>
              <div style={{ color: '#cc4444', fontSize: '12px', maxWidth: '480px', textAlign: 'center' }}>
                Search failed: {activeNode._error}
              </div>
              <button
                onClick={() => onRefreshTab(activeNode.id)}
                style={{ padding: '5px 14px', fontSize: '11px', background: '#eee', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Results table */}
          {!activeNode._loading && !activeNode._error && (
            <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
              <ResultsTable columns={activeNode.columns} rows={filteredRows} />
            </div>
          )}

          {/* Status bar */}
          {!activeNode._loading && !activeNode._error && (
            <div style={{
              background: STATUS_COLOR[activeNode.status] ?? '#888',
              color:      activeNode.status === 'ok' ? '#1a5c34' : '#ffffff',
              padding:    '4px 12px',
              fontSize:   '11px',
              fontWeight: '600',
              flexShrink: 0,
              display:    'flex',
              gap:        '20px',
            }}>
              <span>
                status&nbsp;<strong>{(activeNode.status || 'unknown').toUpperCase()}</strong>
              </span>
              <span>rows&nbsp;<strong>{filteredRows.length}</strong></span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
