import Select from '@splunk/react-ui/Select';
import Text from '@splunk/react-ui/Text';
import Button from '@splunk/react-ui/Button';

const STATUSES   = ['new', 'assigned', 'in_progress', 'on_hold', 'resolved'];
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

export default function FilterBar({ filters, onChange, onRefresh }) {
  const set = key => (e, { value }) => onChange(prev => ({ ...prev, [key]: value }));

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
      <Select value={filters.status} onChange={set('status')} style={{ minWidth: '140px' }}>
        <Select.Option label="All Statuses" value="" />
        {STATUSES.map(s => (
          <Select.Option key={s} label={s.replace(/_/g, ' ')} value={s} />
        ))}
      </Select>

      <Select value={filters.severity} onChange={set('severity')} style={{ minWidth: '140px' }}>
        <Select.Option label="All Severities" value="" />
        {SEVERITIES.map(s => (
          <Select.Option key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} value={s} />
        ))}
      </Select>

      <Text
        value={filters.search}
        onChange={set('search')}
        placeholder="Search title or INC..."
        style={{ minWidth: '200px', flex: 1 }}
      />

      <Button onClick={onRefresh}>Refresh</Button>
    </div>
  );
}
