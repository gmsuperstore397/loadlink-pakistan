const $ = (s) => document.querySelector(s);

let token = localStorage.getItem('ll_admin_token');
let me = null;
let permissionCatalog = [];
let roleCatalog = [];
let managers = [];
let roleAccounts = [];

function portalRole(role) {
  return role && !['CUSTOMER','DRIVER'].includes(role);
}

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
  else if (name === 'workspace') { $('#pageTitle').textContent = title; loadWorkspace(); }
  else { $('#pageTitle').textContent = title; if (name === 'managers') loadManagers(); if (name === 'roleAccounts') loadRoleAccounts(); }
}

const MODULES = {
  customers:{permission:'customers.view',title:'Customers',path:'/admin/customers',columns:[['fullName','Name'],['mobile','Mobile'],['email','Email'],['city','City'],['status','Status'],['createdAt','Joined']]},
  drivers:{permission:'drivers.view',title:'Drivers',path:'/admin/drivers',columns:[['user.fullName','Name'],['user.mobile','Mobile'],['user.city','City'],['user.status','Account'],['verification','Verification'],['vehicles.length','Vehicles'],['trustScore','Trust Score']]},
  loads:{permission:'loads.view',title:'Loads',path:'/admin/loads',columns:[['pickupAddress','Pickup'],['destinationAddress','Destination'],['weightKg','Weight KG'],['status','Status'],['customer.fullName','Customer'],['createdAt','Posted']]},
  bookings:{permission:'bookings.view',title:'Bookings',path:'/admin/bookings',columns:[['id','ID'],['status','Status'],['agreedFare','Fare'],['customer.fullName','Customer'],['driver.user.fullName','Driver'],['vehicle.vehicleNumber','Vehicle']]},
  payments:{permission:'payments.verify',title:'Payments',path:'/admin/payments',columns:[['id','ID'],['amount','Amount'],['method','Method'],['status','Status'],['user.fullName','User'],['createdAt','Date']]},
  trips:{permission:'trips.view',title:'Trips',path:'/admin/trips',columns:[['id','ID'],['status','Status'],['pickup','Pickup'],['destination','Destination'],['driver.user.fullName','Driver'],['vehicle.vehicleNumber','Vehicle']]},
  disputes:{permission:'disputes.view',title:'Disputes',path:'/admin/disputes',columns:[['id','ID'],['status','Status'],['category','Category'],['raisedBy.fullName','Raised By'],['trip.id','Trip'],['createdAt','Created']]},
  sos:{permission:'sos.view',title:'SOS Alerts',path:'/admin/sos',columns:[['id','ID'],['status','Status'],['type','Type'],['raisedBy.fullName','Raised By'],['trip.id','Trip'],['createdAt','Created']]},
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
    window.moduleRows = window.moduleRows || {};
    window.moduleRows[key] = rows;
    $('#moduleTable').thead;
    $('#moduleTable thead').innerHTML='<tr>'+m.columns.map(c=>'<th>'+c[1]+'</th>').join('')+'</tr>';
    $('#moduleTable tbody').innerHTML=rows.length?rows.map(row=>'<tr>'+m.columns.map(c=>'<td>'+esc(val(row,c[0]))+'</td>').join('')+'<td>'+moduleActions(key,row)+'</td></tr>').join(''):'<tr><td colspan="'+(m.columns.length+1)+'">No records found</td></tr>';
  $('#moduleTable thead tr').insertAdjacentHTML('beforeend','<th>Actions</th>');
  }catch(e){toast(e.message);}
}
function moduleActions(key,row){
  if(!row?.id)return '';
  const id=esc(row.id);
  if(key==='customers') return '<button class="primary" type="button" data-action="edit-customer" data-id="'+id+'">Edit</button> <button class="primary danger-action" type="button" data-action="toggle-customer" data-id="'+id+'" data-status="'+esc(row.status)+'">'+(row.status==='SUSPENDED'?'Enable':'Disable')+'</button>';
  if(key==='drivers') return '<button class="primary danger-action" type="button" data-action="toggle-driver" data-id="'+id+'" data-status="'+esc(row.user?.status||'ACTIVE')+'">'+(row.user?.status==='SUSPENDED'?'Enable':'Disable')+'</button>';
  if(key==='loads') return '<button class="primary" type="button" data-action="edit-load" data-id="'+id+'">Edit</button>';
  if(key==='bookings') return '<button class="primary" type="button" data-action="edit-booking" data-id="'+id+'">Update</button>';
  if(key==='payments') return '<button class="primary" type="button" data-action="edit-payment" data-id="'+id+'">Verify</button>';
  if(key==='disputes') return '<button class="primary" type="button" data-action="edit-dispute" data-id="'+id+'">Review</button>';
  if(key==='sos') return '<button class="primary danger-action" type="button" data-action="edit-sos" data-id="'+id+'">Manage</button>';
  return '';
}
async function patchModule(path,body,title){try{await api(path,{method:'PATCH',body:JSON.stringify(body)});toast('Updated successfully');await loadModule(title);}catch(e){toast(e.message);}}
let editState = null;

