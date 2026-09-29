(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const token = () => localStorage.getItem('ll_admin_token');

  async function api(path) {
    const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + (token() || '') } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data || d;
  }

  function render(logs) {
    $('#auditTable tbody').innerHTML = logs.length ? logs.map(log => {
      let details = log.metadata || '';
      try { details = JSON.stringify(JSON.parse(details)); } catch (_) {}
      return '<tr><td>' + esc(new Date(log.createdAt).toLocaleString()) +
        '</td><td>' + esc(log.user?.fullName || 'Deleted manager') +
        '</td><td><b>' + esc(log.action) +
        '</b></td><td>' + esc(log.entity) +
        '</td><td>' + esc(log.entityId) +
        '</td><td><pre>' + esc(details) + '</pre></td></tr>';
    }).join('') : '<tr><td colspan="6">No manager activity found.</td></tr>';
  }

  async function loadManagers() {
    const d = await api('/admin/managers');
    $('#auditManager').innerHTML = '<option value="">All Managers</option>' +
      (d.managers || []).map(m => '<option value="' + esc(m.id) + '">' + esc(m.fullName) + '</option>').join('');
  }

  async function loadAudit() {
    try {
      const params = new URLSearchParams();
      const manager = $('#auditManager').value;
      const action = $('#auditAction').value.trim();
      params.set('days', $('#auditDays').value);
      if (manager) params.set('managerId', manager);
      if (action) params.set('action', action);
      const d = await api('/admin/manager-audit?' + params.toString());
      render(d.logs || []);
    } catch (e) {
      if (window.toast) window.toast(e.message);
    }
  }

  function openAudit() {
    document.querySelectorAll('.section').forEach(s => { s.hidden = true; });
    $('#auditSection').hidden = false;
    $('#pageTitle').textContent = 'Manager Audit Timeline';
    loadManagers().then(loadAudit).catch(e => window.toast && window.toast(e.message));
  }

  function installNav() {
    const nav = $('#sideNav');
    if (!nav || nav.querySelector('[data-audit-nav]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = '🧾 Manager Audit';
    b.dataset.auditNav = '1';
    b.addEventListener('click', openAudit);
    nav.appendChild(b);
  }

  const style = document.createElement('style');
  style.textContent = '.audit-tools{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}.audit-tools select,.audit-tools input{width:auto;min-width:150px;margin:0}.audit-tools input{flex:1}.audit-tools select{padding:10px;border:1px solid #d5dee7;border-radius:10px}.audit-tools .primary{width:auto}.audit-tools+ .table-wrap pre{white-space:pre-wrap;margin:0;font:11px/1.35 ui-monospace,monospace;max-width:300px}';
  document.head.appendChild(style);

  const observer = new MutationObserver(installNav);
  observer.observe(document.body, { childList: true, subtree: true });
  installNav();
  document.addEventListener('click', e => { if (e.target.closest?.('#auditRefresh')) loadAudit(); });
  document.addEventListener('change', e => { if (e.target.closest?.('#auditManager,#auditDays')) loadAudit(); });
})();
