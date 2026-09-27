'use strict';

/* ============================================================
   LOADLINK PAKISTAN — Frontend application logic
   Talks to the backend REST API. No password is ever stored
   in localStorage — only the JWT token.
   ============================================================ */

const API_BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

const VEHICLE_TYPES = [
  'Loader Rickshaw', 'Suzuki Loader', 'Mazda', 'Shazore', 'Mini Truck',
  'Pickup', 'Mini Van', '10 Wheeler', '12 Wheeler', '14 Wheeler',
  '16 Wheeler', '18 Wheeler', '22 Wheeler', 'Trailer', 'Container',
];

const VEHICLE_CAPACITY = {
  'Loader Rickshaw': '500 KG', 'Suzuki Loader': '1 Ton', 'Mazda': '2 Ton',
  'Shazore': '3 Ton', 'Mini Truck': '5 Ton', 'Pickup': '1 Ton', 'Mini Van': '1.5 Ton',
  '10 Wheeler': '10 Ton', '12 Wheeler': '12 Ton', '14 Wheeler': '14 Ton',
  '16 Wheeler': '16 Ton', '18 Wheeler': '18 Ton', '22 Wheeler': '22 Ton',
  'Trailer': '40 Ton', 'Container': '40 Ton',
};

const state = {
  token: localStorage.getItem('ll_token') || null,
  user: JSON.parse(localStorage.getItem('ll_user') || 'null'),
  map: null,
  mapMarker: null,
  mapTarget: null, // 'pickup' | 'destination'
  pickupCoords: null,
  destinationCoords: null,
  pendingOtpEmail: null,
};

/* ---------------- generic helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

async function apiRequest(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let resp;
  try {
    resp = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (e) {
    toast('Server se connection nahi ho saka. Thori dair baad dobara try karein.');
    throw e;
  }

  let data;
  try { data = await resp.json(); } catch (e) { data = {}; }

  if (!resp.ok) {
    const message = data.message || 'Something went wrong';
    throw new Error(message);
  }
  return data.data || {};
}

/* ---------------- auth API ---------------- */
function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('ll_token', token);
  localStorage.setItem('ll_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('ll_token');
  localStorage.removeItem('ll_user');
}

async function loginUser(mobileOrEmail, password) {
  const isEmail = mobileOrEmail.includes('@');
  const body = { password, ...(isEmail ? { email: mobileOrEmail } : { mobile: mobileOrEmail }) };
  const data = await apiRequest('/auth/login', { method: 'POST', body });
  saveSession(data.token, data.user);
  return data.user;
}

async function registerUser(payload) {
  return apiRequest('/auth/register', { method: 'POST', body: payload });
}

async function registerTransporter(formData) {
  return apiRequest('/transporters/register', { method: 'POST', body: formData, isForm: true });
}

const verifyOtp = (email, otp) => apiRequest('/auth/verify-otp', {
  method: 'POST',
  body: { email, otp },
});
const resendOtp = (email) => apiRequest('/auth/resend-otp', {
  method: 'POST',
  body: { email },
});

/* ---------------- feature API ---------------- */
const createLoad = (payload) => apiRequest('/loads', { method: 'POST', body: payload });
const getRecommendations = (payload) => apiRequest('/recommendations/vehicle', { method: 'POST', body: payload });
const findVehicles = (query) => apiRequest(`/vehicles/available?${new URLSearchParams(query)}`);
const findLoads = (query) => apiRequest(`/loads?${new URLSearchParams(query)}`);
const getReturnLoads = (query) => apiRequest(`/return-loads?${new URLSearchParams(query)}`);
const createBooking = (body) => apiRequest('/bookings', { method: 'POST', body });
const getMyBookings = () => apiRequest('/bookings/my');
const acceptBooking = (id, agreedFare) => apiRequest(`/bookings/${id}/accept`, { method: 'PATCH', body: agreedFare ? { agreedFare: Number(agreedFare) } : {} });
const rejectBooking = (id) => apiRequest(`/bookings/${id}/reject`, { method: 'PATCH' });
const estimateFare = (payload) => apiRequest('/fare/estimate', { method: 'POST', body: payload });
const getLiveTrip = (tripId) => apiRequest(`/trips/${tripId}/live`);