const EDIT_CONFIG = {
  customers: {
    title: 'Edit Customer',
    path: id => '/admin/customers/' + id,
    fields: [
      {key:'fullName', label:'Name', type:'text'},
      {key:'city', label:'City', type:'text'},
      {key:'status', label:'Account Status', type:'select', options:['ACTIVE','SUSPENDED']}
    ]
  },
  loads: {
    title: 'Edit Load',
    path: id => '/admin/loads/' + id,
    fields: [
      {key:'status', label:'Load Status', type:'select', options:['POSTED','SEARCHING','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED']},
      {key:'pickupAddress', label:'Pickup Address', type:'text'},
      {key:'destinationAddress', label:'Destination Address', type:'text'}
    ]
  },
  bookings: {
    title: 'Update Booking',
    path: id => '/admin/bookings/' + id,
    fields: [
      {key:'status', label:'Booking Status', type:'select', options:['REQUESTED','ACCEPTED','REJECTED','CANCELLED','COMPLETED']},
      {key:'agreedFare', label:'Agreed Fare (PKR)', type:'number', step:'0.01'}
    ]
  },
  disputes: {
    title: 'Review Dispute',
    path: id => '/admin/disputes/' + id,
    fields: [
      {key:'status', label:'Status', type:'select', options:['OPEN','UNDER_REVIEW','RESOLVED','REJECTED']},
      {key:'resolution', label:'Resolution Note', type:'text'}
    ]
  },
  sos: {
    title: 'Manage SOS Alert',
    path: id => '/admin/sos/' + id,
    fields: [
      {key:'status', label:'SOS Status', type:'select', options:['OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED']}
    ]
  },
  payments: {
    title: 'Update Payment',
    path: id => '/admin/payments/' + id,
    fields: [
      {key:'status', label:'Payment Status', type:'select', options:['PENDING','PAID','FAILED','CANCELLED','REFUNDED']}
    ]
  }
};

function openEditModal(key, row) {
  const config = EDIT_CONFIG[key];
  if (!config) return;
  editState = {key, id: row.id, config};
  $('#editModalTitle').textContent = config.title;
  const box = $('#editFields');
  box.innerHTML = '';
  config.fields.forEach(field => {
    const label = document.createElement('label');
    label.textContent = field.label;
    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type;
      if (field.step) input.step = field.step;
    }
    input.id = 'editField_' + field.key;
    input.name = field.key;
    const value = field.key === 'agreedFare' ? (row[field.key] ?? '') : (row[field.key] ?? '');
    input.value = value;
    input.required = field.key !== 'city';
    label.appendChild(input);
    box.appendChild(label);
  });
  $('#editModal').hidden = false;
}

function closeEditModal() {
  $('#editModal').hidden = true;
  $('#editForm').reset();
  editState = null;
}

