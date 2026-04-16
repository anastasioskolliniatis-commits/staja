import { useState, useEffect, useCallback } from 'react';
import StateTree        from './components/StateTree';
import MetricsPanel     from './components/MetricsPanel';
import AppTabs          from './components/AppTabs';
import ServicesStateTab from './components/ServicesStateTab';
import ConfigTab        from './components/ConfigTab';
import { useCurrentUser }  from './hooks/useCurrentUser';
import { useMonitorData }  from './hooks/useMonitorData';
import { kvGetAll }        from './hooks/useSplunkKV';
import { runSearch }       from './hooks/useSplunkSearch';

const RESULTS_REFRESH_MS  = 60_000;
const PANEL_REFRESH_MS    = 60_000; // auto-refresh selected leaf SPL every 60s

export default function App() {
  const { isAdmin } = useCurrentUser();

  const [appTab, setAppTab] = useState('monitor');

  const { tree, services, mappings, loading: treeLoading, reload: reloadTree } = useMonitorData();

  // Shared bm_results — refreshed every 60s
  const [results,      setResults]      = useState([]);
  const [resultsError, setResultsError] = useState(null);

  const fetchResults = useCallback(() => {
    kvGetAll('bm_results')
      .then(data => { setResults(data); setResultsError(null); })
      .catch(e   => setResultsError(e.message));
  }, []);

  useEffect(() => {
    fetchResults();
    const timer = setInterval(fetchResults, RESULTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchResults]);

  // Single selected node — replaces the old openTabs/activeTab stack
  const [selectedNode, setSelectedNode] = useState(null);

  const handleSelect = useCallback(async (node) => {
    if (node.type === 'query') {
      // ── Leaf node with a service mapping ──────────────────────────────────
      const mapping = mappings.find(m => m.node_id === node.id);
      const svc     = mapping ? services.get(mapping.service_name) : null;

      let displayFields = [];
      if (svc?.display_fields) {
        try {
          displayFields = Array.isArray(svc.display_fields)
            ? svc.display_fields
            : JSON.parse(svc.display_fields);
        } catch { displayFields = []; }
      }

      const base = {
        id:          node.id,
        label:       node.label,
        status:      node.status,
        type:        'query',
        _live:       !!svc?.service_spl,
        _loading:    !!svc?.service_spl,
        _error:      null,
        _svcName:    svc?.service_name ?? '',
        _displayFields: displayFields,
        description: svc?.service_description || node.label,
        columns:     [],
        rows:        [],
        sampleInfo:  '',
      };

      setSelectedNode(base);

      if (!svc?.service_spl) return;

      try {
        const t0   = Date.now();
        const rows = await runSearch(svc.service_spl, { count: 10_000 });
        const cols = displayFields.length
          ? displayFields
          : rows.length > 0
            ? Object.keys(rows[0]).filter(k => !k.startsWith('_'))
            : [];
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        setSelectedNode(prev =>
          prev?.id === node.id
            ? { ...prev, _loading: false, columns: cols, rows,
                sampleInfo: `${rows.length} row${rows.length !== 1 ? 's' : ''} · ${elapsed}s` }
            : prev
        );
      } catch (e) {
        setSelectedNode(prev =>
          prev?.id === node.id
            ? { ...prev, _loading: false, _error: e.message, sampleInfo: 'Search failed' }
            : prev
        );
      }

    } else {
      // ── Group node — show children summary ────────────────────────────────
      setSelectedNode({
        id:          node.id,
        label:       node.label,
        status:      node.status,
        type:        'group',
        children:    node.children || [],
        description: `${(node.children || []).length} item${node.children?.length !== 1 ? 's' : ''}`,
      });
    }
  }, [mappings, services]);

  // Auto-refresh the selected leaf panel every PANEL_REFRESH_MS
  useEffect(() => {
    if (!selectedNode?._live) return;
    const timer = setInterval(() => {
      // Only refresh if not already loading
      setSelectedNode(prev => {
        if (prev?._live && !prev._loading) {
          // Trigger refresh by setting _loading — actual search fires in handleRefresh
          return { ...prev, _needsRefresh: (prev._needsRefresh || 0) + 1 };
        }
        return prev;
      });
    }, PANEL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [selectedNode?._live, selectedNode?.id]);

  // Watch _needsRefresh counter and fire the search
  useEffect(() => {
    if (!selectedNode?._needsRefresh) return;
    handleRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?._needsRefresh]);

  // Re-run the SPL for the currently selected leaf
  const handleRefresh = useCallback(async () => {
    if (!selectedNode?._live || selectedNode._loading) return;

    const mapping = mappings.find(m => m.node_id === selectedNode.id);
    const svc     = mapping ? services.get(mapping.service_name) : null;
    if (!svc?.service_spl) return;

    setSelectedNode(prev => prev ? { ...prev, _loading: true, _error: null } : prev);

    try {
      const t0   = Date.now();
      const rows = await runSearch(svc.service_spl, { count: 10_000 });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setSelectedNode(prev =>
        prev ? { ...prev, _loading: false, rows,
                 sampleInfo: `${rows.length} row${rows.length !== 1 ? 's' : ''} · ${elapsed}s` }
             : prev
      );
    } catch (e) {
      setSelectedNode(prev =>
        prev ? { ...prev, _loading: false, _error: e.message } : prev
      );
    }
  }, [selectedNode, mappings, services]);

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        'calc(100vh - 60px)',
      fontFamily:    '"Segoe UI", Arial, sans-serif',
      fontSize:      '12px',
      background:    '#1e1e1e',
      overflow:      'hidden',
    }}>
      <AppTabs active={appTab} onSelect={setAppTab} isAdmin={isAdmin} />

      {appTab === 'monitor' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{
            width: '260px', minWidth: '200px', flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #3a3a5a',
          }}>
            <StateTree
              tree={tree}
              loading={treeLoading}
              selectedId={selectedNode?.id}
              onSelect={handleSelect}
              onReload={reloadTree}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MetricsPanel
              selectedNode={selectedNode}
              results={results}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      )}

      {appTab === 'services' && (
        <ServicesStateTab
          results={results}
          error={resultsError}
          onRefresh={fetchResults}
        />
      )}

      {appTab === 'config' && isAdmin && <ConfigTab />}
      {appTab === 'config' && !isAdmin && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          Access restricted to administrators.
        </div>
      )}
    </div>
  );
}
