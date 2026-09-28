const $ = (s) => document.querySelector(s);

let token = localStorage.getItem('ll_admin_token');
let me = null;
let permissionCatalog = [];
let managers = [];

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data.data || data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2500);
}

function setView(loggedIn) {
  $('#loginView').hidden = loggedIn;
  $('#portal').hidden = !loggedIn;
}

function myPermissions() {
  try { return JSON.parse(me?.permissions || '[]'); } catch (_) { return []; }
}

function allowed(permission) {
  return me?.role === 'ADMIN' || myPermissions().includes(permission);
}

function clearSections() {
  document.querySelectorAll('.section').forEach((section) => { section.hidden = true; });
}

function showSection(name, title = name) {
  clearSections();
  const section = $('#' + name + 'Section');
  if (section) section.hidden = false;
  $('#pageTitle').textContent = title;
  if (name === 'managers') loadManagers();
}

function renderNav() {
  const nav = $('#sideNav');
  nav.innerHTML = '';

  const items = [
    ['dashboard.view', '📊 Dashboard', 'dashboard'],
    ['customers.view', '👥 Customers', 'customers'],
    ['drivers.view', '🚛 Drivers', 'drivers'],
    ['loads.view', '📦 Loads', 'loads'],
    ['bookings.view', '🤝 Bookings', 'bookings'],
    ['commission.verify', '💰 Commission', 'commission'],
    ['payments.verify', '💳 Payments', 'payments'],
    ['trips.view', '📍 Trips', 'trips'],
    ['reports.view', '📈 Reports', 'reports'],
  ];

  items.forEach(([permission, label, section]) => {
    if (!allowed(permission)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      showSection('dashboard', label);
      toast('Module foundation ready — operational screen next.');
    });
    nav.appendChild(button);
  });

  if (me?.role === 'ADMIN') {
    const managersButton = document.createElement('button');
    managersButton.type = 'button';
    managersButton.textContent = '👨‍💼 Managers';
    managersButton.addEventListener('click', () => showSection('managers', 'Managers'));
    nav.appendChild(managersButton);

    const permissionsButton = document.createElement('button');
    permissionsButton.type = 'button';
    permissionsButton.textContent = '🔐 Permissions';
    permissionsButton.addEventListener('click', () => showSection('permissions', 'Permission Matrix'));
    nav.appendChild(permissionsButton);
  }
}

async function loadDashboard() {
  try {
    const data = await api('/admin/dashboard');
    $('#stats').innerHTML = Object.entries(data).map(([key, value]) => (
      '<div class="stat"><span>' +
      key.replace(/([A-Z])/g, ' $1') +
      '</span><b>' + value + '</b></div>'
    )).join('');
  } catch (error) {
    toast(error.message);
  }
}

async function loadPermissions() {
  try {
    const data = await api('/admin/permissions');
    permissionCatalog = data.permissions || [];
    $('#permissionInfo').innerHTML = permissionCatalog
      .map((permission) => '<span class="tag">' + permission + '</span>')
      .join('');
  } catch (error) {
    toast(error.message);
  }
}

function renderManagerRow(manager) {
  const row = document.createElement('div');
  row.className = 'manager-row';

  const identity = document.createElement('div');
  identity.innerHTML = '<b>' + manager.fullName + '</b><br><small>' +
    manager.email + ' · ' + manager.mobile + '</small>';

  const status = document.createElement('div');
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = manager.status;
  status.appendChild(pill);

  const tags = document.createElement('div');
  tags.className = 'tags';
  (manager.permissions || []).forEach((permission) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = permission;
    tags.appendChild(tag);
  });

  const actions = document.createElement('div');
  const edit = document.createElement('button');
  edit.className = 'primary';
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => openManager(manager));

  const toggle = document.createElement('button');
  toggle.className = 'primary';
  toggle.type = 'button';
  toggle.style.background = '#b42318';
  toggle.textContent = manager.status === 'ACTIVE' ? 'Suspend' : 'Activate';
  toggle.addEventListener('click', () => toggleManager(manager));

  actions.append(edit, document.createTextNode(' '), toggle);
  row.append(identity, status, tags, actions);
  return row;
}