async function saveEditModal() {
  if (!editState) return;
  const body = {};
  editState.config.fields.forEach(field => {
    const el = $('#editField_' + field.key);
    if (field.key === 'agreedFare') {
      body[field.key] = el.value === '' ? null : Number(el.value);
    } else {
      body[field.key] = el.value;
    }
  });
  try {
    await api(editState.config.path(editState.id), {
      method:'PATCH',
      body:JSON.stringify(body)
    });
    toast('Updated successfully');
    const title = MODULES[editState.key].title;
    closeEditModal();
    await loadModule(title);
  } catch (error) {
    toast(error.message);
  }
}

async function editCustomer(id){const row=(window.moduleRows?.customers||[]).find(x=>x.id===id);if(row)openEditModal('customers',row);}
async function toggleCustomerAccount(id,current){const next=current==='SUSPENDED'?'ACTIVE':'SUSPENDED';if(!confirm(next==='SUSPENDED'?'Customer account disable karna hai?':'Customer account enable karna hai?'))return;await patchModule('/admin/customers/'+id+'/status',{status:next},'Customers');}
async function toggleDriverAccount(id,current){const next=current==='SUSPENDED'?'ACTIVE':'SUSPENDED';if(!confirm(next==='SUSPENDED'?'Driver account disable karna hai?':'Driver account enable karna hai?'))return;await patchModule('/admin/drivers/'+id+'/status',{status:next},'Drivers');}
async function editLoad(id){const row=(window.moduleRows?.loads||[]).find(x=>x.id===id);if(row)openEditModal('loads',row);}
async function editBooking(id){const row=(window.moduleRows?.bookings||[]).find(x=>x.id===id);if(row)openEditModal('bookings',row);}
async function editPayment(id){const row=(window.moduleRows?.payments||[]).find(x=>x.id===id);if(row)openEditModal('payments',row);}
async function editDispute(id){const row=(window.moduleRows?.disputes||[]).find(x=>x.id===id);if(row)openEditModal('disputes',row);}
async function editSOS(id){const row=(window.moduleRows?.sos||[]).find(x=>x.id===id);if(row)openEditModal('sos',row);}

function renderReports(data){
  $('#moduleTable thead').innerHTML='<tr><th>Report</th><th>Value</th></tr>';
  const groups=[['Revenue (PKR)',data.revenue],['Users by role',data.usersByRole],['Loads by status',data.loadStatus],['Bookings by status',data.bookingStatus],['Payments by status',data.paymentStatus]];
  $('#moduleTable tbody').innerHTML=groups.map(([k,v])=>'<tr><td>'+esc(k)+'</td><td><pre>'+esc(JSON.stringify(v,null,2))+'</pre></td></tr>').join('');
}
function roleLabel(role) {
  const found = roleCatalog.find((r) => r.role === role);
  return found?.label || role || 'Team';
}

function roleDashboardTitle() {
  const map = {
    MANAGER:'Manager Dashboard', FLEET_OWNER:'Fleet Dashboard', DISPATCHER:'Dispatch Dashboard',
    FREIGHT_BROKER:'Broker Dashboard', FREIGHT_FORWARDER:'Forwarder Dashboard', CUSTOMS_AGENT:'Customs Dashboard',
    PORT_AGENT:'Port Operations Dashboard', WAREHOUSE_OPERATOR:'Warehouse Dashboard', FINANCE:'Finance Dashboard',
    OPERATIONS:'Operations Dashboard', SUPPORT:'Support Dashboard', ADMIN:'Admin Dashboard'
  };
  return map[me?.role] || 'Dashboard';
}

