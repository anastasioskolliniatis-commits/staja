/**
 * ServicesStateTab — flat grid of all service check results.
 *
 * Reads from bm_results KV collection (passed in as props from App).
 * Sorted by severity: critical → error → warning → no_data → stale → ok.
 * Filterable by status badge and searchable by node/service name.
 */

import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#cc7700',
  critical: '#cc0000',
  error:    '#9900cc',
  no_data:  '#555577',
  stale:    '#445566',
  unknown:  '#444444',
};

// Lower number = shown first (worst first)
const STATUS_ORDER = {
  critical: 0,
  error:    1,
  warning:  2,
  no_data:  3,
  stale:    4,
  ok:       5,
};

const FILTER_OPTIONS = ['all', 'critical', 'error', 'warning', 'no_data', 'stale', 'ok'];

function formatEpoch(epoch) {
  if (!epoch) return '—';
  const ms = parseInt(epoch, 10) * 1000;
  if (isNaN(ms)) return '—';
  return new Date(ms).toLocaleTimeString();
}

export default function ServicesStateTab({ results, error, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = results
    .filter(r =>
      filterStatus === 'all' || r.service_status === filterStatus
    )
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.node_id      || '').toLowerCase().includes(q) ||
        (r.service_name || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (STATUS_ORDER[a.service_status] ?? 9) -
      (STATUS_ORDER[b.service_status] ?? 9)
    );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      overflow: 'hidden',
      background: '#1e1e1e',
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        gap: '10px',
        padding: '9px 14px',
        background: '#252535',
        borderBottom: '1px solid #3a3a5a',
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#777', fontSize: '11px', flexShrink: 0 }}>Filter:</span>

        {FILTER_OPTIONS.map(s => {
          const active = s === filterStatus;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                border: '1px solid',
                borderColor: active ? '#7777cc' : '#3a3a5a',
                borderRadius: '3px',
                background: active ? '#3c3c5c' : 'transparent',
                color: s === 'all'
                  ? (active ? '#fff' : '#888')
                  : (STATUS_COLOR[s] || '#888'),
                cursor: 'pointer',
                fontWeight: active ? '600' : '400',
              }}
            >
              {s}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <input
          type="text"
          placeholder="Search node / service…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            background: '#2a2a3a',
            border: '1px solid #3a3a5a',
            borderRadius: '3px',
            color: '#ddd',
            width: '200px',
            outline: 'none',
          }}
        />

        <button
          onClick={onRefresh}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            background: '#2a2a3a',
            border: '1px solid #3a3a5a',
            borderRadius: '3px',
            color: '#aaa',
            cursor: 'pointer',
          }}
        >
          &#x21BB; Refresh
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          background: '#3a1010',
          color: '#ff9999',
          padding: '8px 14px',
          fontSize: '11px',
          borderBottom: '1px solid #551111',
          flexShrink: 0,
        }}>
          Error loading results: {error}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{
              background: '#252535',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}>
              {['Status', 'Node', 'Service', 'Last Checked', 'Error Detail'].map(h => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    color: '#7777aa',
                    fontWeight: '600',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid #3a3a5a',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    textAlign: 'center',
                    color: '#555',
                    padding: '48px',
                    fontSize: '13px',
                  }}
                >
                  {results.length === 0
                    ? 'No results yet — collector has not run'
                    : 'No matching results'}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => {
                const status = row.service_status || 'unknown';
                const color  = STATUS_COLOR[status] || STATUS_COLOR.unknown;
                return (
                  <tr
                    key={row._key || i}
                    style={{
                      background: i % 2 === 0 ? '#212121' : '#1d1d1d',
                      borderBottom: '1px solid #2a2a2a',
                    }}
                  >
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: '700',
                        background: color,
                        color: '#fff',
                        letterSpacing: '0.3px',
                      }}>
                        {status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px', color: '#ddd' }}>
                      {row.node_id || '—'}
                    </td>
                    <td style={{ padding: '7px 12px', color: '#bbb' }}>
                      {row.service_name || '—'}
                    </td>
                    <td style={{
                      padding: '7px 12px',
                      color: '#666',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}>
                      {formatEpoch(row.last_checked_time)}
                    </td>
                    <td style={{
                      padding: '7px 12px',
                      color: '#bb5555',
                      fontSize: '11px',
                      maxWidth: '320px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.error_message || ''}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        background: '#252535',
        borderTop: '1px solid #3a3a5a',
        padding: '5px 14px',
        fontSize: '11px',
        color: '#666',
        flexShrink: 0,
        display: 'flex',
        gap: '20px',
      }}>
        <span>Showing {filtered.length} of {results.length}</span>
        <span>Auto-refresh every 60s</span>
      </div>
    </div>
  );
}
