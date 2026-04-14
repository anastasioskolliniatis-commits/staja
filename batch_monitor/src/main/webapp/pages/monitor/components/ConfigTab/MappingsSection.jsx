/**
 * MappingsSection — assign services to leaf nodes.
 *
 * Displays existing mappings grouped by node_id.
 * Admin types a node_id and picks a service from the dropdown.
 * The composite key node_id__service_name ensures no duplicates.
 */

import { useState, useEffect, useCallback } from 'react';
import { kvGetAll, kvUpsert, kvDelete } from '../../hooks/useSplunkKV';

export default function MappingsSection() {
  const [mappings,   setMappings]   = useState([]);
  const [services,   setServices]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [newNodeId,  setNewNodeId]  = useState('');
  const [newService, setNewService] = useState('');
  const [adding,     setAdding]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([kvGetAll('bm_mappings'), kvGetAll('bm_services')])
      .then(([maps, svcs]) => {
        setMappings(maps);
        setServices(svcs);
        if (svcs.length > 0 && !newService) {
          setNewService(svcs[0].service_name);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(load, [load]);

  const handleAdd = async () => {
    const nodeId  = newNodeId.trim();
    const svcName = newService.trim();
    if (!nodeId || !svcName) return;

    // Check for duplicate
    const exists = mappings.some(
      m => m.node_id === nodeId && m.service_name === svcName
    );
    if (exists) {
      setError(`Mapping ${nodeId} → ${svcName} already exists.`);
      return;
    }

    setAdding(true);
    setError(null);
    try {
      const key = `${nodeId}__${svcName}`;
      await kvUpsert('bm_mappings', key, { node_id: nodeId, service_name: svcName });
      setNewNodeId('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (mapping) => {
    const key = mapping._key || `${mapping.node_id}__${mapping.service_name}`;
    try {
      await kvDelete('bm_mappings', key);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Group mappings by node_id for display
  const byNode = mappings.reduce((acc, m) => {
    const n = m.node_id || '?';
    if (!acc[n]) acc[n] = [];
    acc[n].push(m);
    return acc;
  }, {});

  const sortedNodes = Object.keys(byNode).sort();

  return (
    <div style={{ maxWidth: '700px' }}>
      <h3 style={styles.heading}>Mappings</h3>
      <p style={styles.hint}>
        Assign services to leaf nodes. The collector runs each mapped service
        and writes the aggregate status to <Code>bm_results</Code>.
        Node IDs must match the <Code>node_id</Code> field returned by your Tree Query.
      </p>

      {/* ── Add form ── */}
      <div style={styles.addRow}>
        <div>
          <div style={styles.label}>Node ID (leaf)</div>
          <input
            value={newNodeId}
            onChange={e => setNewNodeId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. clearing-proc"
            style={styles.input}
          />
        </div>
        <div>
          <div style={styles.label}>Service</div>
          <select
            value={newService}
            onChange={e => setNewService(e.target.value)}
            style={{ ...styles.input, cursor: 'pointer' }}
          >
            {services.length === 0
              ? <option value="">No services defined — add services first</option>
              : services.map(s => (
                  <option key={s.service_name} value={s.service_name}>
                    {s.service_name}
                  </option>
                ))
            }
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newNodeId.trim() || !newService || services.length === 0}
          style={{
            ...styles.btnPrimary,
            alignSelf: 'flex-end',
            opacity: (adding || !newNodeId.trim() || !newService) ? 0.5 : 1,
          }}
        >
          {adding ? 'Adding\u2026' : '+ Add'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBar}>{error}</div>
      )}

      {/* Loading */}
      {loading && <div style={styles.muted}>Loading&hellip;</div>}

      {/* Empty */}
      {!loading && mappings.length === 0 && (
        <div style={styles.muted}>No mappings yet. Add a node ID and select a service above.</div>
      )}

      {/* Grouped list */}
      {sortedNodes.map(nodeId => (
        <div key={nodeId} style={{ marginBottom: '16px' }}>
          {/* Node header */}
          <div style={styles.nodeHeader}>
            <span style={{ borderLeft: '2px solid #5599ff', paddingLeft: '8px' }}>
              {nodeId}
            </span>
            <span style={{ color: '#444', fontSize: '10px' }}>
              {byNode[nodeId].length} service{byNode[nodeId].length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Service rows */}
          {byNode[nodeId].map((m, i) => (
            <div key={m._key || i} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              background: i % 2 === 0 ? '#1e1e1e' : '#1a1a22',
              borderRadius: '2px',
            }}>
              <span style={{ color: '#bbb', fontSize: '12px', fontFamily: 'monospace' }}>
                {m.service_name}
              </span>
              <button
                onClick={() => handleDelete(m)}
                style={styles.btnRemove}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ))}
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
  hint:    { color: '#666', fontSize: '11px', lineHeight: '1.6', margin: '0 0 20px 0' },
  muted:   { color: '#555', fontSize: '12px', padding: '12px 0' },
  label:   { color: '#9999bb', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' },
  errorBar: {
    background: '#3a1212', border: '1px solid #5a2222', borderRadius: '3px',
    padding: '8px 12px', color: '#ff9999', fontSize: '11px', marginBottom: '14px',
  },
  addRow: {
    display: 'flex', gap: '12px', alignItems: 'flex-end',
    marginBottom: '20px', flexWrap: 'wrap',
  },
  input: {
    background: '#12121e',
    border: '1px solid #3a3a5a',
    borderRadius: '3px',
    padding: '7px 10px',
    color: '#e0e0e0',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    minWidth: '180px',
  },
  nodeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#9999cc',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
    padding: '4px 0',
  },
  btnPrimary: {
    padding: '8px 18px', fontSize: '12px',
    background: '#2a4a7a', border: '1px solid #4477aa',
    borderRadius: '3px', color: '#ddd', cursor: 'pointer',
  },
  btnRemove: {
    padding: '3px 10px', fontSize: '11px',
    background: '#2a1212', border: '1px solid #4a2222',
    borderRadius: '3px', color: '#cc6666', cursor: 'pointer',
  },
};