function workspaceActionCell(row) {
  const role = me?.role;
  if (!row?.id) return '';
  if (role === 'FLEET_OWNER') {
    return '<button class="primary" type="button" data-workspace-action="fleet-edit" data-id="' + esc(row.id) + '">Edit</button> ' +
      (row.status === 'SUSPENDED'
        ? '<button class="primary" type="button" data-workspace-action="fleet-status" data-id="' + esc(row.id) + '" data-status="OFFLINE">Activate</button>'
        : '<button class="primary danger-action" type="button" data-workspace-action="fleet-status" data-id="' + esc(row.id) + '" data-status="SUSPENDED">Disable</button>');
  }
  if (role === 'DISPATCHER' && row.type === 'BOOKING' && ['REQUESTED','ACCEPTED'].includes(row.status)) {
    return '<button class="primary" type="button" data-workspace-action="assign-booking" data-id="' + esc(row.id) + '">Assign</button>';
  }
  if (role === 'FINANCE' && row.status === 'PENDING') {
    return '<button class="primary" type="button" data-workspace-action="verify-payment" data-id="' + esc(row.id) + '">Verify PAID</button>';
  }
  if (role === 'OPERATIONS' && row.type === 'BOOKING' && ['REQUESTED','ACCEPTED'].includes(row.status)) {
    return '<button class="primary" type="button" data-workspace-action="approve-deal" data-id="' + esc(row.id) + '">Approve Deal</button>';
  }
  if (role === 'OPERATIONS' && row.type === 'TRIP' && row.status !== 'DELIVERED') {
    return '<button class="primary" type="button" data-workspace-action="trip-status" data-id="' + esc(row.id) + '">Update Trip</button>';
  }
  if (role === 'SUPPORT' && row.type === 'SOS') {
    if (row.status === 'OPEN') return '<button class="primary" type="button" data-workspace-action="sos-ack" data-id="' + esc(row.id) + '">Acknowledge</button>';
    if (row.status === 'ACKNOWLEDGED') return '<button class="primary" type="button" data-workspace-action="sos-resolve" data-id="' + esc(row.id) + '">Resolve</button>';
  }
  if (role === 'SUPPORT' && row.type === 'DISPUTE' && row.status === 'OPEN') {
    return '<button class="primary" type="button" data-workspace-action="dispute-review" data-id="' + esc(row.id) + '">Review</button>';
  }
  if (role === 'SUPPORT' && row.type === 'DISPUTE' && row.status === 'UNDER_REVIEW') {
    return '<button class="primary" type="button" data-workspace-action="dispute-resolve" data-id="' + esc(row.id) + '">Resolve</button>';
  }
  return '';
}
async function loadWorkspace() {
  try {
    const data = await api('/admin/workspace');
    const w = data.workspace || {};
    $('#workspaceTitle').textContent = w.title || roleDashboardTitle();
    $('#fleetAddVehicleBtn').hidden = me?.role !== 'FLEET_OWNER';
    $('#workspaceHint').textContent = 'Role-specific operational workspace · live database data';
    $('#workspaceMetrics').innerHTML = Object.entries(w.metrics || {}).map(([key, value]) =>
      '<div class="stat"><span>' + esc(key.replace(/([A-Z])/g, ' $1')) + '</span><b>' + esc(value) + '</b></div>'
    ).join('');
    const rows = w.rows || [];
    const keys = rows.length ? Object.keys(rows[0]) : [];
    $('#workspaceTable thead').innerHTML = keys.length
      ? '<tr>' + keys.map(k => '<th>' + esc(k.replace(/([A-Z])/g, ' $1')) + '</th>').join('') + '<th>Actions</th></tr>'
      : '';
    $('#workspaceTable tbody').innerHTML = rows.length
      ? rows.map(row => '<tr>' + keys.map(k => '<td>' + esc(row[k]) + '</td>').join('') + '<td>' + workspaceActionCell(row) + '</td></tr>').join('')
      : '<tr><td>No operational records found</td></tr>';
  } catch (error) { toast(error.message); }
}

async function openFleetVehicle(vehicle) {
  try {
    const data = await api('/vehicles/fleet/drivers');
    const drivers = data.drivers || [];
    $('#fleetVehicleDriver').innerHTML = '<option value="">Select driver</option>' +
      drivers.map(d => '<option value="' + esc(d.id) + '">' + esc(d.user.fullName) + ' · ' + esc(d.user.mobile) + '</option>').join('');
    $('#fleetVehicleId').value = vehicle?.id || '';
    $('#fleetVehicleModalTitle').textContent = vehicle ? 'Edit Fleet Vehicle' : 'Add Fleet Vehicle';
    $('#fleetVehicleDriver').value = vehicle?.driverId || '';
    $('#fleetVehicleType').value = vehicle?.vehicleType || '';
    $('#fleetVehicleNumber').value = vehicle?.vehicleNumber || '';
    $('#fleetVehicleNumber').disabled = !!vehicle;
    $('#fleetVehicleCapacity').value = vehicle?.capacityKg ?? '';
    $('#fleetVehicleBrand').value = vehicle?.brand || '';
    $('#fleetVehicleModel').value = vehicle?.model || '';
    $('#fleetVehicleYear').value = vehicle?.year || '';
    $('#fleetVehicleStatus').value = vehicle?.status === 'SUSPENDED' ? 'SUSPENDED' : (vehicle?.status || 'OFFLINE');
    $('#fleetVehicleModal').hidden = false;
  } catch (error) { toast(error.message); }
}

