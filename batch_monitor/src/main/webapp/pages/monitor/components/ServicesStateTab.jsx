/**
 * ServicesStateTab — dashboard view of all service check results.
 *
 * Top: summary count cards by status.
 * Below: sortable/filterable flat table of every bm_results row.
 */

import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#e08a00',
  critical: '#cc2200',
  error:    '#8800cc',
  no_data:  '#445566',
  stale:    '#334455',
  unknown:  '#444444',
};

const STATUS_BG = {
  ok:       '#0d2e1a',
  warning:  '#2e1e00',
  critical: '#2e0a00',
  error:    '#1e0033',
  no_data:  '#161e28',
  stale:    '#141c22',
  unknown:  '#1a1a1a',
};

const STATUS_ORDER = {
  critical: 0, error: 1, warning: 2, no_data: 3, stale: 4, ok: 5,
};

const STATUS_LABELS = ['critical', 'error', 'warning', 'no_data', 'ok'];

function formatEpoch(epoch) {
  if (!epoch) return '—';
  const ms = parseInt(epoch, 10) * 1000;
  if (isNaN(ms)) return '—';
  const d   = new Date(ms);
  const now = Date.now();
  const ago = Math.floor((now - ms) / 1000);
  const t   = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (ago < 60)         return `${t} (${ago}s ago)`;
  if (ago < 3600)       return `${t} (${Math.floor(ago / 60)}m ago)`;
  return t;
}

