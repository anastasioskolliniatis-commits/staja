import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#e08a00',
  critical: '#cc2200',
  error:    '#8800cc',
  no_data:  '#445566',
  stale:    '#334455',
  unknown:  '#555566',
};

const STATUS_LABEL = {
  ok:       'OK',
  warning:  'WARNING',
  critical: 'CRITICAL',
  error:    'ERROR',
  no_data:  'NO DATA',
  stale:    'STALE',
  unknown:  'UNKNOWN',
};

function statusColor(s) { return STATUS_COLOR[s] || STATUS_COLOR.unknown; }

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const color = statusColor(status);
  const isOk  = status === 'ok';
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           '4px',
      padding:       size === 'lg' ? '3px 10px' : '1px 7px',
      borderRadius:  '3px',
      fontSize:      size === 'lg' ? '11px' : '10px',
      fontWeight:    '700',
      background:    color,
      color:         isOk ? '#004422' : '#fff',
      letterSpacing: '0.6px',
      whiteSpace:    'nowrap',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOk ? '#00dd66' : 'rgba(255,255,255,0.5)', display: 'inline-block' }} />
      {STATUS_LABEL[status] || 'UNKNOWN'}
    </span>
  );
}

// ── No Data alert ─────────────────────────────────────────────────────────────
function NoDataBox() {
  return (
    <div style={{
      margin:       '16px 20px',
      padding:      '10px 14px',
      background:   '#1a2530',
      border:       '1px solid #2e4455',
      borderLeft:   '3px solid #445566',
      borderRadius: '4px',
      color:        '#7799aa',
      fontSize:     '12px',
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
    }}>
      <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>ℹ</span>
      <span>
        <strong style={{ color: '#99aabb' }}>No data available</strong>
        &nbsp;— the service SPL returned no rows, or the collector has not run yet.
      </span>
    </div>
  );
}

