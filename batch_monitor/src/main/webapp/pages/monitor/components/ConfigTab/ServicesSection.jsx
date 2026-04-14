/**
 * ServicesSection — CRUD table for service definitions.
 *
 * Lists all services from bm_services KV collection.
 * Edit opens ServiceModal with full SPL editor + display_fields builder.
 * Delete warns about orphaned mappings.
 */

import { useState, useEffect, useCallback } from 'react';
import { kvGetAll, kvUpsert, kvDelete } from '../../hooks/useSplunkKV';
import ServiceModal from './ServiceModal';

export default function ServicesSection() {
  const [services,    setServices]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [editTarget,  setEditTarget]  = useState(null); // null=closed {}=new doc=edit

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    kvGetAll('bm_services')
      .then(setServices)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleSave = async (doc) => {
    await kvUpsert('bm_services', doc.service_name, doc);
    setEditTarget(null);
    load();
  };

  const handleDelete = async (svc) => {
    const confirmed = window.confirm(
      `Delete service "${svc.service_name}"?\n\n` +
      'Existing mappings referencing this service will become orphaned ' +
      'and will be skipped by the collector.'
    );
    if (!confirmed) return;
    try {
      await kvDelete('bm_services', svc._key || svc.service_name);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const parseFields = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  };

  return (
    <div style={{ maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h3 style={styles.heading}>Services</h3>
          <p style={styles.hint}>
            Each service is an SPL check mapped to one or more tree leaf nodes.
            The SPL must return a <Code>service_status</Code> field per row.
            Collector aggregates the worst status across all rows.
          </p>
        </div>
        <button onClick={() => setEditTarget({})} style={styles.btnPrimary}>
          + Add Service
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBar}>{error}</div>
      )}

      {/* Loading */}
      {loading && <div style={styles.muted}>Loading&hellip;</div>}

      {/* Empty */}
      {!loading && services.length === 0 && (
        <div style={styles.muted}>No services defined yet. Add one to get started.</div>
      )}

      {/* Table */}
      {services.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#1a1a2a' }}>
              {['Service Name', 'Description', 'Status Field', 'Display Fields', 'SPL Preview', ''].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((svc, i) => {
              const fields = parseFields(svc.display_fields);
              return (
                <tr key={svc._key || i} style={{ background: i % 2 === 0 ? '#1e1e1e' : '#1a1a22', borderBottom: '1px solid #2a2a3a' }}>
                  <td style={{ ...styles.td, fontWeight: '600', color: '#ddd' }}>
                    {svc.service_name}
                  </td>
                  <td style={{ ...styles.td, color: '#888' }}>
                    {svc.service_description || <span style={{ color: '#444' }}>—</span>}
                  </td>
                  <td style={{ ...styles.td, color: '#7fc3ff', fontFamily: 'monospace', fontSize: '11px' }}>
                    {svc.status_field || 'service_status'}
                  </td>
                  <td style={{ ...styles.td, color: '#999', fontSize: '11px' }}>
                    {fields.length === 0
                      ? <span style={{ color: '#444' }}>all fields</span>
                      : fields.slice(0, 3).join(', ') + (fields.length > 3 ? ` +${fields.length - 3}` : '')
                    }
                  </td>
                  <td style={{ ...styles.td, color: '#4488cc', fontFamily: 'monospace', fontSize: '11px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {svc.service_spl || <span style={{ color: '#444' }}>—</span>}
                  </td>
                  <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditTarget(svc)} style={styles.btnEdit}>Edit</button>
                    <button onClick={() => handleDelete(svc)}  style={styles.btnDelete}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {editTarget !== null && (
        <ServiceModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

const Code = ({ children }) => (
  <code style={{ background: '#1a1a2a', border: '1px solid #3a3a5a', padding: '1px 5px', borderRadius: '3px', color: '#7fc3ff', fontFamily: 'monospace', fontSize: '11px' }}>
    {children}
  </code>
);

const styles = {
  heading: { color: '#ddd', fontSize: '13px', fontWeight: '600', margin: '0 0 6px 0' },
  hint:    { color: '#666', fontSize: '11px', lineHeight: '1.6', margin: 0 },
  muted:   { color: '#555', fontSize: '12px', padding: '16px 0' },
  errorBar: {
    background: '#3a1212', border: '1px solid #5a2222', borderRadius: '3px',
    padding: '8px 12px', color: '#ff9999', fontSize: '11px', marginBottom: '12px',
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    color: '#6666aa',
    fontWeight: '600',
    fontSize: '10px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #3a3a5a',
  },
  td: { padding: '8px 12px' },
  btnPrimary: {
    padding: '7px 16px', fontSize: '12px',
    background: '#2a4a7a', border: '1px solid #4477aa',
    borderRadius: '3px', color: '#ddd', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnEdit: {
    marginRight: '8px', padding: '3px 10px', fontSize: '11px',
    background: '#252535', border: '1px solid #3a3a5a',
    borderRadius: '3px', color: '#bbb', cursor: 'pointer',
  },
  btnDelete: {
    padding: '3px 10px', fontSize: '11px',
    background: '#2a1212', border: '1px solid #4a2222',
    borderRadius: '3px', color: '#cc6666', cursor: 'pointer',
  },
};