async function saveFleetVehicle(event) {
  event.preventDefault();
  const id = $('#fleetVehicleId').value;
  const body = {
    driverId: $('#fleetVehicleDriver').value,
    vehicleType: $('#fleetVehicleType').value.trim(),
    vehicleNumber: $('#fleetVehicleNumber').value.trim(),
    capacityKg: Number($('#fleetVehicleCapacity').value),
    brand: $('#fleetVehicleBrand').value.trim(),
    model: $('#fleetVehicleModel').value.trim(),
    year: $('#fleetVehicleYear').value ? Number($('#fleetVehicleYear').value) : '',
    status: $('#fleetVehicleStatus').value,
  };
  try {
    await api('/vehicles/fleet' + (id ? '/' + id : ''), {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    });
    toast(id ? 'Fleet vehicle updated' : 'Fleet vehicle created');
    $('#fleetVehicleModal').hidden = true;
    await loadWorkspace();
  } catch (error) { toast(error.message); }
}

async function openDispatchAssignment(bookingId) {
  try {
    const data = await api('/admin/dispatch/options');
    const drivers = data.drivers || [];
    const vehicles = data.vehicles || [];
    if (!drivers.length || !vehicles.length) {
      toast('Verified driver ya available vehicle nahi mila');
      return;
    }
    $('#dispatchBookingId').value = bookingId;
    $('#dispatchDriver').innerHTML = '<option value="">Select driver</option>' +
      drivers.map(d => '<option value="' + esc(d.id) + '">' + esc(d.name) + ' · ' + esc(d.mobile) + '</option>').join('');
    const renderVehicles = (driverId) => {
      const list = vehicles.filter(v => !driverId || v.driverId === driverId);
      $('#dispatchVehicle').innerHTML = '<option value="">Select vehicle</option>' +
        list.map(v => '<option value="' + esc(v.id) + '">' + esc(v.vehicleNumber) + ' · ' + esc(v.vehicleType) + ' · ' + esc(v.capacityKg) + 'kg</option>').join('');
    };
    $('#dispatchDriver').onchange = () => renderVehicles($('#dispatchDriver').value);
    renderVehicles('');
    $('#dispatchBookingInfo').textContent = 'Booking ID: ' + bookingId;
    $('#dispatchModal').hidden = false;
  } catch (error) { toast(error.message); }
}

