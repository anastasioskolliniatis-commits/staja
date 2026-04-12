import { useState, useEffect, useCallback } from 'react';
import TextArea from '@splunk/react-ui/TextArea';
import Button from '@splunk/react-ui/Button';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';
import { getComments, addComment, now, currentUser } from '../api';

function fmtTs(ep) {
  return ep ? new Date(ep * 1000).toLocaleString() : '';
}

export default function CommentThread({ incidentId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [text, setText]         = useState('');
  const [posting, setPosting]   = useState(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const data = await getComments(incidentId);
      const sorted = (Array.isArray(data) ? data : [])
        .slice()
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setComments(sorted);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      await addComment({
        incident_id:   incidentId,
        author:        currentUser(),
        comment:       trimmed,
        timestamp:     now(),
        status_change: '',
      });
      setText('');
      await load();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ marginTop: '22px', borderTop: '1px solid #2e2e45', paddingTop: '16px' }}>
      <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '12px' }}>
        Activity
      </div>

      {loading ? <WaitSpinner /> : (
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
          {comments.length === 0
            ? <div style={{ color: '#555', fontSize: '11px', marginBottom: '10px' }}>No comments yet.</div>
            : comments.map((c, i) => (
              <div key={i} style={{ background: '#12121f', border: '1px solid #2a2a40', borderRadius: '3px', padding: '10px 12px', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '4px' }}>
                  {c.author || 'unknown'} — {fmtTs(c.timestamp)}
                </div>
                {c.comment && (
                  <div style={{ color: '#bbb', fontSize: '13px' }}>{c.comment}</div>
                )}
                {c.status_change && (
                  <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', marginTop: '3px' }}>
                    Status: {c.status_change}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      <TextArea
        value={text}
        onChange={(e, { value }) => setText(value)}
        placeholder="Add a comment..."
        rows={2}
        style={{ width: '100%', marginBottom: '8px' }}
      />
      <Button onClick={handlePost} disabled={posting || !text.trim()}>
        {posting ? 'Posting…' : 'Add Comment'}
      </Button>
    </div>
  );
}
