import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#e69900',
  critical: '#cc0000',
  unknown:  '#666666',
};

// ── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ tabs, activeTab, onSelect, onClose }) {
  return (
    <div style={{
      display: 'flex',
      background: '#3c3c5c',
      borderBottom: '1px solid #555',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {tabs.length === 0 && (
        <div style={{ padding: '6px 14px', color: '#888', fontSize: '11px' }}>Metrics</div>
      )}
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              cursor: 'pointer',
              background: active ? '#5c5c8a' : 'transparent',
              color: active ? '#ffffff' : '#aaaacc',
              borderRight: '1px solid #555',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: STATUS_COLOR[tab.status] || STATUS_COLOR.unknown,
                flexShrink: 0,
              }}
            />
            {tab.label}
            <span
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{ color: '#888', marginLeft: '4px', fontSize: '13px', lineHeight: 1 }}
              title="Close"
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Results table ────────────────────────────────────────────────────────────
function ResultsTable({ columns, rows }) {
  const tdBase = {
    padding: '5px 10px',
    borderBottom: '1px solid #e0e0e0',
    color: '#222',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  };

  if (!columns || columns.length === 0) {
    return <div style={{ color: '#999', padding: '20px', fontSize: '12px' }}>No columns defined.</div>;
  }

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={{
              ...tdBase,
              background: '#e8e8e8',
              color: '#444',
              fontWeight: '600',
              textTransform: 'uppercase',
              fontSize: '10px',
              letterSpacing: '0.5px',
              borderBottom: '2px solid #ccc',
              position: 'sticky',
              top: 0,
            }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ ...tdBase, color: '#999', textAlign: 'center', padding: '24px' }}>
              No data to display.
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f7f7f7' }}>
              {columns.map(col => (
                <td key={col} style={tdBase}>{row[col] ?? ''}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ── Main MetricsPanel ────────────────────────────────────────────────────────
export default function MetricsPanel({ openTabs, activeTab, activeNode, onSelectTab, onCloseTab }) {
  const [search, setSearch] = useState('');

  const filteredRows = activeNode
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

      {/* Content */}
      {!activeNode ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <span style={{ fontSize: '32px' }}>◈</span>
          <span style={{ fontSize: '13px' }}>Select a query from the State Tree</span>
        </div>
      ) : (
        <>
          {/* Title bar */}
          <div style={{
            background: '#4a4a6a',
            color: '#ffffff',
            padding: '6px 12px',
            fontSize: '11px',
            borderBottom: '1px solid #555',
            flexShrink: 0,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                background: STATUS_COLOR[activeNode.status] || STATUS_COLOR.unknown,
                marginRight: '6px',
              }} />
              {activeNode.label}
            </div>
          </div>

          {/* Description + sampling info */}
          <div style={{
            background: '#ebebf5',
            borderBottom: '1px solid #d0d0e0',
            padding: '6px 12px',
            flexShrink: 0,
          }}>
            <div style={{ color: '#333', marginBottom: '4px', fontSize: '12px' }}>
              {activeNode.description}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#666', fontSize: '11px' }}>
                ⟳&nbsp; {activeNode.sampleInfo}
              </div>
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  border: '1px solid #bbb',
                  borderRadius: '3px',
                  background: '#fff',
                  color: '#333',
                  outline: 'none',
                  width: '160px',
                }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
            <ResultsTable columns={activeNode.columns} rows={filteredRows} />
          </div>

          {/* Status bar */}
          <div style={{
            background: activeNode.status === 'critical' ? '#cc0000'
              : activeNode.status === 'warning' ? '#e69900'
              : '#2ecc71',
            color: activeNode.status === 'ok' ? '#1a5c34' : '#ffffff',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: '600',
            flexShrink: 0,
            display: 'flex',
            gap: '16px',
          }}>
            <span>samplingStatus&nbsp;
              <strong>{activeNode.status.toUpperCase()}</strong>
            </span>
            <span>rows&nbsp;<strong>{filteredRows.length}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}