const getTrips = () => apiRequest('/trips');
const updateTripLocation = (tripId, latitude, longitude) => apiRequest(`/trips/${tripId}/location`, { method: 'PATCH', body: { latitude, longitude } });
const updateTripStatus = (tripId, status) => apiRequest(`/trips/${tripId}/status`, { method: 'PATCH', body: { status } });
const forgotPassword = (identifier) => apiRequest('/auth/forgot-password', { method: 'POST', body: identifier.includes('@') ? { email: identifier } : { mobile: identifier } });
const resetPassword = (token, password) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
const getNotifications = () => apiRequest('/notifications');
const getUnreadCount = () => apiRequest('/notifications/unread-count');
const markAllRead = () => apiRequest('/notifications/read-all', { method: 'PATCH' });
const createPayment = (body) => apiRequest('/payments', { method: 'POST', body });
const getPayments = () => apiRequest('/payments');
const getAdminDashboard = () => apiRequest('/admin/dashboard');
const getAdminPayments = () => apiRequest('/admin/payments/summary');
const getAdminDocuments = () => apiRequest('/admin/documents/expiring');
const getPendingDrivers = () => apiRequest('/admin/transporters/pending');
const verifyDriver = (id) => apiRequest(`/admin/transporters/${id}/verify`, { method: 'PATCH' });
const rejectDriver = (id, reason) => apiRequest(`/admin/transporters/${id}/reject`, { method: 'PATCH', body: { reason } });
const subscribePush = (subscription) => apiRequest('/push/subscribe', { method: 'POST', body: subscription });


/* ============================================================
   NAVIGATION
   ============================================================ */
function initNav() {
  const navTargets = { home: '#home', findtruck: '#findtruck', postload: '#postload', findload: '#findload', returnloads: '#returnloads', livetrips: '#livetrips', categories: '#categories' };
  $('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = navTargets[el.dataset.nav];
      if (target) {
        e.preventDefault();
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      $('#navMobile').classList.remove('open');
    });
  });

  $('#hamburgerBtn').addEventListener('click', () => {
    const nav = $('#navMobile');
    const open = nav.classList.toggle('open');
    $('#hamburgerBtn').setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('loginModal');
      closeModal('signupModal');
      closeMapModal();
    }
  });
}

/* ============================================================
   MODALS (login / signup)
   ============================================================ */
function openModal(id) { $(`#${id}`).classList.add('open'); }
function closeModal(id) { $(`#${id}`).classList.remove('open'); }