document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-workspace-action]');
  if (!btn) return;
  const action = btn.dataset.workspaceAction;
  const id = btn.dataset.id;
  try {
    if (action === 'fleet-edit') {
      const row = (await api('/vehicles/fleet')).vehicles.find(v => v.id === id);
      return openFleetVehicle(row);
    }
    if (action === 'fleet-status') {
      await api('/vehicles/fleet/' + id, { method:'PATCH', body:JSON.stringify({status:btn.dataset.status}) });
      toast(btn.dataset.status === 'SUSPENDED' ? 'Vehicle disabled' : 'Vehicle activated');
      return loadWorkspace();
    }
    if (action === 'approve-deal') {
      if (!confirm('Is deal ko Operations approval deni hai?')) return;
      await api('/admin/operations/bookings/' + id + '/approve', {method:'PATCH',body:JSON.stringify({})});
      toast('Deal approved');
      return loadWorkspace();
    }
    if (action === 'trip-status') {
      const status = prompt('New status: ASSIGNED, PICKED_UP, IN_TRANSIT, NEAR_DESTINATION, DELIVERED');
      if (!status) return;
      await api('/admin/operations/trips/' + id, {method:'PATCH',body:JSON.stringify({status:status.trim().toUpperCase()})});
      toast('Trip updated');
      return loadWorkspace();
    }
    if (action === 'assign-booking') return openDispatchAssignment(id);
    if (action === 'verify-payment') {
      if (!confirm('Is payment ko PAID verify karna hai?')) return;
      await api('/admin/payments/' + id, { method:'PATCH', body:JSON.stringify({status:'PAID'}) });
      toast('Payment verified');
      return loadWorkspace();
    }
    if (action === 'sos-ack') {
      await api('/admin/sos/' + id, { method:'PATCH', body:JSON.stringify({status:'ACKNOWLEDGED'}) });
      toast('SOS acknowledged');
      return loadWorkspace();
    }
    if (action === 'sos-resolve') {
      if (!confirm('SOS ko resolved mark karna hai?')) return;
      await api('/admin/sos/' + id, { method:'PATCH', body:JSON.stringify({status:'RESOLVED'}) });
      toast('SOS resolved');
      return loadWorkspace();
    }
    if (action === 'dispute-review') {
      await api('/admin/disputes/' + id, { method:'PATCH', body:JSON.stringify({status:'UNDER_REVIEW'}) });
      toast('Dispute review started');
      return loadWorkspace();
    }
    if (action === 'dispute-resolve') {
      const resolution = prompt('Resolution note likhein (minimum 5 characters):');
      if (!resolution || resolution.trim().length < 5) return;
      await api('/admin/disputes/' + id, { method:'PATCH', body:JSON.stringify({status:'RESOLVED', resolution:resolution.trim()}) });
      toast('Dispute resolved');
      return loadWorkspace();
    }
  } catch (error) { toast(error.message); }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'dispatchForm') return;
  event.preventDefault();
  const bookingId = $('#dispatchBookingId').value;
  const driverId = $('#dispatchDriver').value;
  const vehicleId = $('#dispatchVehicle').value;
  if (!bookingId || !driverId || !vehicleId) return;
  try {
    await api('/admin/dispatch/bookings/' + bookingId + '/assign', {
      method:'POST',
      body:JSON.stringify({driverId, vehicleId})
    });
    toast('Booking assigned aur trip create ho gaya');
    $('#dispatchModal').hidden = true;
    await loadWorkspace();
  } catch (error) { toast(error.message); }
});

$('#closeDispatch')?.addEventListener('click', () => { $('#dispatchModal').hidden = true; });
$('#dispatchModal')?.addEventListener('click', (event) => {
  if (event.target === $('#dispatchModal')) $('#dispatchModal').hidden = true;
});

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
    ['disputes.view','⚖️ Disputes','module','Disputes'],
    ['sos.view','🚨 SOS Alerts','module','SOS Alerts'],
    ['reports.view','📈 Reports','module','Reports']
  ];
  if (me?.role !== 'ADMIN' && allowed('dashboard.view')) {
    const workspace=document.createElement('button');
    workspace.type='button';
    workspace.textContent='🛠️ Operations Workspace';
    workspace.onclick=()=>showSection('workspace', roleDashboardTitle());
    nav.appendChild(workspace);
  }
  items.forEach(([permission,label,section,title])=>{
    if(!allowed(permission))return;
    const button=document.createElement('button'); button.type='button'; button.textContent=label;
    button.addEventListener('click',()=>{ $('#pageTitle').textContent=title; showSection(section,title); });
    nav.appendChild(button);
  });
  if(me?.role==='ADMIN'){
    const r=document.createElement('button');r.type='button';r.textContent='🧩 Role Management';r.onclick=()=>showSection('roleAccounts','Role Management');nav.appendChild(r);
    const m=document.createElement('button');m.type='button';m.textContent='👨‍💼 Managers';m.onclick=()=>showSection('managers','Managers');nav.appendChild(m);
    const p=document.createElement('button');p.type='button';p.textContent='🔐 Permissions';p.onclick=()=>showSection('permissions','Permission Matrix');nav.appendChild(p);
  }
}

