/**
 * useCurrentUser.js
 *
 * Fetches the current Splunk user's roles from the authentication context.
 * Used to gate the Config tab to admin/sc_admin roles only.
 *
 * Roles considered admin: 'admin', 'sc_admin'
 * RBAC can be extended here later (e.g. custom capability checks).
 */

import { useState, useEffect } from 'react';

const ADMIN_ROLES = new Set(['admin', 'sc_admin']);

export function useCurrentUser() {
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [username, setUsername] = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch(
      '/en-US/splunkd/__raw/services/authentication/current-context?output_mode=json',
      {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      }
    )
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const content = data?.entry?.[0]?.content ?? {};
        const roles   = Array.isArray(content.roles) ? content.roles : [];
        setUsername(content.username ?? '');
        setIsAdmin(roles.some(r => ADMIN_ROLES.has(r)));
      })
      .catch(() => {
        // On error, default to non-admin — safe fallback
        setIsAdmin(false);
      })
      .finally(() => setLoading(false));
  }, []);

  return { isAdmin, username, loading };
}
