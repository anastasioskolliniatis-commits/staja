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

function statusBadge(status) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.unknown;
  return (
    <span style={{
      display:      'inline-block',
      padding:      '1px 7px',
      borderRadius: '3px',
      fontSize:     '10px',
      fontWeight:   '700',
      background:   color,
      color:        '#fff',
      textTransform: 'uppercase',
    }}>
      {status || 'unknown'}
    </span>
  );
}

// ── No Data alert box ─────────────────────────────────────────────────────────
function NoDataBox() {
  return (
    <div style={{
      margin:       '16px',
      padding:      '10px 14px',
      background:   '#1e2a36',
      border:       '1px solid #445566',
      borderLeft:   '3px solid #445566',
      borderRadius: '4px',
      color:        '#7799aa',
      fontSize:     '12px',
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
    }}>
      <span style={{ fontSize: '16px', lineHeight: 1 }}>&#9432;</span>
      <span>
        <strong style={{ color: '#99aabb' }}>No data</strong>
        &nbsp;&mdash; the collector has not returned results for this node yet,
        or the service SPL produced no rows.
      </span>
    </div>
  );
}

// ── Title bar (shared) ────────────────────────────────────────────────────────
function TitleBar({ node, onRefresh }) {
  const color = STATUS_COLOR[node.status] || STATUS_COLOR.unknown;
  return (
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
          background: color,
        }} />
        {node.label}
        {node._svcName && (
          <span style={{ color: '#8888cc', fontWeight: '400', fontSize: '10px' }}>
            &nbsp;·&nbsp;{node._svcName}
          </span>
        )}
      </div>
      {node._live && (
        <button
          onClick={onRefresh}
          disabled={node._loading}
          style={{
            background: 'none', border: '1px solid #5555aa',
            borderRadius: '3px', color: node._loading ? '#555' : '#aaa',
            cursor: node._loading ? 'default' : 'pointer',
            padding: '2px 8px', fontSize: '11px',
          }}
        >
          &#x21BB; Refresh
        </button>
      )}
    </div>
  );
}