async function loadDashboard() {
  try {
    $('#pageTitle').textContent = roleDashboardTitle();
    $('#roleText').textContent = roleLabel(me?.role);
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
    const data = await api('/admin/role-catalog');
    permissionCatalog = data.permissions || [];
    roleCatalog = data.roles || [];
    $('#permissionInfo').innerHTML = permissionCatalog
      .map((permission) => '<span class="tag">' + permission + '</span>')
      .join('');
    renderRoleOptions();
  } catch (error) {
    toast(error.message);
  }
}

function renderRoleOptions() {
  const select = $('#roleAccountRole');
  if (!select) return;
  select.innerHTML = '<option value="">Select role</option>' + roleCatalog
    .filter((r) => r.role !== 'ADMIN' && r.role !== 'CUSTOMER' && r.role !== 'DRIVER')
    .map((r) => '<option value="' + esc(r.role) + '">' + esc(r.label) + '</option>')
    .join('');
}

function renderRoleAccountRow(account) {
  const row = document.createElement('div');
  row.className = 'manager-row';
  const identity = document.createElement('div');
  identity.innerHTML = '<b>' + esc(account.fullName) + '</b><br><small>' + esc(account.email) + ' · ' + esc(account.mobile) + '</small>';
  const role = document.createElement('div');
  role.innerHTML = '<span class="pill">' + esc(account.role) + '</span><br><small>' + esc(account.status) + '</small>';
  const tags = document.createElement('div');
  tags.className = 'tags';
  (account.permissions || []).forEach((permission) => {
    const tag = document.createElement('span');
    tag.className = 'tag'; tag.textContent = permission; tags.appendChild(tag);
  });
  const actions = document.createElement('div');
  const edit = document.createElement('button');
  edit.className='primary'; edit.type='button'; edit.textContent='Edit';
  edit.addEventListener('click',()=>openRoleAccount(account));
  const toggle = document.createElement('button');
  toggle.className='primary danger-action'; toggle.type='button';
  toggle.textContent=account.status==='ACTIVE'?'Suspend':'Activate';
  toggle.addEventListener('click',()=>toggleRoleAccount(account));
  actions.append(edit,document.createTextNode(' '),toggle);
  row.append(identity,role,tags,actions);
  return row;
}

async function loadRoleAccounts() {
  try {
    const data = await api('/admin/role-accounts');
    roleAccounts = data.accounts || [];
    const container = $('#roleAccountList');
    container.innerHTML = '';
    if (!roleAccounts.length) {
      container.innerHTML = '<p class="muted">No role accounts yet.</p>';
      return;
    }
    roleAccounts.forEach((account) => container.appendChild(renderRoleAccountRow(account)));
  } catch (error) { toast(error.message); }
}

function openRoleAccount(account) {
  $('#roleAccountModal').hidden=false;
  $('#roleAccountModalTitle').textContent=account?'Edit Role Account':'Create Role Account';
  $('#roleAccountId').value=account?.id||'';
  $('#roleAccountRole').value=account?.role||'';
  $('#roleAccountRole').disabled=!!account;
  $('#roleAccountName').value=account?.fullName||'';
  $('#roleAccountEmail').value=account?.email||'';
  $('#roleAccountMobile').value=account?.mobile||'';
  $('#roleAccountEmail').disabled=!!account;
  $('#roleAccountMobile').disabled=!!account;
  $('#roleAccountPassword').required=!account;
  $('#roleAccountPassword').value='';
  const box=$('#roleAccountPermissionChecks'); box.innerHTML='';
  permissionCatalog.forEach((permission)=>{
    const label=document.createElement('label');
    const input=document.createElement('input');
    input.type='checkbox'; input.value=permission;
    input.checked=(account?.permissions||[]).includes(permission);
    label.append(input,document.createTextNode(' '+permission));
    box.appendChild(label);
  });
}