// ── Title bar ─────────────────────────────────────────────────────────────────
function TitleBar({ node, onRefresh }) {
  const color = statusColor(node.status);
  return (
    <div style={{
      background:     '#1e1e2e',
      color:          '#e8e8f0',
      padding:        '0 16px',
      height:         '40px',
      flexShrink:     0,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      borderBottom:   '1px solid #2a2a3e',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {/* Status stripe */}
        <span style={{
          width: '4px', height: '22px', borderRadius: '2px',
          background: color, flexShrink: 0,
        }} />
        <span style={{ fontWeight: '600', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.label}
        </span>
        {node._svcName && (
          <span style={{ color: '#5566aa', fontSize: '10px', fontWeight: '400', whiteSpace: 'nowrap' }}>
            {node._svcName}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <StatusBadge status={node.status} />
        {node._live && (
          <button
            onClick={onRefresh}
            disabled={node._loading}
            style={{
              background:   node._loading ? 'transparent' : '#252535',
              border:       '1px solid #3a3a5a',
              borderRadius: '3px',
              color:        node._loading ? '#444' : '#9999cc',
              cursor:       node._loading ? 'default' : 'pointer',
              padding:      '3px 10px',
              fontSize:     '11px',
              display:      'flex',
              alignItems:   'center',
              gap:          '4px',
            }}
          >
            <span style={{ fontSize: '12px', lineHeight: 1 }}>↻</span>
            {node._loading ? 'Running…' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-bar (description + search + timing) ───────────────────────────────────
function SubBar({ node, search, onSearch }) {
  return (
    <div style={{
      background:   '#f7f8fa',
      borderBottom: '1px solid #e0e2e8',
      padding:      '6px 16px',
      flexShrink:   0,
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      gap:          '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <span style={{ color: '#555', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.description}
        </span>
        {node.sampleInfo && !node._loading && (
          <span style={{ color: '#aaa', fontSize: '11px', whiteSpace: 'nowrap' }}>
            · {node.sampleInfo}
          </span>
        )}
        {node._loading && (
          <span style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
            Running search…
          </span>
        )}
      </div>
      {!node._loading && onSearch && (
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Filter…"
          style={{
            padding:      '3px 8px',
            fontSize:     '11px',
            border:       '1px solid #ccc',
            borderRadius: '3px',
            background:   '#fff',
            color:        '#333',
            outline:      'none',
            width:        '140px',
            flexShrink:   0,
          }}
        />
      )}
    </div>
  );
}

// ── KV Card — single-row results shown as metric tiles ────────────────────────
function KVCard({ columns, row }) {
  return (
    <div style={{
      display:   'flex',
      flexWrap:  'wrap',
      gap:       '12px',
      padding:   '20px 20px',
      alignContent: 'flex-start',
    }}>
      {columns.map(col => {
        const val      = row[col] ?? '—';
        const isStatus = col === 'service_status';
        const isNum    = !isStatus && !isNaN(Number(val)) && val !== '';
        return (
          <div key={col} style={{
            background:   '#ffffff',
            border:       '1px solid #e0e2e8',
            borderRadius: '6px',
            padding:      '12px 16px',
            minWidth:     '140px',
            maxWidth:     '320px',
            flex:         isNum ? '0 0 auto' : '1 1 220px',
            boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              color:         '#888',
              fontSize:      '10px',
              fontWeight:    '600',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginBottom:  '6px',
            }}>
              {col.replace(/_/g, ' ')}
            </div>
            {isStatus ? (
              <StatusBadge status={String(val).toLowerCase()} size="lg" />
            ) : isNum ? (
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e', lineHeight: 1 }}>
                {val}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#222', lineHeight: '1.4', wordBreak: 'break-word' }}>
                {String(val).replace(/,/g, ', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Results table — multi-row ─────────────────────────────────────────────────
function ResultsTable({ columns, rows }) {
  if (!columns || columns.length === 0) {
    return <div style={{ color: '#aaa', padding: '24px', fontSize: '12px' }}>No columns defined.</div>;
  }

  const tdStyle = {
    padding:      '6px 12px',
    borderBottom: '1px solid #eee',
    color:        '#222',
    fontSize:     '12px',
    whiteSpace:   'nowrap',
    maxWidth:     '320px',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col} style={{
                ...tdStyle,
                background:    '#f0f1f5',
                color:         '#555',
                fontWeight:    '600',
                textTransform: 'uppercase',
                fontSize:      '10px',
                letterSpacing: '0.6px',
                borderBottom:  '2px solid #d8dae0',
                position:      'sticky',
                top:           0,
              }}>
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ ...tdStyle, color: '#bbb', textAlign: 'center', padding: '32px' }}>
                No rows returned.
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i}
              style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fb' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#eef0f8'; }}
              onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f9f9fb'; }}
            >
              {columns.map(col => {
                const val      = row[col] ?? '';
                const isStatus = col === 'service_status';
                return (
                  <td key={col} style={tdStyle} title={String(val)}>
                    {isStatus
                      ? <StatusBadge status={String(val).toLowerCase()} />
                      : String(val)
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Group view ────────────────────────────────────────────────────────────────
function GroupView({ node, results }) {
  const children = node.children || [];

  const resultsByNode = {};
  results.forEach(r => {
    if (!r.node_id) return;
    if (!resultsByNode[r.node_id] || r.last_checked_time > resultsByNode[r.node_id].last_checked_time) {
      resultsByNode[r.node_id] = r;
    }
  });

  function formatTime(epochStr) {
    if (!epochStr) return null;
    const ms = parseInt(epochStr, 10) * 1000;
    if (isNaN(ms)) return null;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  if (children.length === 0) {
    return <div style={{ padding: '24px', color: '#999', fontSize: '12px', textAlign: 'center' }}>No child nodes.</div>;
  }

  // Split into leaves and sub-groups
  const leaves = children.filter(c => !c.children?.length);
  const groups = children.filter(c =>  c.children?.length);

  const renderChild = (child) => {
    const res    = resultsByNode[child.id];
    const color  = statusColor(child.status);
    const isGrp  = child.children && child.children.length > 0;
    const time   = formatTime(res?.last_checked_time);

    return (
      <div key={child.id} style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        padding:      '8px 12px',
        marginBottom: '4px',
        background:   '#ffffff',
        border:       '1px solid #e4e6ee',
        borderLeft:   `3px solid ${color}`,
        borderRadius: '5px',
        boxShadow:    '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, color: '#1a1a2e', fontSize: '12px', fontWeight: '500' }}>
          {child.label}
          {isGrp && (
            <span style={{ color: '#aaa', fontWeight: '400', marginLeft: '6px', fontSize: '10px' }}>
              ({child.children.length} items)
            </span>
          )}
        </span>
        {time && (
          <span style={{ color: '#bbb', fontSize: '10px', whiteSpace: 'nowrap' }}>
            {time}
          </span>
        )}
        <StatusBadge status={child.status} />
      </div>
    );
  };

  return (
    <div style={{ padding: '16px 20px' }}>
      {groups.length > 0 && (
        <>
          <div style={{ color: '#aaa', fontSize: '10px', fontWeight: '600', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Groups</div>
          {groups.map(renderChild)}
          {leaves.length > 0 && <div style={{ height: '12px' }} />}
        </>
      )}
      {leaves.length > 0 && (
        <>
          {groups.length > 0 && (
            <div style={{ color: '#aaa', fontSize: '10px', fontWeight: '600', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Services</div>
          )}
          {leaves.map(renderChild)}
        </>
      )}
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

  const isSingleRow = filteredRows.length === 1;
  const isNoData    = selectedNode?.status === 'no_data';

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!selectedNode) {
    return (
      <div style={{
        flex: 1, height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '10px',
        background: '#f4f5f8',
      }}>
        <svg width="40" height="40" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.25 }}>
          <path
            d="M4 19 L4 7 L4 3 L7 3 L7 7 L8.5 7 L8.5 3 L11.5 3 L11.5 7 L13 7 L13 3 L16 3 L16 7 L16 19 Z"
            fill="#888"
          />
          <rect x="8.6" y="8.8" width="2.8" height="3.2" rx="1.4" fill="#f4f5f8"/>
          <path d="M8.2 19.5 L8.2 15 Q8.2 13 10 13 Q11.8 13 11.8 15 L11.8 19.5 Z" fill="#f4f5f8"/>
        </svg>
        <span style={{ fontSize: '13px', color: '#bbb' }}>Select a node from the State Tree</span>
      </div>
    );
  }

  // ── Group node ───────────────────────────────────────────────────────────────
  if (selectedNode.type === 'group') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f5f8' }}>
        <TitleBar node={selectedNode} onRefresh={onRefresh} />
        <SubBar node={{ ...selectedNode, _loading: false, sampleInfo: '' }} search={null} onSearch={null} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isNoData && <NoDataBox />}
          <GroupView node={selectedNode} results={results} />
        </div>
      </div>
    );
  }

  // ── Leaf node ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f4f5f8' }}>
      <TitleBar node={selectedNode} onRefresh={onRefresh} />
      <SubBar node={selectedNode} search={search} onSearch={filteredRows.length > 1 || search ? setSearch : null} />

      {/* Loading */}
      {selectedNode._loading && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '12px', background: '#f4f5f8', color: '#999',
        }}>
          <span style={{ fontSize: '28px', animation: 'spin 1s linear infinite' }}>⏳</span>
          <span style={{ fontSize: '12px' }}>Running search…</span>
        </div>
      )}

      {/* Error */}
      {!selectedNode._loading && selectedNode._error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '12px', background: '#f4f5f8',
        }}>
          <div style={{
            background: '#fff0f0', border: '1px solid #ffcccc', borderLeft: '3px solid #cc2200',
            borderRadius: '5px', padding: '14px 18px', maxWidth: '480px',
            color: '#991100', fontSize: '12px', lineHeight: '1.5',
          }}>
            <strong>Search failed</strong><br />
            {selectedNode._error}
          </div>
          <button onClick={onRefresh} style={{
            padding: '5px 16px', fontSize: '11px',
            background: '#fff', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', color: '#555',
          }}>
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {!selectedNode._loading && !selectedNode._error && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#f4f5f8' }}>
          {isNoData && <NoDataBox />}

          {/* Single row → metric cards */}
          {!isNoData && isSingleRow && (
            <KVCard columns={selectedNode.columns} row={filteredRows[0]} />
          )}

          {/* Multiple rows → table */}
          {!isNoData && !isSingleRow && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{
                background: '#fff', borderRadius: '6px',
                border: '1px solid #e0e2e8', overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  padding: '8px 12px', background: '#f0f1f5',
                  borderBottom: '1px solid #e0e2e8',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '11px', color: '#888', fontWeight: '600' }}>
                    {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
                    {search && <span style={{ color: '#5599ff' }}>&nbsp;(filtered)</span>}
                  </span>
                </div>
                <ResultsTable columns={selectedNode.columns} rows={filteredRows} />
              </div>
            </div>
          )}

          {/* Zero rows but status isn't no_data */}
          {!isNoData && filteredRows.length === 0 && !selectedNode._loading && (
            <div style={{ padding: '32px', color: '#bbb', fontSize: '12px', textAlign: 'center' }}>
              No rows returned.
            </div>
          )}
        </div>
      )}

      {/* Status footer */}
      {!selectedNode._loading && !selectedNode._error && (
        <div style={{
          borderTop:  '1px solid #e0e2e8',
          background: '#fff',
          padding:    '5px 16px',
          flexShrink: 0,
          display:    'flex',
          alignItems: 'center',
          gap:        '16px',
          fontSize:   '11px',
          color:      '#999',
        }}>
          <StatusBadge status={selectedNode.status} />
          <span>{filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}</span>
          {selectedNode.sampleInfo && <span>{selectedNode.sampleInfo}</span>}
        </div>
      )}
    </div>
  );
}
