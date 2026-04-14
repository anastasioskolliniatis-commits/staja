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

const RESULTS_REFRESH_MS = 60_000;

export default function App() {
  const { isAdmin } = useCurrentUser();

  // Top-level navigation
  const [appTab, setAppTab] = useState('monitor');

  // Live tree + config (services, mappings)
  const { tree, services, mappings, loading: treeLoading, reload: reloadTree } = useMonitorData();

  // Shared bm_results — refreshed every 60s for the Services tab
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

  // Monitor panel — open tabs (one per clicked node)
  const [openTabs,  setOpenTabs]  = useState([]);
  const [activeTab, setActiveTab] = useState(null);

  const handleSelect = useCallback(async (node) => {
    // If tab already open — just activate it
    const existing = openTabs.find(t => t.id === node.id);
    if (existing) {
      setActiveTab(node.id);
      return;
    }

    // Build the tab object — start with what we know
    const tab = {
      id:          node.id,
      label:       node.label,
      status:      node.status,
      type:        node.type,
      // For live nodes these will be populated after the search
      _live:       false,
      _loading:    false,
      _error:      null,
      columns:     node.columns   ?? [],
      rows:        node.rows      ?? [],
      description: node.description ?? node.label,
      sampleInfo:  '',
    };

    // Find first service mapped to this node
    const mapping = mappings.find(m => m.node_id === node.id);
    if (mapping) {
      const svc = services.get(mapping.service_name);
      if (svc?.service_spl) {
        tab._live    = true;
        tab._loading = true;
        tab._svcName = svc.service_name;

        // Parse display_fields
        let displayFields = [];
        try {
          const raw = svc.display_fields;
          displayFields = Array.isArray(raw)
            ? raw
            : raw ? JSON.parse(raw) : [];
        } catch { displayFields = []; }

        tab._displayFields = displayFields;
        tab.description    = svc.service_description || node.label;
      }
    }

    // Open the tab immediately (shows loading state if live)
    setOpenTabs(prev => [...prev, tab]);
    setActiveTab(node.id);

    // Fire the live search if needed
    if (tab._live && tab._loading) {
      const svc = services.get(mapping.service_name);
      try {
        const t0   = Date.now();
        const rows = await runSearch(svc.service_spl, { count: 10_000 });
        const cols = tab._displayFields.length
          ? tab._displayFields
          : rows.length > 0
            ? Object.keys(rows[0]).filter(k => !k.startsWith('_'))
            : [];

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        setOpenTabs(prev => prev.map(t =>
          t.id !== node.id ? t : {
            ...t,
            _loading:   false,
            columns:    cols,
            rows,
            sampleInfo: `${rows.length} row${rows.length !== 1 ? 's' : ''} · fetched in ${elapsed}s`,
          }
        ));
      } catch (e) {
        setOpenTabs(prev => prev.map(t =>
          t.id !== node.id ? t : {
            ...t,
            _loading: false,
            _error:   e.message,
            columns:  [],
            rows:     [],
            sampleInfo: 'Search failed',
          }
        ));
      }
    }
  }, [openTabs, mappings, services]);

  const handleCloseTab = useCallback((id) => {
    const remaining = openTabs.filter(t => t.id !== id);
    setOpenTabs(remaining);
    if (activeTab === id) {
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }, [openTabs, activeTab]);

  // Refresh active tab's search results
  const handleRefreshTab = useCallback(async (tabId) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (!tab?._live) return;

    const mapping = mappings.find(m => m.node_id === tabId);
    if (!mapping) return;
    const svc = services.get(mapping.service_name);
    if (!svc?.service_spl) return;

    setOpenTabs(prev => prev.map(t =>
      t.id !== tabId ? t : { ...t, _loading: true, _error: null }
    ));

    try {
      const t0   = Date.now();
      const rows = await runSearch(svc.service_spl, { count: 10_000 });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setOpenTabs(prev => prev.map(t =>
        t.id !== tabId ? t : {
          ...t,
          _loading:   false,
          rows,
          sampleInfo: `${rows.length} row${rows.length !== 1 ? 's' : ''} · fetched in ${elapsed}s`,
        }
      ));
    } catch (e) {
      setOpenTabs(prev => prev.map(t =>
        t.id !== tabId ? t : { ...t, _loading: false, _error: e.message }
      ));
    }
  }, [openTabs, mappings, services]);

  const activeNode = openTabs.find(t => t.id === activeTab) ?? null;

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
      {/* ── Top nav ── */}
      <AppTabs active={appTab} onSelect={setAppTab} isAdmin={isAdmin} />

      {/* ── Monitor ── */}
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
              selectedId={activeNode?.id}
              onSelect={handleSelect}
              onReload={reloadTree}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MetricsPanel
              openTabs={openTabs}
              activeTab={activeTab}
              activeNode={activeNode}
              onSelectTab={setActiveTab}
              onCloseTab={handleCloseTab}
              onRefreshTab={handleRefreshTab}
            />
          </div>
        </div>
      )}

      {/* ── Services ── */}
      {appTab === 'services' && (
        <ServicesStateTab
          results={results}
          error={resultsError}
          onRefresh={fetchResults}
        />
      )}

      {/* ── Config (admin only) ── */}
      {appTab === 'config' && isAdmin && <ConfigTab />}
      {appTab === 'config' && !isAdmin && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          Access restricted to administrators.
        </div>
      )}
    </div>
  );
}