function initAuthModals() {
  $('#loginBtn').addEventListener('click', () => openModal('loginModal'));
  $('#loginBtnMobile').addEventListener('click', () => openModal('loginModal'));
  $('#signupBtn').addEventListener('click', () => openModal('signupModal'));
  $('#signupBtnMobile').addEventListener('click', () => openModal('signupModal'));
  $('#heroDriverBtn').addEventListener('click', () => {
    openModal('signupModal');
    setSignupTab('driver');
  });

  $$('.modal-close').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.modal').forEach((modal) => modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  }));

  $('#forgotPasswordBtn').addEventListener('click', () => {
    closeModal('loginModal');
    openModal('resetPasswordModal');
  });
  $('#requestResetBtn').addEventListener('click', async () => {
    const identifier = $('#resetIdentifier').value.trim();
    if (!identifier) return toast('Mobile ya email enter karein.');
    try {
      const result = await forgotPassword(identifier);
      if (result.developmentResetToken) {
        $('#resetToken').value = result.developmentResetToken;
        toast('Development reset token mil gaya.');
      } else toast(result.message || 'Reset instructions bhej di gayi hain.');
    } catch (err) { toast(err.message); }
  });
  $('#resetPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await resetPassword($('#resetToken').value.trim(), $('#resetNewPassword').value);
      toast('Password reset ho gaya. Ab login karein.');
      closeModal('resetPasswordModal');
      openModal('loginModal');
    } catch (err) { toast(err.message); }
  });

  // login form
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await loginUser($('#loginIdentifier').value.trim(), $('#loginPassword').value);
      toast(`Welcome back, ${user.fullName}!`);
      closeModal('loginModal');
      updateAuthUI();
    } catch (err) { toast(err.message); }
  });

  // signup tabs
  $$('.signup-tab').forEach((tab) => tab.addEventListener('click', () => setSignupTab(tab.dataset.role)));

  // customer signup
  $('#customerSignupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await registerUser({
        fullName: $('#cFullName').value.trim(),
        mobile: $('#cMobile').value.trim(),
        email: $('#cEmail').value.trim(),
        password: $('#cPassword').value,
        city: $('#cCity').value.trim() || undefined,
      });
      state.pendingOtpEmail = $('#cEmail').value.trim();
      closeModal('signupModal'); openModal('otpModal');
      toast(result.otpDeliveryConfigured ? 'Email OTP bhej diya gaya hai.' : 'Email provider configure karna baqi hai.');
    } catch (err) { toast(err.message); }
  });

  $('#otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await verifyOtp(state.pendingOtpEmail, $('#otpCode').value.trim());
      saveSession(result.token, result.user);
      closeModal('otpModal');
      $('#otpCode').value = '';
      state.pendingOtpEmail = null;
      updateAuthUI();
      toast('Email verify ho gaya. Welcome!');
    } catch (err) { toast(err.message); }
  });
  $('#resendOtpBtn').addEventListener('click', async () => {
    try {
      const result = await resendOtp(state.pendingOtpEmail);
      toast(result.otpDeliveryConfigured ? 'OTP dobara bhej diya gaya.' : 'Email provider configure nahi hai.');
    } catch (err) { toast(err.message); }
  });

  // driver signup
  $('#driverSignupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('fullName', $('#dFullName').value.trim());
    fd.append('mobile', $('#dMobile').value.trim());
    fd.append('email', $('#dEmail').value.trim());
    fd.append('cnic', $('#dCnic').value.trim());
    fd.append('city', $('#dCity').value.trim());
    fd.append('password', $('#dPassword').value);
    fd.append('vehicleType', $('#dVehicleType').value);
    fd.append('vehicleNumber', $('#dVehicleNumber').value.trim());
    fd.append('capacityKg', $('#dCapacity').value);
    fd.append('drivingLicense', $('#dLicense').value.trim());
    try {
      const result = await registerTransporter(fd);
      state.pendingOtpEmail = $('#dEmail').value.trim();
      closeModal('signupModal'); openModal('otpModal');
      toast(result.otpDeliveryConfigured ? 'Email OTP bhej diya gaya hai.' : 'Email provider configure karna baqi hai.');
    } catch (err) { toast(err.message); }
  });
}

function setSignupTab(role) {
  $$('.signup-tab').forEach((t) => t.classList.toggle('active', t.dataset.role === role));
  $('#customerSignupForm').hidden = role !== 'customer';
  $('#driverSignupForm').hidden = role !== 'driver';
}

async function loadAdminDashboard() {
  if (!state.user || state.user.role !== 'ADMIN') return;
  try {
    const [stats, payments, docs, drivers] = await Promise.all([getAdminDashboard(), getAdminPayments(), getAdminDocuments(), getPendingDrivers()]);
    $('#adminDashboard').hidden = false;
    $('#adminStats').innerHTML = Object.entries(stats).map(([k,v]) => `<p><b>${k}</b>: ${v}</p>`).join('');
    $('#adminPayments').innerHTML = `<p>Pending: ${payments.pending}</p><p>Paid: ${payments.paid}</p><p>Total paid: PKR ${Number(payments.totalPaid).toLocaleString()}</p>`;
    $('#adminDocuments').innerHTML = `<p>Drivers with expiring docs: ${docs.drivers.length}</p><p>Vehicles with expiring docs: ${docs.vehicles.length}</p>`;
    $('#adminDrivers').innerHTML = drivers.pending.map(d => `<div class="result-card"><b>${d.user.fullName}</b><p>${d.user.mobile} · ${d.verification}</p><button class="btn btn-primary admin-verify-btn" data-driver="${d.id}">Verify</button><button class="btn btn-outline admin-reject-btn" data-driver="${d.id}">Reject</button></div>`).join('') || '<p class="muted-empty">No pending drivers.</p>';
  } catch (err) { console.warn('Admin dashboard failed', err); }
}

