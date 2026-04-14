/**
 * useMonitorData.js
 *
 * Builds the live monitoring tree by combining:
 *   1. Tree structure  — from tree SPL in bm_tree_config (flat rows → nested)
 *   2. Status colors   — from bm_results KV (worst service_status per leaf node)
 *   3. Service config  — from bm_services and bm_mappings (for drill-down)
 *
 * Falls back to mockData if tree SPL is not configured or fails to run,
 * so the app stays functional during initial setup.
 *
 * Returns:
 *   tree      — nested tree object ready for StateTree component
 *   services  — Map of service_name → service doc (for drill-down)
 *   mappings  — array of { node_id, service_name } (for drill-down lookup)
 *   loading   — true while initial data loads
 *   error     — string or null
 *   reload    — function to re-fetch everything
 */

import { useState, useEffect, useCallback } from 'react';
import { TREE as MOCK_TREE } from '../mockData';
import { kvGetAll } from './useSplunkKV';
import { runSearch } from './useSplunkSearch';

// Status severity — used for rollup (higher = worse)
const SEVERITY = {
  ok:       0,
  no_data:  0,
  stale:    1,
  warning:  2,
  error:    3,
  critical: 4,
};

function worstStatus(statuses) {
  if (!statuses.length) return 'unknown';
  return statuses.reduce((worst, s) =>
    (SEVERITY[s] ?? -1) > (SEVERITY[worst] ?? -1) ? s : worst
  , 'ok');
}

/**
 * Convert flat tree rows into a nested tree structure.
 * Assigns 'unknown' status to all nodes initially.
 */
function buildNestedTree(rows) {
  if (!rows.length) return null;

  const nodeMap = {};

  // Build node objects
  rows.forEach(row => {
    const id = (row.node_id ?? '').trim();
    if (!id) return;
    nodeMap[id] = {
      id,
      label:    (row.node_label ?? id).trim(),
      status:   'unknown',
      type:     'group',       // leaf nodes become 'query' after status applied
      children: [],
      _parentId: (row.parent_node_id ?? '').trim(),
    };
  });

  // Wire up parent → children
  const roots = [];
  Object.values(nodeMap).forEach(node => {
    const parent = nodeMap[node._parentId];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    delete node._parentId; // clean up internal field
  });

  // Single root — return it directly; multiple — wrap in synthetic root
  if (roots.length === 1) return roots[0];
  return {
    id:       'root',
    label:    'Global State',
    status:   'unknown',
    type:     'group',
    children: roots,
  };
}

/**
 * Apply status from bm_results to leaf nodes, then roll up to groups.
 * A leaf node = one with no children after tree build.
 * Leaf nodes with services mapped get type='query' (clickable).
 */
function applyStatus(node, resultsByNode, mappedNodeIds) {
  if (node.children.length === 0) {
    // Leaf node
    const nodeResults = resultsByNode[node.id] ?? [];
    const statuses    = nodeResults.map(r => r.service_status);
    node.status       = worstStatus(statuses.length ? statuses : ['no_data']);
    // Make clickable if it has services mapped
    if (mappedNodeIds.has(node.id)) {
      node.type = 'query';
    }
  } else {
    // Group — recurse first, then roll up
    node.children.forEach(child => applyStatus(child, resultsByNode, mappedNodeIds));
    node.status = worstStatus(node.children.map(c => c.status));
  }
}

export function useMonitorData() {
  const [tree,     setTree]     = useState(null);
  const [services, setServices] = useState(new Map());
  const [mappings, setMappings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all config in parallel
      const [treeDocs, servicesDocs, mappingsDocs, resultsDocs] = await Promise.all([
        kvGetAll('bm_tree_config'),
        kvGetAll('bm_services'),
        kvGetAll('bm_mappings'),
        kvGetAll('bm_results'),
      ]);

      // Build services map
      const svcMap = new Map();
      servicesDocs.forEach(s => {
        if (s.service_name) svcMap.set(s.service_name, s);
      });
      setServices(svcMap);
      setMappings(mappingsDocs);

      // Index results by node_id
      const resultsByNode = {};
      resultsDocs.forEach(r => {
        if (!r.node_id) return;
        if (!resultsByNode[r.node_id]) resultsByNode[r.node_id] = [];
        resultsByNode[r.node_id].push(r);
      });

      // Set of node_ids that have at least one service mapping
      const mappedNodeIds = new Set(mappingsDocs.map(m => m.node_id).filter(Boolean));

      // Try to build live tree from SPL
      const treeSpl = treeDocs[0]?.tree_spl?.trim();

      if (treeSpl) {
        try {
          const rows       = await runSearch(treeSpl, { count: 5000, timeoutMs: 30_000 });
          const nestedTree = buildNestedTree(rows);

          if (nestedTree) {
            applyStatus(nestedTree, resultsByNode, mappedNodeIds);
            setTree(nestedTree);
            setLoading(false);
            return;
          }
        } catch (searchErr) {
          // Tree SPL failed — fall through to mockData with live status overlay
          console.warn('[bm] Tree SPL failed, using mockData:', searchErr.message);
        }
      }

      // Fallback: use mockData structure with live status overlay
      const mockCopy = applyStatusToMock(
        JSON.parse(JSON.stringify(MOCK_TREE)),
        resultsByNode,
        mappedNodeIds
      );
      setTree(mockCopy);

    } catch (e) {
      setError(e.message);
      // Still show mockData so the UI isn't blank
      setTree(JSON.parse(JSON.stringify(MOCK_TREE)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { tree, services, mappings, loading, error, reload: load };
}

/**
 * Apply live status colors to the mockData tree.
 * Only overrides nodes that have live results — others keep mock status.
 */
function applyStatusToMock(node, resultsByNode, mappedNodeIds) {
  if (!node.children || node.children.length === 0) {
    const nodeResults = resultsByNode[node.id];
    if (nodeResults?.length) {
      const statuses = nodeResults.map(r => r.service_status);
      node.status    = worstStatus(statuses);
    }
    if (mappedNodeIds.has(node.id)) {
      node.type = 'query';
    }
  } else {
    node.children = node.children.map(c =>
      applyStatusToMock(c, resultsByNode, mappedNodeIds)
    );
    // Only override group status if children had live data
    const childHasLive = node.children.some(c => resultsByNode[c.id]?.length > 0);
    if (childHasLive) {
      node.status = worstStatus(node.children.map(c => c.status));
    }
  }
  return node;
}
