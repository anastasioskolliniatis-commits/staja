import Table from '@splunk/react-ui/Table';
import Button from '@splunk/react-ui/Button';

const SEV_STYLE = {
  critical: { background: '#7a0000', color: '#ffaaaa' },
  high:     { background: '#7a3800', color: '#ffcc88' },
  medium:   { background: '#5c4d00', color: '#ffe066' },
  low:      { background: '#1a4a1a', color: '#88ee88' },
  info:     { background: '#1a2e50', color: '#88bbff' },
};

const ST_STYLE = {
  new:         { background: '#2a2a3a', color: '#aaa' },
  assigned:    { background: '#1a3050', color: '#6fb3f0' },
  in_progress: { background: '#1a4a1a', color: '#6ff06f' },
  on_hold:     { background: '#4a3800', color: '#f0c040' },
  resolved:    { background: '#1a1a1a', color: '#555' },
};

const BADGE = { display: 'inline-block', padding: '2px 7px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px' };

function fmtTs(ep) {
  return ep ? new Date(ep * 1000).toLocaleString() : '—';
}

export default function IncidentTable({ incidents, onEdit }) {
  if (!incidents.length) {
    return (
      <div style={{ textAlign: 'center', color: '#444', padding: '64px' }}>
        No incidents found.
      </div>
    );
  }

  return (
    <Table stripeRows>
      <Table.Head>
        <Table.HeadCell>Incident</Table.HeadCell>
        <Table.HeadCell>Title</Table.HeadCell>
        <Table.HeadCell>Severity</Table.HeadCell>
        <Table.HeadCell>Status</Table.HeadCell>
        <Table.HeadCell>Assigned To</Table.HeadCell>
        <Table.HeadCell>Source Alert</Table.HeadCell>
        <Table.HeadCell>Created</Table.HeadCell>
        <Table.HeadCell />
      </Table.Head>
      <Table.Body>
        {incidents.map(inc => {
          const sev = inc.severity || 'info';
          const st  = inc.status   || 'new';
          const assignee = inc.assigned_to
            ? inc.assigned_to
            : inc.assigned_role
              ? `@${inc.assigned_role}`
              : null;

          return (
            <Table.Row key={inc._key}>
              <Table.Cell>
                <span style={{ fontFamily: 'monospace', color: '#6fb3f0', fontWeight: 700, fontSize: '12px' }}>
                  {inc.incident_id || '—'}
                </span>
              </Table.Cell>
              <Table.Cell>{inc.title || '—'}</Table.Cell>
              <Table.Cell>
                <span style={{ ...BADGE, ...SEV_STYLE[sev] }}>{sev}</span>
              </Table.Cell>
              <Table.Cell>
                <span style={{ ...BADGE, ...ST_STYLE[st] }}>{st.replace(/_/g, ' ')}</span>
              </Table.Cell>
              <Table.Cell>
                {assignee
                  ? assignee
                  : <span style={{ color: '#444', fontStyle: 'italic' }}>Unassigned</span>
                }
              </Table.Cell>
              <Table.Cell>
                <span style={{ color: '#555', fontSize: '11px' }}>{inc.source_alert || '—'}</span>
              </Table.Cell>
              <Table.Cell>
                <span style={{ color: '#555', fontSize: '11px' }}>{fmtTs(inc.created_time)}</span>
              </Table.Cell>
              <Table.Cell>
                <Button appearance="flat" size="small" onClick={() => onEdit(inc)}>Edit</Button>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}