async function loadDashboard() {
  if (!state.user) return;
  try {
    const [n, p, u] = await Promise.all([getNotifications(), getPayments(), getUnreadCount()]);
    if (state.user.role === 'DRIVER') {
      const b = await getMyBookings();
      const pending = (b.bookings || []).filter(x => x.status === 'REQUESTED');
      $('#driverBookingsCard').hidden = false;
      $('#driverBookings').innerHTML = pending.map(x => '<div class="result-card"><b>' + x.load.pickupAddress + ' → ' + x.load.destinationAddress + '</b><p>' + x.load.description + ' · ' + x.load.weightKg + ' kg</p><button class="btn btn-primary accept-booking-btn" data-booking="' + x.id + '">Accept</button> <button class="btn btn-outline reject-booking-btn" data-booking="' + x.id + '">Reject</button></div>').join('') || '<p class="muted-empty">No pending booking requests.</p>';
    }
    $('#unreadBadge').textContent = u.count ? `(${u.count})` : '';
    $('#notificationList').innerHTML = (n.notifications || []).map(x => `
      <div class="result-card"><b>${x.title}</b><p>${x.message}</p><small>${new Date(x.createdAt).toLocaleString()}</small></div>
    `).join('') || '<p class="muted-empty">No notifications.</p>';
    $('#paymentList').innerHTML = (p.payments || []).map(x => `
      <div class="result-card"><b>PKR ${Number(x.amount).toLocaleString()}</b><p>${x.method} · ${x.status}</p><small>${new Date(x.createdAt).toLocaleString()}</small></div>
    `).join('') || '<p class="muted-empty">No payments.</p>';
  } catch (err) {}
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.trip-status-btn');
  if (!btn) return;
  try {
    await updateTripStatus(btn.dataset.trip, btn.dataset.status);
    toast('Trip status update ho gaya.');
    await loadLiveTrips();
  } catch (err) { toast(err.message); }
});

document.addEventListener('click', async (e) => {
  const verify = e.target.closest('.admin-verify-btn');
  const reject = e.target.closest('.admin-reject-btn');
  try {
    if (verify) { await verifyDriver(verify.dataset.driver); toast('Driver verified.'); await loadAdminDashboard(); }
    if (reject) { const reason = prompt('Rejection reason?') || 'Documents not approved'; await rejectDriver(reject.dataset.driver, reason); toast('Driver rejected.'); await loadAdminDashboard(); }
  } catch (err) { toast(err.message); }
});

document.addEventListener('click', async (e) => {
  const accept = e.target.closest('.accept-booking-btn');
  const reject = e.target.closest('.reject-booking-btn');
  try {
    if (accept) {
      const fare = prompt('Agreed fare (PKR), optional:');
      await acceptBooking(accept.dataset.booking, fare);
      toast('Booking accept ho gayi aur trip create ho gaya.');
      await loadDashboard(); await loadLiveTrips();
    }
    if (reject) {
      await rejectBooking(reject.dataset.booking);
      toast('Booking reject kar di gayi.');
      await loadDashboard();
    }
  } catch (err) { toast(err.message); }
});

function initDashboard() {
  $('#markAllReadBtn').addEventListener('click', async () => {
    if (!state.user) return toast('Pehle login karein.');
    try { await markAllRead(); await loadDashboard(); toast('Notifications read mark ho gayi hain.'); } catch (err) { toast(err.message); }
  });
  $('#paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return toast('Payment ke liye pehle login karein.');
    try {
      const result = await createPayment({
        tripId: $('#paymentTripId').value.trim() || undefined,
        amount: Number($('#paymentAmount').value),
        method: $('#paymentMethod').value,
      });
      toast(result.checkoutConfigured ? 'Payment checkout ready hai.' : 'Payment record create ho gaya. Merchant checkout configure karna baqi hai.');
      if (result.checkoutUrl) window.open(result.checkoutUrl, '_blank');
      await loadDashboard();
    } catch (err) { toast(err.message); }
  });
  $('#dashboard').addEventListener('click', () => { if (state.user) loadDashboard(); });
}