// ── Sub-title bar ─────────────────────────────────────────────────────────────
function SubBar({ node, search, onSearch }) {
  return (
    <div style={{
      background:   '#ebebf5',
      borderBottom: '1px solid #d0d0e0',
      padding:      '6px 12px',
      flexShrink:   0,
    }}>
      <div style={{ color: '#333', marginBottom: '4px', fontSize: '12px' }}>
        {node.description}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#888', fontSize: '11px' }}>
          {node._loading
            ? 'Running search\u2026'
            : node.sampleInfo
              ? `\u21BB\u00A0${node.sampleInfo}`
              : ''}
        </div>
        {!node._loading && onSearch && (
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
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
  );
}

// ── Status bar (leaf) ─────────────────────────────────────────────────────────
function StatusBar({ status, rowCount }) {
  const color = STATUS_COLOR[status] ?? '#888';
  return (
    <div style={{
      background: color,
      color:      status === 'ok' ? '#1a5c34' : '#ffffff',
      padding:    '4px 12px',
      fontSize:   '11px',
      fontWeight: '600',
      flexShrink: 0,
      display:    'flex',
      gap:        '20px',
    }}>
      <span>status&nbsp;<strong>{(status || 'unknown').toUpperCase()}</strong></span>
      <span>rows&nbsp;<strong>{rowCount}</strong></span>
    </div>
  );
}

// ── Results table (leaf) ──────────────────────────────────────────────────────
function ResultsTable({ columns, rows }) {
  const tdBase = {
    padding:      '5px 10px',
    borderBottom: '1px solid #e8e8e8',
    color:        '#222',
    fontSize:     '12px',
    whiteSpace:   'nowrap',
  };

  if (!columns || columns.length === 0) {
    return <div style={{ color: '#999', padding: '24px', fontSize: '12px' }}>No columns defined.</div>;
  }

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={{
              ...tdBase,
              background:    '#eaeaea',
              color:         '#444',
              fontWeight:    '600',
              textTransform: 'uppercase',
              fontSize:      '10px',
              letterSpacing: '0.5px',
              borderBottom:  '2px solid #ccc',
              position:      'sticky',
              top:           0,
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
              const val      = row[col] ?? '';
              const isStatus = col === 'service_status';
              return (
                <td key={col} style={tdBase}>
                  {isStatus
                    ? statusBadge(String(val).toLowerCase())
                    : String(val)
                  }
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Group view (children summary) ─────────────────────────────────────────────
function GroupView({ node, results }) {
  const children = node.children || [];

  // Index results by node_id for quick lookup
  const resultsByNode = {};
  results.forEach(r => {
    if (!r.node_id) return;
    if (!resultsByNode[r.node_id] || r.last_checked_time > resultsByNode[r.node_id].last_checked_time) {
      resultsByNode[r.node_id] = r;
    }
  });

  function formatTime(epochStr) {
    if (!epochStr) return '—';
    const ms = parseInt(epochStr, 10) * 1000;
    if (isNaN(ms)) return '—';
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  if (children.length === 0) {
    return (
      <div style={{ padding: '24px', color: '#888', fontSize: '12px', textAlign: 'center' }}>
        No child nodes.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {children.map(child => {
        const res   = resultsByNode[child.id];
        const color = STATUS_COLOR[child.status] || STATUS_COLOR.unknown;
        const isGroup = child.children && child.children.length > 0;

        return (
          <div key={child.id} style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '10px',
            padding:      '8px 10px',
            marginBottom: '4px',
            background:   '#ffffff',
            border:       '1px solid #e0e0e0',
            borderLeft:   `3px solid ${color}`,
            borderRadius: '3px',
          }}>
            {/* Status dot */}
            <span style={{
              width: '10px', height: '10px', borderRadius: '2px',
              background: color, flexShrink: 0,
            }} />

            {/* Label */}
            <span style={{ flex: 1, color: '#222', fontWeight: '500' }}>
              {child.label}
              {isGroup && (
                <span style={{ color: '#aaa', fontWeight: '400', marginLeft: '6px', fontSize: '10px' }}>
                  ({child.children.length} items)
                </span>
              )}
            </span>

            {/* Last checked */}
            {res?.last_checked_time && (
              <span style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap' }}>
                checked&nbsp;{formatTime(res.last_checked_time)}
              </span>
            )}

            {/* Status badge */}
            {statusBadge(child.status)}
          </div>
        );
      })}
    </div>
  );
}

// ── Main MetricsPanel ─────────────────────────────────────────────────────────
export default function MetricsPanel({ selectedNode, results, onRefresh }) {
  const [search, setSearch] = useState('');

  // Reset search when node changes
  const nodeId = selectedNode?.id;
  const [lastNodeId, setLastNodeId] = useState(null);
  if (nodeId !== lastNodeId) {
    setLastNodeId(nodeId);
    if (search) setSearch('');
  }

  const filteredRows = selectedNode && !selectedNode._loading
    ? (selectedNode.rows || []).filter(row =>
        !search || Object.values(row).some(v =>
          String(v).toLowerCase().includes(search.toLowerCase())
        )
      )
    : [];

  const isNoData = selectedNode?.status === 'no_data';

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!selectedNode) {
    return (
      <div style={{
        flex: 1, height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#999', flexDirection: 'column', gap: '8px',
        background: '#f4f4f4',
      }}>
        <span style={{ fontSize: '32px' }}>&#9672;</span>
        <span style={{ fontSize: '13px' }}>Select a node from the State Tree</span>
      </div>
    );
  }

  // ── Group node ─────────────────────────────────────────────────────────────
  if (selectedNode.type === 'group') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f4f4' }}>
        <TitleBar node={selectedNode} onRefresh={onRefresh} />
        <SubBar node={{ ...selectedNode, _loading: false, sampleInfo: '' }} search={null} onSearch={null} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isNoData && <NoDataBox />}
          <GroupView node={selectedNode} results={results} />
        </div>
      </div>
    );
  }

  // ── Leaf node ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f4f4' }}>
      <TitleBar node={selectedNode} onRefresh={onRefresh} />
      <SubBar node={selectedNode} search={search} onSearch={setSearch} />

      {/* Loading */}
      {selectedNode._loading && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '12px', background: '#fff', color: '#888',
        }}>
          <span style={{ fontSize: '24px' }}>&#8987;</span>
          <span style={{ fontSize: '12px' }}>Running search&hellip;</span>
        </div>
      )}

      {/* Error */}
      {!selectedNode._loading && selectedNode._error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '10px', background: '#fff',
        }}>
          <div style={{ color: '#cc4444', fontSize: '12px', maxWidth: '480px', textAlign: 'center' }}>
            Search failed: {selectedNode._error}
          </div>
          <button
            onClick={onRefresh}
            style={{ padding: '5px 14px', fontSize: '11px', background: '#eee', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {!selectedNode._loading && !selectedNode._error && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
            {isNoData && <NoDataBox />}
            <ResultsTable columns={selectedNode.columns} rows={filteredRows} />
          </div>
          <StatusBar status={selectedNode.status} rowCount={filteredRows.length} />
        </>
      )}
    </div>
  );
}