async function loadManagers() {
  try {
    const data = await api('/admin/managers');
    managers = data.managers || [];
    const container = $('#managerList');
    container.innerHTML = '';
    if (!managers.length) {
      container.innerHTML = '<p class="muted">No managers yet.</p>';
      return;
    }
    managers.forEach((manager) => container.appendChild(renderManagerRow(manager)));
  } catch (error) {
    toast(error.message);
  }
}

async function toggleManager(manager) {
  try {
    await api('/admin/managers/' + manager.id, {
      method: 'PATCH',
      body: JSON.stringify({
        status: manager.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    });
    toast(manager.status === 'ACTIVE' ? 'Manager suspended' : 'Manager activated');
    await loadManagers();
  } catch (error) {
    toast(error.message);
  }
}

function openManager(manager) {
  $('#managerModal').hidden = false;
  $('#managerId').value = manager?.id || '';
  $('#managerModalTitle').textContent = manager ? 'Edit Manager' : 'Create Manager';
  $('#managerName').value = manager?.fullName || '';
  $('#managerEmail').value = manager?.email || '';
  $('#managerMobile').value = manager?.mobile || '';
  $('#managerEmail').disabled = !!manager;
  $('#managerMobile').disabled = !!manager;
  $('#managerPassword').required = !manager;
  $('#managerPassword').value = '';

  $('#permissionChecks').innerHTML = '';
  permissionCatalog.forEach((permission) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = permission;
    input.checked = (manager?.permissions || []).includes(permission);
    label.append(input, document.createTextNode(' ' + permission));
    $('#permissionChecks').appendChild(label);
  });
}

$('#newManagerBtn').addEventListener('click', () => openManager(null));
$('#closeManager').addEventListener('click', () => { $('#managerModal').hidden = true; });

$('#managerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('#managerId').value;
  const selectedPermissions = [...document.querySelectorAll('#permissionChecks input:checked')]
    .map((input) => input.value);

  const body = {
    fullName: $('#managerName').value.trim(),
    permissions: selectedPermissions,
  };

  if (!id) {
    Object.assign(body, {
      email: $('#managerEmail').value.trim(),
      mobile: $('#managerMobile').value.replace(/\s+/g, ''),
      password: $('#managerPassword').value,
    });
  } else if ($('#managerPassword').value) {
    body.password = $('#managerPassword').value;
  }

  try {
    await api('/admin/managers' + (id ? '/' + id : ''), {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    });
    toast('Manager saved');
    $('#managerModal').hidden = true;
    await loadManagers();
  } catch (error) {
    toast(error.message);
  }
});

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#loginError').textContent = '';

  try {
    const identifier = $('#loginId').value.trim();
    const password = $('#loginPassword').value;
    const body = identifier.includes('@')
      ? { email: identifier.toLowerCase(), password }
      : { mobile: identifier.replace(/\s+/g, ''), password };

    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!['ADMIN', 'MANAGER'].includes(data.user.role)) {
      throw new Error('Admin portal sirf team accounts ke liye hai');
    }

    token = data.token;
    me = data.user;
    localStorage.setItem('ll_admin_token', token);
    initializePortal();
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
});

function initializePortal() {
  setView(true);
  $('#identity').innerHTML = '<b>' + me.fullName + '</b><br><small>' + me.role + '</small>';
  $('#roleText').textContent = me.role === 'ADMIN'
    ? 'Full system access'
    : 'Permission based access';
  $('#statusPill').textContent = me.status;
  renderNav();

  if (me.role === 'ADMIN') {
    loadPermissions();
    loadDashboard();
  } else if (allowed('dashboard.view')) {
    loadDashboard();
  }
}

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('ll_admin_token');
  token = null;
  me = null;
  setView(false);
});

(async function restoreSession() {
  if (!token) {
    setView(false);
    return;
  }

  try {
    const data = await api('/auth/me');
    me = data.user || data;

    if (!['ADMIN', 'MANAGER'].includes(me.role)) {
      throw new Error('Team account required');
    }

    initializePortal();
  } catch (_) {
    localStorage.removeItem('ll_admin_token');
    token = null;
    setView(false);
  }
})();