async function initPushNotifications() {
  if (!window.VAPID_PUBLIC_KEY) { try { const cfg = await apiRequest('/config/public'); window.VAPID_PUBLIC_KEY = cfg.vapidPublicKey; } catch (_) {} }

  if (!state.user || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!window.VAPID_PUBLIC_KEY) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY) });
    await subscribePush(subscription.toJSON());
  } catch (err) { console.warn('Push subscription failed', err); }
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function updateAuthUI() {
  const loggedIn = !!state.user;
  $('#loginBtn').style.display = loggedIn ? 'none' : '';
  $('#signupBtn').textContent = loggedIn ? `👤 ${state.user.fullName.split(' ')[0]}` : 'Sign Up';
  $('#dashboard').style.display = loggedIn ? '' : 'none';
  $('#adminDashboard').hidden = !(loggedIn && state.user.role === 'ADMIN');
  $('#driverBookingsCard').hidden = !(loggedIn && state.user.role === 'DRIVER');
  if (loggedIn) {
    loadDashboard();
    loadAdminDashboard();
    initPushNotifications();
    $('#signupBtn').onclick = () => {
      if (confirm('Logout?')) { clearSession(); location.reload(); }
    };
  }
}

/* ============================================================
   VEHICLE CATEGORIES
   ============================================================ */
function renderCategories() {
  const grid = $('#categoryGrid');
  grid.innerHTML = VEHICLE_TYPES.map((v) => `
    <button type="button" class="category-chip" data-vehicle="${v}">
      ${v}<small>${VEHICLE_CAPACITY[v] || ''}</small>
    </button>
  `).join('');

  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;
    $('#preferredVehicle').value = chip.dataset.vehicle;
    $('#postload').scrollIntoView({ behavior: 'smooth' });
  });

  // Populate vehicle-type <select> filters across the page
  const opts = VEHICLE_TYPES.map((v) => `<option>${v}</option>`).join('');
  ['#ftVehicleType', '#flVehicleType', '#rlVehicleType'].forEach((sel) => {
    $(sel).insertAdjacentHTML('beforeend', opts);
  });
  $('#dVehicleType').innerHTML = opts;
}

/* ============================================================
   POST LOAD FORM + VALIDATION + RECOMMENDATION
   ============================================================ */
