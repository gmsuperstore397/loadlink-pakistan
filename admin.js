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
  if (name === 'module') { $('#moduleTitle').textContent=title; loadModule(title); }
  else { $('#pageTitle').textContent = title; if (name === 'managers') loadManagers(); }
}

const MODULES = {
  customers:{permission:'customers.view',title:'Customers',path:'/admin/customers',columns:[['fullName','Name'],['mobile','Mobile'],['email','Email'],['city','City'],['status','Status'],['createdAt','Joined']]},
  drivers:{permission:'drivers.view',title:'Drivers',path:'/admin/drivers',columns:[['user.fullName','Name'],['user.mobile','Mobile'],['user.city','City'],['verification','Verification'],['vehicles.length','Vehicles']]},
  loads:{permission:'loads.view',title:'Loads',path:'/admin/loads',columns:[['pickupAddress','Pickup'],['destinationAddress','Destination'],['weightKg','Weight KG'],['status','Status'],['customer.fullName','Customer'],['createdAt','Posted']]},
  bookings:{permission:'bookings.view',title:'Bookings',path:'/admin/bookings',columns:[['id','ID'],['status','Status'],['agreedFare','Fare'],['customer.fullName','Customer'],['driver.user.fullName','Driver'],['vehicle.vehicleNumber','Vehicle']]},
  payments:{permission:'payments.verify',title:'Payments',path:'/admin/payments',columns:[['id','ID'],['amount','Amount'],['method','Method'],['status','Status'],['user.fullName','User'],['createdAt','Date']]},
  trips:{permission:'trips.view',title:'Trips',path:'/admin/trips',columns:[['id','ID'],['status','Status'],['pickup','Pickup'],['destination','Destination'],['driver.user.fullName','Driver'],['vehicle.vehicleNumber','Vehicle']]},
  reports:{permission:'reports.view',title:'Reports',path:'/admin/reports',columns:[]}
};

function val(obj,path){ return path.split('.').reduce((v,k)=>v==null?null:v[k],obj); }
function esc(v){ return String(v ?? '—').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function loadModule(title){
  const key=Object.keys(MODULES).find(k=>MODULES[k].title===title);
  if(!key)return;
  const m=MODULES[key];
  $('#moduleTitle').textContent=m.title; $('#moduleHint').textContent='Live records from the LoadLink database';
  try{
    const data=await api(m.path);
    if(key==='reports'){ renderReports(data); return; }
    const rows=data[key]||[];
    $('#moduleTable').thead;
    $('#moduleTable thead').innerHTML='<tr>'+m.columns.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr>';
    $('#moduleTable tbody').innerHTML=rows.length?rows.map(row=>'<tr>'+m.columns.map(c=>'<td>'+esc(val(row,c[0]))+'</td>').join('')+'<td>'+moduleActions(key,row)+'</td></tr>').join(''):'<tr><td colspan="'+(m.columns.length+1)+'">No records found</td></tr>';
  $('#moduleTable thead tr').insertAdjacentHTML('beforeend','<th>Actions</th>');
  }catch(e){toast(e.message);}
}
function moduleActions(key,row){
  if(!row?.id)return '';
  if(key==='customers') return '<button class="primary" type="button" onclick="editCustomer(\''+row.id+'\')">Edit</button>';
  if(key==='loads') return '<button class="primary" type="button" onclick="editLoad(\''+row.id+'\')">Edit</button>';
  if(key==='bookings') return '<button class="primary" type="button" onclick="editBooking(\''+row.id+'\')">Update</button>';
  if(key==='payments') return '<button class="primary" type="button" onclick="editPayment(\''+row.id+'\')">Verify</button>';
  return '';
}
async function patchModule(path,body,title){try{await api(path,{method:'PATCH',body:JSON.stringify(body)});toast('Updated successfully');await loadModule(title);}catch(e){toast(e.message);}}
async function editCustomer(id){const status=prompt('Status: ACTIVE or SUSPENDED','ACTIVE');if(status)await patchModule('/admin/customers/'+id,{status},'Customers');}
async function editLoad(id){const status=prompt('New load status','ACTIVE');if(status)await patchModule('/admin/loads/'+id,{status},'Loads');}
async function editBooking(id){const status=prompt('Booking status','APPROVED');if(status)await patchModule('/admin/bookings/'+id,{status},'Bookings');}
async function editPayment(id){const status=prompt('Payment status: PAID / FAILED / PENDING','PAID');if(status)await patchModule('/admin/payments/'+id,{status},'Payments');}

function renderReports(data){
  $('#moduleTable thead').innerHTML='<tr><th>Report</th><th>Value</th></tr>';
  const groups=[['Revenue (PKR)',data.revenue],['Users by role',data.usersByRole],['Loads by status',data.loadStatus],['Bookings by status',data.bookingStatus],['Payments by status',data.paymentStatus]];
  $('#moduleTable tbody').innerHTML=groups.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td><pre>'+esc(JSON.stringify(v,null,2))+'</pre></td></tr>').join('');
}
function renderNav() {
  const nav=$('#sideNav'); nav.innerHTML='';
  const items=[
    ['dashboard.view','📊 Dashboard','dashboard','Dashboard'],
    ['customers.view','👥 Customers','module','Customers'],
    ['drivers.view','🚛 Drivers','module','Drivers'],
    ['loads.view','📦 Loads','module','Loads'],
    ['bookings.view','🤝 Bookings','module','Bookings'],
    ['commission.verify','💰 Commission','module','Bookings'],
    ['payments.verify','💳 Payments','module','Payments'],
    ['trips.view','📍 Trips','module','Trips'],
    ['reports.view','📈 Reports','module','Reports']
  ];
  items.forEach(([permission,label,section,title])=>{
    if(!allowed(permission))return;
    const button=document.createElement('button'); button.type='button'; button.textContent=label;
    button.addEventListener('click',()=>{ $('#pageTitle').textContent=title; showSection(section,title); });
    nav.appendChild(button);
  });
  if(me?.role==='ADMIN'){
    const m=document.createElement('button');m.type='button';m.textContent='👨‍💼 Managers';m.onclick=()=>showSection('managers','Managers');nav.appendChild(m);
    const p=document.createElement('button');p.type='button';p.textContent='🔐 Permissions';p.onclick=()=>showSection('permissions','Permission Matrix');nav.appendChild(p);
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

$('#moduleRefresh').addEventListener('click', () => { const title=$('#moduleTitle').textContent; loadModule(title); });

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
