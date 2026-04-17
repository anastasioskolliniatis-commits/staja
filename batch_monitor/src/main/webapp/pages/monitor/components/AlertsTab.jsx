/**
 * AlertsTab — recent critical/warning/error events from the collector.
 *
 * Reads from index=_internal sourcetype=bm_collector action=check_ok
 * where service_status is not ok/no_data.
 * Uses a live SPL search so it always shows the freshest data.
 */

import { useState, useEffect, useCallback } from 'react';
import { runSearch } from '../hooks/useSplunkSearch';

const STATUS_COLOR = {
  critical: '#cc2200',
  error:    '#8800cc',
  warning:  '#e08a00',
  ok:       '#00aa44',
  no_data:  '#445566',
};

const ALERT_SPL = [
  'index=_internal sourcetype=bm_collector action=check_ok',
  '(service_status=critical OR service_status=warning OR service_status=error)',
  'earliest=-24h',
  '| rex field=_raw "node_id=(?P<node_id>\\S+)"',
  '| rex field=_raw "service_name=(?P<service_name>\\S+)"',
  '| rex field=_raw "service_status=(?P<service_status>\\S+)"',
  '| rex field=_raw "duration_sec=(?P<duration_sec>[\\d.]+)"',
  '| rex field=_raw "run_id=(?P<run_id>\\S+)"',
  '| eval fired_at=strftime(_time, "%Y-%m-%d %H:%M:%S")',
  '| table fired_at, node_id, service_name, service_status, duration_sec, run_id',
  '| sort -fired_at',
].join(' ');

const TIME_WINDOWS = [
  { label: 'Last 1h',  value: 'earliest=-1h'  },
  { label: 'Last 6h',  value: 'earliest=-6h'  },
  { label: 'Last 24h', value: 'earliest=-24h' },
  { label: 'Last 7d',  value: 'earliest=-7d'  },
];

function buildSpl(window) {
  return ALERT_SPL.replace('earliest=-24h', window);
}

export default function AlertsTab() {
  const [timeWindow, setTimeWindow] = useState('earliest=-24h');
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [lastRun,    setLastRun]    = useState(null);

  const fetch = useCallback(async (window) => {
    setLoading(true);
    setError(null);
    try {
      const data = await runSearch(buildSpl(window), { count: 1000 });
      setRows(data);
      setLastRun(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(timeWindow); }, [timeWindow, fetch]);

  // Count by status
  const counts = {};
  rows.forEach(r => { const s = r.service_status || 'unknown'; counts[s] = (counts[s] || 0) + 1; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#12121c' }}>

      {/* Header */}
      <div style={{
        padding:      '10px 16px',
        background:   '#1a1a2e',
        borderBottom: '1px solid #2a2a3e',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        gap:          '12px',
        flexWrap:     'wrap',
      }}>
        {/* Time window picker */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {TIME_WINDOWS.map(w => {
            const active = timeWindow === w.value;
            return (
              <button key={w.value} onClick={() => setTimeWindow(w.value)} style={{
                padding:      '3px 10px',
                fontSize:     '11px',
                border:       '1px solid',
                borderColor:  active ? '#5599ff' : '#2a2a3e',
                borderRadius: '3px',
                background:   active ? '#1e2a4a' : 'transparent',
                color:        active ? '#aabbff' : '#7777aa',
                cursor:       'pointer',
                fontWeight:   active ? '600' : '400',
              }}>
                {w.label}
              </button>
            );
          })}
        </div>

        {/* Status summary */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {['critical', 'error', 'warning'].map(s => counts[s] ? (
            <span key={s} style={{
              padding: '2px 8px', borderRadius: '3px', fontSize: '11px',
              fontWeight: '700', background: STATUS_COLOR[s], color: '#fff',
            }}>
              {counts[s]} {s}
            </span>
          ) : null)}
          {rows.length === 0 && !loading && !error && (
            <span style={{ color: '#00aa44', fontSize: '11px' }}>✓ No alerts in this window</span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {lastRun && <span style={{ color: '#444', fontSize: '10px' }}>last fetched {lastRun}</span>}
        <button
          onClick={() => fetch(timeWindow)}
          disabled={loading}
          style={{
            padding: '4px 12px', fontSize: '11px',
            background: '#1e1e2e', border: '1px solid #2a2a3e',
            borderRadius: '3px', color: loading ? '#444' : '#8888aa',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Explanation box */}
      <div style={{
        margin:       '12px 16px 0',
        padding:      '8px 12px',
        background:   '#1a1a2e',
        border:       '1px solid #2a2a3e',
        borderLeft:   '3px solid #5599ff',
        borderRadius: '4px',
        fontSize:     '11px',
        color:        '#7777aa',
        flexShrink:   0,
      }}>
        <strong style={{ color: '#aaaacc' }}>Alert history</strong> — every collector run that found a non-OK status is recorded here.
        To send email or webhook notifications, enable the pre-built saved searches under
        <strong style={{ color: '#aaaacc' }}> Settings → Searches, Reports, and Alerts</strong>.
      </div>

      {/* Error */}
      {error && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 14px',
          background: '#2e1010', border: '1px solid #551111',
          borderRadius: '4px', color: '#ff9999', fontSize: '12px', flexShrink: 0,
        }}>
          Search failed: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⏳</span>
          <span style={{ fontSize: '12px' }}>Searching collector logs…</span>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {rows.length === 0 && !error ? (
            <div style={{
              textAlign: 'center', color: '#00aa44', padding: '48px',
              fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '32px' }}>✓</span>
              <span>No critical or warning events in this time window</span>
              <span style={{ fontSize: '11px', color: '#444' }}>All services reported OK or have not been checked yet</span>
            </div>
          ) : (
            <div style={{
              background: '#1a1a2e', borderRadius: '6px',
              border: '1px solid #2a2a3e', overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#12121c' }}>
                    {['Time', 'Status', 'Node', 'Service', 'Duration', 'Run ID'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
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
                  {rows.map((row, i) => {
                    const status = row.service_status || 'unknown';
                    const color  = STATUS_COLOR[status] || '#555';
                    return (
                      <tr key={i} style={{
                        borderBottom: '1px solid #1e1e28',
                        background: i % 2 === 0 ? '#16161e' : '#131318',
                      }}>
                        <td style={{ padding: '7px 12px', color: '#666', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {row.fired_at || '—'}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px',
                            borderRadius: '3px', fontSize: '10px', fontWeight: '700',
                            background: color, color: '#fff',
                          }}>
                            {status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px', color: '#ccc' }}>{row.node_id || '—'}</td>
                        <td style={{ padding: '7px 12px', color: '#aaa' }}>{row.service_name || '—'}</td>
                        <td style={{ padding: '7px 12px', color: '#555', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>
                          {row.duration_sec ? `${parseFloat(row.duration_sec).toFixed(1)}s` : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', color: '#444', fontFamily: 'monospace', fontSize: '10px' }}>
                          {row.run_id || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{
        background: '#1a1a2e', borderTop: '1px solid #2a2a3e',
        padding: '5px 14px', fontSize: '11px', color: '#444', flexShrink: 0,
      }}>
        {rows.length} alert event{rows.length !== 1 ? 's' : ''} · Collector runs every 5 minutes
      </div>
    </div>
  );
}