function initPostLoadForm() {
  $('#heroPostLoadBtn').addEventListener('click', () => $('#postload').scrollIntoView({ behavior: 'smooth' }));

  $('#loadDescription').addEventListener('input', (e) => {
    $('#descCount').textContent = e.target.value.length;
  });

  $('#loadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const pickup = $('#pickup').value.trim();
    const destination = $('#destination').value.trim();
    const description = $('#loadDescription').value.trim();
    const weightRaw = $('#weight').value;
    const unit = $('#weightUnit').value;
    const preferredVehicle = $('#preferredVehicle').value;

    if (!pickup) return toast('Pickup location enter karein.');
    if (!destination) return toast('Destination enter karein.');
    if (!description) return toast('Saman ki detail enter karein.');
    if (!weightRaw || Number(weightRaw) <= 0) return toast('Approx. weight enter karein.');

    const weightKg = unit === 'ton' ? Number(weightRaw) * 1000 : Number(weightRaw);

    if (!state.user) {
      toast('Load post karne ke liye pehle login/signup karein.');
      openModal('loginModal');
      return;
    }

    try {
      const createdLoad = await createLoad({
        pickupAddress: pickup,
        pickupLatitude: state.pickupCoords?.lat,
        pickupLongitude: state.pickupCoords?.lng,
        destinationAddress: destination,
        destinationLatitude: state.destinationCoords?.lat,
        destinationLongitude: state.destinationCoords?.lng,
        description,
        weightKg,
        preferredVehicle: preferredVehicle || undefined,
      });
      toast('Load posted successfully!');

      const rec = await getRecommendations({
        weightKg,
        preferredVehicle: preferredVehicle || undefined,
        pickupLatitude: state.pickupCoords?.lat,
        pickupLongitude: state.pickupCoords?.lng,
      });
      renderRecommendation(rec, { pickup, destination, weightKg, loadId: createdLoad.load.id });
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderRecommendation(rec, { pickup, destination, weightKg, loadId }) {
  const body = $('#recommendationBody');
  const distance = (state.pickupCoords && state.destinationCoords)
    ? haversineKm(state.pickupCoords, state.destinationCoords).toFixed(1) + ' km'
    : 'N/A (select locations on map for exact distance)';
  let fareLine = 'N/A';
  if (state.pickupCoords && state.destinationCoords) {
    fareLine = '<span id="fareEstimateLine">Calculating…</span>';
    estimateFare({
      pickupLat: state.pickupCoords.lat, pickupLng: state.pickupCoords.lng,
      destinationLat: state.destinationCoords.lat, destinationLng: state.destinationCoords.lng,
      vehicleType: rec.recommendedVehicleTypes?.[0] || rec.preferredVehicle, weightKg,
    }).then((f) => {
      $('#fareEstimateLine').textContent = f.estimatedFare ? `Rs. ${f.estimatedFare.toLocaleString()} (estimate)` : 'Not available';
    }).catch(() => {});
  }
  const vehiclesHtml = (rec.nearbyVehicles || []).slice(0, 5).map((v) => `
    <div class="rec-vehicle">
      <b>${v.vehicleType}</b> · ${v.capacityKg} kg capacity
      ${v.distanceKm != null ? ` · ${v.distanceKm} km away` : ''}
      ${v.isVerified ? ' · ✅ Verified' : ''}
      ${loadId && v.isVerified ? `<button class="btn btn-primary book-vehicle-btn" data-load="${loadId}" data-driver="${v.driverId}" data-vehicle="${v.id}">Book this vehicle</button>` : ''}
    </div>
  `).join('') || '<p class="muted-empty">No matching vehicles available right now.</p>';
  body.innerHTML = `
    <div class="rec-line"><span>Distance</span><span>${distance}</span></div>
    <div class="rec-line"><span>Load Type</span><span>${(rec.recommendedVehicleTypes || []).join(', ') || 'N/A'}</span></div>
    <div class="rec-line"><span>Estimated Fare</span><span>${fareLine}</span></div>
    ${vehiclesHtml}
  `;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.book-vehicle-btn');
  if (!btn) return;
  try {
    await createBooking({ loadId: btn.dataset.load, driverId: btn.dataset.driver, vehicleId: btn.dataset.vehicle });
    toast('Booking request driver ko bhej di gayi hai.');
    btn.disabled = true;
    btn.textContent = 'Request sent';
  } catch (err) { toast(err.message); }
});

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ============================================================
   MAP MODAL (Leaflet + OpenStreetMap)
   ============================================================ */
function initMapModal() {
  $$('.map-btn').forEach((btn) => btn.addEventListener('click', () => openMapModal(btn.dataset.mapTarget)));
  $('#mapModalClose').addEventListener('click', closeMapModal);
  $('#mapModal').addEventListener('click', (e) => { if (e.target.id === 'mapModal') closeMapModal(); });
  $('#confirmLocation').addEventListener('click', confirmMapLocation);
}

function openMapModal(target) {
  state.mapTarget = target;
  $('#mapModalTitle').textContent = target === 'pickup' ? 'Select Pickup Location' : 'Select Destination Location';
  $('#selectedLocation').value = '';
  $('#mapModal').classList.add('open');

  if (!state.map) {
    state.map = L.map('locationMap').setView([24.8607, 67.0011], 6); // Karachi default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(state.map);
    state.map.on('click', onMapClick);
  }
  setTimeout(() => state.map.invalidateSize(), 60);
}

function closeMapModal() { $('#mapModal').classList.remove('open'); }

async function onMapClick(e) {
  const { lat, lng } = e.latlng;
  if (state.mapMarker) state.map.removeLayer(state.mapMarker);
  state.mapMarker = L.marker([lat, lng]).addTo(state.map);

  $('#selectedLocation').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  state._pendingCoords = { lat, lng };

  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`);
    const data = await resp.json();
    if (data && data.display_name) $('#selectedLocation').value = data.display_name;
  } catch (err) {
    // Reverse geocoding unavailable — coordinates already shown.
  }
}

function confirmMapLocation() {
  const value = $('#selectedLocation').value;
  if (!value || !state._pendingCoords) { toast('Pehle map par ek location select karein.'); return; }

  if (state.mapTarget === 'pickup') {
    $('#pickup').value = value;
    state.pickupCoords = state._pendingCoords;
  } else {
    $('#destination').value = value;
    state.destinationCoords = state._pendingCoords;
  }
  closeMapModal();
}

/* ============================================================
   FIND TRUCK / FIND LOAD / RETURN LOADS
   ============================================================ */
function initSearchSections() {
  $('#ftSearchBtn').addEventListener('click', async () => {
    try {
      const results = await findVehicles({
        ...($('#ftVehicleType').value && { vehicleType: $('#ftVehicleType').value }),
        ...($('#ftCapacity').value && { minCapacity: $('#ftCapacity').value }),
        ...($('#ftVerifiedOnly').checked && { verifiedOnly: 'true' }),
      });
      renderVehicleResults(results.vehicles || []);
    } catch (err) { toast(err.message); }
  });

  $('#flSearchBtn').addEventListener('click', async () => {
    try {
      const results = await findLoads({
        ...($('#flPickup').value && { pickup: $('#flPickup').value }),
        ...($('#flDestination').value && { destination: $('#flDestination').value }),
        ...($('#flVehicleType').value && { vehicleType: $('#flVehicleType').value }),
        ...($('#flWeight').value && { maxWeight: $('#flWeight').value }),
      });
      renderLoadResults(results.loads || []);
    } catch (err) { toast(err.message); }
  });

  $('#rlSearchBtn').addEventListener('click', async () => {
    try {
      const results = await getReturnLoads({
        ...($('#rlReturnDestination').value && { returnDestination: $('#rlReturnDestination').value }),
        ...($('#rlVehicleType').value && { vehicleType: $('#rlVehicleType').value }),
        ...($('#rlRadius').value && { radiusKm: $('#rlRadius').value }),
      });
      renderLoadResults(results.loads || [], '#rlResults');
    } catch (err) { toast(err.message); }
  });
}

function renderVehicleResults(vehicles) {
  const el = $('#ftResults');
  if (!vehicles.length) { el.innerHTML = '<p class="muted-empty">No vehicles found.</p>'; return; }
  el.innerHTML = vehicles.map((v) => `
    <div class="result-card">
      <div class="rc-top">
        <h4>${v.vehicleType}</h4>
        ${v.isVerified ? '<span class="badge-pill">✅ Verified</span>' : ''}
      </div>
      <p>Capacity: ${v.capacityKg} kg</p>
      ${v.distanceKm != null ? `<p>${v.distanceKm} km away</p>` : ''}
      <p>Status: ${v.status}</p>
      <p>Driver: ${v.driver?.user?.fullName || '—'}</p>
    </div>
  `).join('');
}

function renderLoadResults(loads, targetSel = '#flResults') {
  const el = $(targetSel);
  if (!loads.length) { el.innerHTML = '<p class="muted-empty">No loads found.</p>'; return; }
  el.innerHTML = loads.map((l) => `
    <div class="result-card">
      <div class="rc-top">
        <h4>${l.pickupAddress} → ${l.destinationAddress}</h4>
        <span class="badge-pill">${l.status}</span>
      </div>
      <p>${l.description}</p>
      <p>Weight: ${l.weightKg} kg · Vehicle: ${l.preferredVehicle || 'Any suitable'}</p>
    </div>
  `).join('');
}

/* ============================================================
   LIVE TRIPS
   ============================================================ */
let driverGeoWatch = null;
function startDriverTracking(trips) {
  if (driverGeoWatch !== null || !state.user || state.user.role !== 'DRIVER' || !navigator.geolocation) return;
  const active = trips.find(t => t.status !== 'DELIVERED');
  if (!active) return;
  driverGeoWatch = navigator.geolocation.watchPosition(async (pos) => {
    try {
      await updateTripLocation(active.id, pos.coords.latitude, pos.coords.longitude);
    } catch (_) {}
  }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
}

async function loadLiveTrips() {
  const el = $('#ltResults');
  if (!state.user) { el.innerHTML = '<p class="muted-empty">Login to see your live trips.</p>'; return; }
  try {
    const { trips } = await getTrips();
    if (!trips.length) { el.innerHTML = '<p class="muted-empty">No active trips.</p>'; return; }
    startDriverTracking(trips);
    el.innerHTML = trips.map((t) => `
      <div class="result-card">
        <div class="rc-top">
          <h4>Trip #${t.id.slice(0, 8)}</h4>
          <span class="badge-pill">${t.status}</span>
        </div>
        <p>${t.pickup} → ${t.destination}</p>
        <p>Vehicle: ${t.vehicle?.vehicleType || '—'}</p>
        <p>Last updated: ${new Date(t.updatedAt).toLocaleString()}</p>
        ${state.user.role === 'DRIVER' && t.status !== 'DELIVERED' ? `
          <div class="field-row">
            <button class="btn btn-outline trip-status-btn" data-trip="${t.id}" data-status="PICKED_UP">Picked Up</button>
            <button class="btn btn-outline trip-status-btn" data-trip="${t.id}" data-status="IN_TRANSIT">In Transit</button>
            <button class="btn btn-primary trip-status-btn" data-trip="${t.id}" data-status="DELIVERED">Delivered</button>
          </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '<p class="muted-empty">Could not load live trips.</p>';
  }
}

/* ============================================================
   PWA: service worker, install prompt, update banner
   ============================================================ */
let deferredInstallPrompt = null;

function initPwa() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((registration) => {
      // A new service worker took control after an update — reload once, quietly.
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });

      // A new version has finished installing and is waiting to activate.
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });
    }).catch((err) => console.warn('Service worker registration failed:', err));
  });

  // "Add to Home Screen" / install prompt (Android/Chrome/Edge)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('#installAppBtn').hidden = false;
    $('#installAppBtnMobile').hidden = false;
  });

  const doInstall = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') toast('App install ho raha hai...');
    deferredInstallPrompt = null;
    $('#installAppBtn').hidden = true;
    $('#installAppBtnMobile').hidden = true;
  };
  $('#installAppBtn').addEventListener('click', doInstall);
  $('#installAppBtnMobile').addEventListener('click', doInstall);

  window.addEventListener('appinstalled', () => {
    toast('LoadLink Pakistan install ho gaya!');
    $('#installAppBtn').hidden = true;
    $('#installAppBtnMobile').hidden = true;
  });
}

function showUpdateBanner(registration) {
  const banner = $('#updateBanner');
  banner.hidden = false;
  $('#updateBannerBtn').onclick = () => {
    if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
    banner.hidden = true;
  };
}

/* ============================================================
   OFFLINE / ONLINE STATUS
   ============================================================ */
function initConnectivityWatch() {
  window.addEventListener('offline', () => toast('Aap offline hain. Kuch features kaam nahi karenge.'));
  window.addEventListener('online', () => toast('Connection wapas aa gaya.'));
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  $('#year').textContent = new Date().getFullYear();
  initNav();
  initAuthModals();
  initMapModal();
  renderCategories();
  initPostLoadForm();
  initSearchSections();
  initDashboard();
  updateAuthUI();
  const resetToken = new URLSearchParams(location.search).get('reset');
  if (resetToken) { $('#resetToken').value = resetToken; openModal('resetPasswordModal'); }
  initPwa();
  initConnectivityWatch();

  // Live Trips section loads lazily when scrolled into view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { loadLiveTrips(); io.disconnect(); }
    });
  }, { threshold: 0.2 });
  io.observe($('#livetrips'));
  window.__tripPoller = setInterval(() => { if (state.user && document.visibilityState === 'visible') loadLiveTrips(); }, 10000);
});