async function toggleRoleAccount(account) {
  const next=account.status==='ACTIVE'?'SUSPENDED':'ACTIVE';
  if(!confirm(next==='SUSPENDED'?'Is role account ko suspend karna hai?':'Is role account ko activate karna hai?')) return;
  try {
    await api('/admin/role-accounts/'+account.id,{method:'PATCH',body:JSON.stringify({status:next})});
    toast(next==='ACTIVE'?'Account activated':'Account suspended');
    await loadRoleAccounts();
  } catch(error){ toast(error.message); }
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

$('#moduleRefresh').addEventListener('click', async () => {
  const title = $('#moduleTitle').textContent;
  const btn = $('#moduleRefresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';
  try { await loadModule(title); } finally { btn.disabled = false; btn.textContent = 'Refresh'; }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('button[data-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.action;
  const id = button.dataset.id;
  try {
    if (action === 'edit-customer') return editCustomer(id);
    if (action === 'toggle-customer') return toggleCustomerAccount(id, button.dataset.status);
    if (action === 'toggle-driver') return toggleDriverAccount(id, button.dataset.status);
    if (action === 'edit-load') return editLoad(id);
    if (action === 'edit-booking') return editBooking(id);
    if (action === 'edit-payment') return editPayment(id);
    if (action === 'edit-dispute') return editDispute(id);
    if (action === 'edit-sos') return editSOS(id);
  } catch (error) { toast('Action error: ' + error.message); }
}, true);

window.addEventListener('error', (event) => {
  if (event?.message) toast('Admin error: ' + event.message);
});

$('#newRoleAccountBtn').addEventListener('click', () => openRoleAccount(null));
$('#closeRoleAccount').addEventListener('click', () => { $('#roleAccountModal').hidden = true; });
$('#roleAccountModal').addEventListener('click', (event) => { if (event.target === $('#roleAccountModal')) $('#roleAccountModal').hidden = true; });
$('#roleAccountRole').addEventListener('change', () => {
  const role=$('#roleAccountRole').value;
  const hint=document.querySelector('#roleAccountModal .muted');
  if(hint) hint.textContent = role==='MANAGER' ? 'Manager ke liye selected permissions save hongi.' : 'Is role ke liye role-based default permissions use hongi.';
});
$('#roleAccountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id=$('#roleAccountId').value;
  const selected=[...document.querySelectorAll('#roleAccountPermissionChecks input:checked')].map(x=>x.value);
  const body={role:$('#roleAccountRole').value,fullName:$('#roleAccountName').value.trim(),permissions:selected};
  if(!id) Object.assign(body,{email:$('#roleAccountEmail').value.trim(),mobile:$('#roleAccountMobile').value.replace(/\s+/g,''),password:$('#roleAccountPassword').value});
  else if($('#roleAccountPassword').value) body.password=$('#roleAccountPassword').value;
  try {
    await api('/admin/role-accounts'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify(body)});
    toast('Role account saved');
    $('#roleAccountModal').hidden=true;
    await loadRoleAccounts();
  } catch(error){ toast(error.message); }
});

$('#newManagerBtn').addEventListener('click', () => openManager(null));
$('#closeManager').addEventListener('click', () => { $('#managerModal').hidden = true; });
$('#closeEdit').addEventListener('click', closeEditModal);
$('#editModal').addEventListener('click', (event) => { if (event.target === $('#editModal')) closeEditModal(); });
$('#editForm').addEventListener('submit', async (event) => { event.preventDefault(); await saveEditModal(); });

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

    if (!portalRole(data.user.role)) {
      throw new Error('Admin portal sirf team/professional accounts ke liye hai');
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

$('#workspaceRefresh')?.addEventListener('click', loadWorkspace);
$('#fleetAddVehicleBtn')?.addEventListener('click', () => openFleetVehicle(null));
$('#closeFleetVehicle')?.addEventListener('click', () => { $('#fleetVehicleModal').hidden = true; });
$('#fleetVehicleModal')?.addEventListener('click', (event) => { if (event.target === $('#fleetVehicleModal')) $('#fleetVehicleModal').hidden = true; });
$('#fleetVehicleForm')?.addEventListener('submit', saveFleetVehicle);

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

    if (!portalRole(me.role)) {
      throw new Error('Team account required');
    }

    initializePortal();
  } catch (_) {
    localStorage.removeItem('ll_admin_token');
    token = null;
    setView(false);
  }
})();
