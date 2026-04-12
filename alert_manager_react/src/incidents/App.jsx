import { useState, useEffect, useCallback } from 'react';
import Button from '@splunk/react-ui/Button';
import Heading from '@splunk/react-ui/Heading';
import Message from '@splunk/react-ui/Message';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import StatsBar from './components/StatsBar';
import FilterBar from './components/FilterBar';
import IncidentTable from './components/IncidentTable';
import IncidentModal from './components/IncidentModal';
import { getIncidents } from './api';

const STAT_KEYS = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved'];

export default function App() {
  const [incidents, setIncidents]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState(null);          // null = create mode
  const [filters, setFilters]       = useState({ status: '', severity: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIncidents();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply filters + sort newest first (created_time is unix epoch)
  const filtered = incidents
    .filter(i => {
      if (filters.status   && i.status   !== filters.status)   return false;
      if (filters.severity && i.severity !== filters.severity)  return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!(i.title       || '').toLowerCase().includes(q) &&
            !(i.incident_id || '').toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.created_time || 0) - (a.created_time || 0));

  const stats = STAT_KEYS.reduce(
    (acc, k) => { acc[k] = incidents.filter(i => i.status === k).length; return acc; },
    { total: incidents.length }
  );

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = inc  => { setEditing(inc); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };
  const handleSaved = () => { closeModal(); load(); };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <Heading level={2} style={{ margin: 0 }}>Alert Manager — Incidents</Heading>
        <Button appearance="primary" onClick={openCreate}>+ New Incident</Button>
      </div>

      <StatsBar stats={stats} />

      <FilterBar filters={filters} onChange={setFilters} onRefresh={load} />

      {error && (
        <Message type="error" style={{ marginBottom: '16px' }}>{error}</Message>
      )}

      {loading
        ? <div style={{ textAlign: 'center', padding: '48px' }}><WaitSpinner size="large" /></div>
        : <IncidentTable incidents={filtered} onEdit={openEdit} />
      }

      <IncidentModal
        open={modalOpen}
        incident={editing}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </div>
  );
}
