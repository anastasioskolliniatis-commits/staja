import { useState, useEffect } from 'react';
import Modal from '@splunk/react-ui/Modal';
import Button from '@splunk/react-ui/Button';
import ControlGroup from '@splunk/react-ui/ControlGroup';
import Text from '@splunk/react-ui/Text';
import TextArea from '@splunk/react-ui/TextArea';
import Select from '@splunk/react-ui/Select';
import Message from '@splunk/react-ui/Message';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import CommentThread from './CommentThread';
import {
  createIncident, updateIncident, deleteIncident,
  addComment, getUsers, getRoles,
  getNextIncidentId, now, currentUser,
} from '../api';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES   = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved'];

const EMPTY = { title: '', description: '', severity: 'medium', status: 'new', assigned_to: '', assigned_role: '' };

export default function IncidentModal({ open, incident, onClose, onSaved }) {
  const isEdit = Boolean(incident);

  const [form, setForm]     = useState(EMPTY);
  const [users, setUsers]   = useState([]);
  const [roles, setRoles]   = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  // Populate form and load users/roles whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(isEdit ? {
      title:         incident.title         || '',
      description:   incident.description   || '',
      severity:      incident.severity      || 'medium',
      status:        incident.status        || 'new',
      assigned_to:   incident.assigned_to   || '',
      assigned_role: incident.assigned_role || '',
    } : EMPTY);

    const SKIP_ROLES = ['can_delete', 'splunk-system-role'];
    getUsers()
      .then(d => setUsers((d.entry || []).map(e => e.name).sort()))
      .catch(() => {});
    getRoles()
      .then(d => setRoles(
        (d.entry || []).map(e => e.name).filter(n => !SKIP_ROLES.includes(n)).sort()
      ))
      .catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = key => (e, { value }) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const t = now();
      if (isEdit) {
        const oldStatus = incident.status || 'new';
        const updated = {
          ...incident,           // preserve all existing fields
          ...form,
          updated_time:  t,
          resolved_time: form.status === 'resolved' ? t : (incident.resolved_time || 0),
        };
        await updateIncident(incident._key, updated);
        // Auto-comment on status change
        if (oldStatus !== form.status) {
          await addComment({
            incident_id:   incident.incident_id,
            author:        currentUser(),
            comment:       '',
            timestamp:     t,
            status_change: `${oldStatus} to ${form.status}`,
          });
        }
      } else {
        const incident_id = await getNextIncidentId();
        await createIncident({
          ...form,
          incident_id,
          created_by:    currentUser(),
          source_alert:  '',
          created_time:  t,
          updated_time:  t,
          resolved_time: 0,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${incident.incident_id}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteIncident(incident._key);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onRequestClose={onClose} style={{ width: '660px', maxWidth: '96vw' }}>
      <Modal.Header
        title={isEdit
          ? `${incident?.incident_id} — Edit`
          : 'New Incident'}
        onRequestClose={onClose}
      />

      <Modal.Body>
        {error && <Message type="error" style={{ marginBottom: '12px' }}>{error}</Message>}

        <ControlGroup label="Title *" labelPosition="top">
          <Text value={form.title} onChange={set('title')} placeholder="Brief description of the incident" />
        </ControlGroup>

        <ControlGroup label="Description" labelPosition="top">
          <TextArea value={form.description} onChange={set('description')} placeholder="What happened? What is the impact?" rows={3} />
        </ControlGroup>

        <div style={{ display: 'flex', gap: '12px' }}>
          <ControlGroup label="Severity" labelPosition="top" style={{ flex: 1 }}>
            <Select value={form.severity} onChange={set('severity')}>
              {SEVERITIES.map(s => (
                <Select.Option key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} value={s} />
              ))}
            </Select>
          </ControlGroup>

          <ControlGroup label="Status" labelPosition="top" style={{ flex: 1 }}>
            <Select value={form.status} onChange={set('status')}>
              {STATUSES.map(s => (
                <Select.Option key={s} label={s.replace(/_/g, ' ')} value={s} />
              ))}
            </Select>
          </ControlGroup>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <ControlGroup label="Assign to User" labelPosition="top" style={{ flex: 1 }}>
            <Select value={form.assigned_to} onChange={set('assigned_to')}>
              <Select.Option label="Unassigned" value="" />
              {users.map(u => <Select.Option key={u} label={u} value={u} />)}
            </Select>
          </ControlGroup>

          <ControlGroup label="Assign to Role" labelPosition="top" style={{ flex: 1 }}>
            <Select value={form.assigned_role} onChange={set('assigned_role')}>
              <Select.Option label="No Role" value="" />
              {roles.map(r => <Select.Option key={r} label={r} value={r} />)}
            </Select>
          </ControlGroup>
        </div>

        {isEdit && (
          <CommentThread incidentId={incident?.incident_id} />
        )}
      </Modal.Body>

      <Modal.Footer>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <Button appearance="destructive" onClick={handleDelete} disabled={saving}>
                Delete
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave} disabled={saving}>
              {saving ? <WaitSpinner size="small" /> : (isEdit ? 'Save Changes' : 'Create Incident')}
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