// ── Summary card strip ────────────────────────────────────────────────────────
function SummaryStrip({ results, filterStatus, onFilter }) {
  const counts = {};
  results.forEach(r => {
    const s = r.service_status || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  });

  const total = results.length;

  return (
    <div style={{
      display:    'flex',
      gap:        '10px',
      padding:    '12px 16px',
      background: '#12121c',
      borderBottom: '1px solid #2a2a3e',
      flexShrink: 0,
      flexWrap:   'wrap',
      alignItems: 'stretch',
    }}>
      {/* Total card */}
      <div
        onClick={() => onFilter('all')}
        style={{
          background:   filterStatus === 'all' ? '#252540' : '#1a1a2e',
          border:       `1px solid ${filterStatus === 'all' ? '#5599ff' : '#2a2a3e'}`,
          borderRadius: '6px',
          padding:      '10px 16px',
          cursor:       'pointer',
          minWidth:     '80px',
          textAlign:    'center',
        }}
      >
        <div style={{ fontSize: '24px', fontWeight: '700', color: '#e8e8f0', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: '10px', color: '#7777aa', marginTop: '4px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Total</div>
      </div>

      <div style={{ width: '1px', background: '#2a2a3e', margin: '4px 0' }} />

      {/* Status cards */}
      {STATUS_LABELS.map(s => {
        const count  = counts[s] || 0;
        const active = filterStatus === s;
        const color  = STATUS_COLOR[s];
        return (
          <div
            key={s}
            onClick={() => onFilter(active ? 'all' : s)}
            style={{
              background:   active ? STATUS_BG[s] : '#1a1a2e',
              border:       `1px solid ${active ? color : '#2a2a3e'}`,
              borderTop:    `3px solid ${count > 0 ? color : '#2a2a3e'}`,
              borderRadius: '6px',
              padding:      '8px 14px',
              cursor:       'pointer',
              minWidth:     '80px',
              textAlign:    'center',
              opacity:      count === 0 ? 0.45 : 1,
              transition:   'border-color 0.15s',
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: '700', color: count > 0 ? color : '#444', lineHeight: 1 }}>
              {count}
            </div>
            <div style={{ fontSize: '10px', color: count > 0 ? color : '#555', marginTop: '4px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
              {s.replace('_', ' ')}
            </div>
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Health bar */}
      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', minWidth: '120px' }}>
          <div style={{ fontSize: '10px', color: '#7777aa', letterSpacing: '0.5px' }}>HEALTH</div>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: '#2a2a3e' }}>
            {STATUS_LABELS.map(s => {
              const pct = ((counts[s] || 0) / total) * 100;
              if (!pct) return null;
              return <div key={s} style={{ width: `${pct}%`, background: STATUS_COLOR[s] }} />;
            })}
          </div>
          <div style={{ fontSize: '10px', color: (counts.critical || counts.error) ? '#cc4422' : counts.warning ? '#e08a00' : '#00aa44' }}>
            {counts.critical ? `${counts.critical} critical` : counts.error ? `${counts.error} error` : counts.warning ? `${counts.warning} warning` : 'All systems OK'}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ServicesStateTab({ results, error, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [search,       setSearch]       = useState('');

  const filtered = results
    .filter(r => filterStatus === 'all' || r.service_status === filterStatus)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.node_id      || '').toLowerCase().includes(q) ||
        (r.service_name || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (STATUS_ORDER[a.service_status] ?? 9) - (STATUS_ORDER[b.service_status] ?? 9)
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#12121c' }}>

      <SummaryStrip results={results} filterStatus={filterStatus} onFilter={setFilterStatus} />

      {/* Toolbar */}
      <div style={{
        display:    'flex',
        gap:        '10px',
        padding:    '7px 14px',
        background: '#1a1a2e',
        borderBottom: '1px solid #2a2a3e',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: '#555', fontSize: '11px' }}>
          {filtered.length} of {results.length} services
          {filterStatus !== 'all' && <span style={{ color: STATUS_COLOR[filterStatus] }}> · {filterStatus}</span>}
        </span>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="Search node / service…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '4px 10px', fontSize: '11px',
            background: '#12121c', border: '1px solid #2a2a3e',
            borderRadius: '3px', color: '#ddd', width: '200px', outline: 'none',
          }}
        />
        <button
          onClick={onRefresh}
          style={{
            padding: '4px 12px', fontSize: '11px',
            background: '#1e1e2e', border: '1px solid #2a2a3e',
            borderRadius: '3px', color: '#8888aa', cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#2e1010', color: '#ff9999', padding: '8px 14px', fontSize: '11px', flexShrink: 0 }}>
          Error loading results: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#1a1a2e', position: 'sticky', top: 0, zIndex: 1 }}>
              {['Status', 'Node', 'Service', 'Rows', 'Last Checked', 'Error Detail'].map(h => (
                <th key={h} style={{
                  padding: '7px 12px', textAlign: 'left',
                  color: '#7777aa', fontWeight: '600', fontSize: '10px',
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  borderBottom: '1px solid #2a2a3e',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#444', padding: '48px', fontSize: '13px' }}>
                  {results.length === 0 ? 'No results yet — collector has not run' : 'No matching results'}
                </td>
              </tr>
            ) : filtered.map((row, i) => {
              const status = row.service_status || 'unknown';
              const color  = STATUS_COLOR[status] || '#444';
              return (
                <tr key={row._key || i} style={{
                  background: i % 2 === 0 ? '#16161e' : '#131318',
                  borderBottom: '1px solid #1e1e28',
                }}>
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px',
                      borderRadius: '3px', fontSize: '10px', fontWeight: '700',
                      background: color, color: '#fff', letterSpacing: '0.3px',
                    }}>
                      {status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', color: '#ccc' }}>{row.node_id || '—'}</td>
                  <td style={{ padding: '7px 12px', color: '#aaa' }}>{row.service_name || '—'}</td>
                  <td style={{ padding: '7px 12px', color: '#666', textAlign: 'center' }}>{row.row_count ?? '—'}</td>
                  <td style={{ padding: '7px 12px', color: '#555', fontFamily: 'monospace', fontSize: '11px' }}>
                    {formatEpoch(row.last_checked_time)}
                  </td>
                  <td style={{ padding: '7px 12px', color: '#aa4444', fontSize: '11px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.error_message || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        background: '#1a1a2e', borderTop: '1px solid #2a2a3e',
        padding: '5px 14px', fontSize: '11px', color: '#444', flexShrink: 0,
      }}>
        Auto-refreshes every 60s
      </div>
    </div>
  );
}
