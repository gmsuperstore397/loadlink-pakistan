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

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
  clearInterval(notificationPollTimer);
  const panel = $('#notificationPanel');
  if (panel) panel.hidden = true;
  localStorage.removeItem('ll_token');
  localStorage.removeItem('ll_user');
}

async function loginUser(mobileOrEmail, password) {
  const identifier = String(mobileOrEmail || '').trim();
  const isEmail = identifier.includes('@');
  const normalizedIdentifier = isEmail ? identifier.toLowerCase() : identifier.replace(/\s+/g, '');
  const body = { password, ...(isEmail ? { email: normalizedIdentifier } : { mobile: normalizedIdentifier }) };
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
const getMyLoads = () => apiRequest('/loads/mine');
const getRecommendations = (payload) => apiRequest('/recommendations/vehicle', { method: 'POST', body: payload });
const findVehicles = (query) => apiRequest(`/vehicles/available?${new URLSearchParams(query)}`);
const getMyVehicles = () => apiRequest('/vehicles/mine');
const createVehicle = (body) => apiRequest('/vehicles', { method: 'POST', body, isForm: true });
const findLoads = (query) => apiRequest(`/loads?${new URLSearchParams(query)}`);
const getReturnLoads = (query) => apiRequest(`/return-loads?${new URLSearchParams(query)}`);
const createBooking = (body) => apiRequest('/bookings', { method: 'POST', body });
const getMyBookings = () => apiRequest('/bookings/my');
const acceptBooking = (id, agreedFare) => apiRequest(`/bookings/${id}/accept`, { method: 'PATCH', body: agreedFare ? { agreedFare: Number(agreedFare) } : {} });
const listSpaceListings = (query = {}) => apiRequest(`/space/listings?${new URLSearchParams(query)}`);
const listSpaceRequests = (query = {}) => apiRequest(`/space/requests?${new URLSearchParams(query)}`);
const createSpaceListing = (body) => apiRequest('/space/listings', { method: 'POST', body });
const createSpaceRequest = (body) => apiRequest('/space/requests', { method: 'POST', body });
const getSpaceMatches = (id) => apiRequest(`/space/requests/${id}/matches`);
const createSpaceBooking = (body) => apiRequest('/space/bookings', { method: 'POST', body });
const getMySpaceBookings = () => apiRequest('/space/bookings/my');
const acceptSpaceBooking = (id, agreedFare) => apiRequest(`/space/bookings/${id}/accept`, { method: 'PATCH', body: agreedFare ? { agreedFare: Number(agreedFare) } : {} });
const rejectSpaceBooking = (id) => apiRequest(`/space/bookings/${id}/reject`, { method: 'PATCH' });
const rejectBooking = (id) => apiRequest(`/bookings/${id}/reject`, { method: 'PATCH' });
const estimateFare = (payload) => apiRequest('/fare/estimate', { method: 'POST', body: payload });
const getLiveTrip = (tripId) => apiRequest(`/trips/${tripId}/live`);
const getSmartLoadMatches = (loadId) => apiRequest(`/recommendations/load/${loadId}/matches`);
const getDriverTrustScore = (userId) => apiRequest(`/ratings/trust/${userId}`);
const getDeliveryProof = (tripId) => apiRequest(`/trips/${tripId}/proof`);
const submitDeliveryProof = (tripId, formData) => apiRequest(`/trips/${tripId}/proof`, { method: 'POST', body: formData, isForm: true });
const createDispute = (body) => apiRequest('/disputes', { method: 'POST', body });
const getMyDisputes = () => apiRequest('/disputes/mine');

const getTrips = () => apiRequest('/trips');
const updateTripLocation = (tripId, latitude, longitude) => apiRequest(`/trips/${tripId}/location`, { method: 'PATCH', body: { latitude, longitude } });
const updateTripStatus = (tripId, status) => apiRequest(`/trips/${tripId}/status`, { method: 'PATCH', body: { status } });
const forgotPassword = (identifier) => apiRequest('/auth/forgot-password', { method: 'POST', body: identifier.includes('@') ? { email: identifier } : { mobile: identifier } });
const resetPassword = (token, password) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
const getNotifications = () => apiRequest('/notifications');
const getUnreadCount = () => apiRequest('/notifications/unread-count');
const markAllRead = () => apiRequest('/notifications/read-all', { method: 'PATCH' });
const markNotificationRead = (id) => apiRequest('/notifications/' + id + '/read', { method: 'PATCH' });

let notificationPollTimer = null;

function renderNotifications(notifications) {
  const list = $('#notificationList');
  if (!list) return;
  if (!notifications?.length) {
    list.innerHTML = '<p class="muted-empty">Abhi koi notification nahi.</p>';
    return;
  }
  list.innerHTML = notifications.map((n) => `
    <button type="button" class="notification-item ${n.isRead ? 'read' : 'unread'}" data-notification-id="${n.id}">
      <span class="notification-icon">${n.isRead ? '•' : '●'}</span>
      <span><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.message)}</small><time>${new Date(n.createdAt).toLocaleString()}</time></span>
    </button>`).join('');
}

async function loadNotifications(showPanel = false) {
  if (!state.user || !state.token) return;
  try {
    const result = await getNotifications();
    const notifications = result.notifications || [];
    renderNotifications(notifications);
    const unread = notifications.filter((n) => !n.isRead).length;
    const badge = $('#notificationBadge');
    if (badge) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = unread === 0;
    }
    const hint = $('#notificationHint');
    if (hint) hint.textContent = unread ? `${unread} unread` : 'All caught up';
    if (showPanel) $('#notificationPanel').hidden = false;
  } catch (_) {}
}

function initNotificationCenter() {
  const btn = $('#notificationBtn');
  const panel = $('#notificationPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) await loadNotifications(true);
  });
  $('#markAllNotifications')?.addEventListener('click', async () => {
    try {
      await markAllRead();
      await loadNotifications(true);
    } catch (err) { toast(err.message); }
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
    const item = e.target.closest?.('.notification-item');
    if (!item) return;
    markNotificationRead(item.dataset.notificationId).then(() => loadNotifications(true)).catch(() => {});
  });
}

function startNotificationPolling() {
  clearInterval(notificationPollTimer);
  loadNotifications();
  notificationPollTimer = setInterval(() => loadNotifications(), 30000);
}
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
function initHeroSlider() {
  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dot'));
  if (slides.length < 2) return;
  let current = 0;
  let timer = null;
  const show = (index) => {
    current = (index + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  };
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => show(current + 1), 6000);
  };
  $('#heroPrev').addEventListener('click', () => { show(current - 1); restart(); });
  $('#heroNext').addEventListener('click', () => { show(current + 1); restart(); });
  dots.forEach((d) => d.addEventListener('click', () => { show(Number(d.dataset.heroSlide)); restart(); }));
  show(0);
  restart();
}

function initNav() {
  const navTargets = { home: '#home', findtruck: '#findtruck', postload: '#postload', findload: '#findload', marketplace: '#findload', profile: '#profile', returnloads: '#returnloads', livetrips: '#livetrips', categories: '#categories' };
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Keep auth state in sync with the session saved by login/OTP.
      syncSessionFromStorage();
      closeModal('loginModal');
      closeModal('signupModal');
      const target = navTargets[el.dataset.nav];
      if (el.dataset.nav === 'profile') {
        e.preventDefault();
        showProfile();
      } else if (target) {
        e.preventDefault();
        exitProfileView();
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
function openDriverSignup() {
  syncSessionFromStorage();
  if (state.user && state.user.role === 'DRIVER') {
    showProfile();
    requestAnimationFrame(() => {
      const card = $('#driverVehiclesCard');
      const form = $('#addVehicleForm');
      if (card) card.hidden = false;
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstField = $('#vVehicleType');
        if (firstField) firstField.focus();
      }
    });
    return;
  }
  openModal('signupModal');
  setSignupTab('driver');
  requestAnimationFrame(() => setSignupTab('driver'));
}

function syncSessionFromStorage() {
  const token = localStorage.getItem('ll_token');
  const rawUser = localStorage.getItem('ll_user');
  let user = null;
  try { user = rawUser ? JSON.parse(rawUser) : null; } catch (_) { user = null; }
  state.token = token || null;
  state.user = user;
  return state.user;
}

function initAuthModals() {
  // If the user is already logged in, Login should never open the login form again.
  $('#loginBtn').addEventListener('click', () => { syncSessionFromStorage(); state.user ? showProfile() : openModal('loginModal'); });
  $('#loginBtnMobile').addEventListener('click', () => { syncSessionFromStorage(); state.user ? showProfile() : openModal('loginModal'); });
  $('#signupBtn').addEventListener('click', () => state.user ? showProfile() : openModal('signupModal'));
  $('#signupBtnMobile').addEventListener('click', () => state.user ? showProfile() : openModal('signupModal'));
  $('#heroDriverBtn').addEventListener('click', (event) => {
    event.preventDefault();
    openDriverSignup();
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
    const identifier = $('#resetIdentifier').value.trim().toLowerCase();
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
  initNotificationCenter();
    } catch (err) { toast(err.message); }
  });

  // signup tabs
  $$('.signup-tab').forEach((tab) => tab.addEventListener('click', () => setSignupTab(tab.dataset.role)));

  // customer signup
  $('#customerSignupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Account create ho raha hai...';
    try {
      const email = $('#cEmail').value.trim();
      const result = await registerUser({
        fullName: $('#cFullName').value.trim(),
        mobile: $('#cMobile').value.trim(),
        email,
        password: $('#cPassword').value,
        city: $('#cCity').value.trim() || undefined,
      });
      state.pendingOtpEmail = email.toLowerCase();
      closeModal('signupModal');
      openModal('otpModal');
      if (result.developmentOtp) {
        $('#otpCode').value = result.developmentOtp;
        toast(`Testing OTP: ${result.developmentOtp}`);
      } else {
        toast(result.otpDeliveryConfigured ? 'Email OTP bhej diya gaya hai.' : 'Account ban gaya. OTP email delivery check karein.');
      }
    } catch (err) {
      toast(err.message || 'Account create nahi ho saka. Dobara try karein.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
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
      if (result.developmentOtp) {
        $('#otpCode').value = result.developmentOtp;
        toast(`Testing OTP: ${result.developmentOtp}`);
      } else {
        toast(result.otpDeliveryConfigured ? 'OTP dobara bhej diya gaya.' : 'Email provider configure nahi hai.');
      }
    } catch (err) { toast(err.message); }
  });

  // driver signup — account/personal verification only; vehicles are added later from My Profile
  $('#driverSignupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Driver account create ho raha hai...';
    const fd = new FormData();
    fd.append('fullName', $('#dFullName').value.trim());
    fd.append('mobile', $('#dMobile').value.trim());
    fd.append('email', $('#dEmail').value.trim());
    fd.append('cnic', $('#dCnic').value.trim());
    fd.append('city', $('#dCity').value.trim());
    fd.append('password', $('#dPassword').value);
    fd.append('drivingLicense', $('#dLicense').value.trim());
    fd.append('cnicExpiryDate', $('#dCnicExpiry').value);
    fd.append('licenseExpiryDate', $('#dLicenseExpiry').value);
    const cnicDoc = $('#dCnicDoc').files?.[0];
    const licenseDoc = $('#dLicenseDoc').files?.[0];
    const documents = [cnicDoc, licenseDoc].filter(Boolean);
    if (documents.some((file) => file.size > 5 * 1024 * 1024)) {
      toast('Har document 5MB se chhota hona chahiye.');
      button.disabled = false;
      button.textContent = originalText;
      return;
    }
    if (cnicDoc) fd.append('cnicDoc', cnicDoc);
    if (licenseDoc) fd.append('licenseDoc', licenseDoc);
    try {
      const result = await registerTransporter(fd);
      state.pendingOtpEmail = $('#dEmail').value.trim().toLowerCase();
      closeModal('signupModal');
      openModal('otpModal');
      if (result.developmentOtp) {
        $('#otpCode').value = result.developmentOtp;
        toast(`Testing OTP: ${result.developmentOtp}`);
      } else {
        toast(result.otpDeliveryConfigured ? 'Email OTP bhej diya gaya hai.' : 'Account ban gaya. OTP email delivery check karein.');
      }
    } catch (err) {
      toast(err.message || 'Driver account create nahi ho saka. Dobara try karein.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
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
  $('#profileLogoutBtn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });
  $('#profileBackBtn').addEventListener('click', () => exitProfileView());
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
  initDriverVehicles();
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

function showProfile() {
  if (!state.user) return openModal('loginModal');
  const section = $('#profile');
  if (!section) return;
  document.body.classList.add('profile-view');
  section.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadProfile();
}

function exitProfileView() {
  document.body.classList.remove('profile-view');
  $('#profile').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function initProfilePhoto() {
  const input = $('#profilePhotoInput');
  const btn = $('#profilePhotoBtn');
  const remove = $('#profilePhotoRemoveBtn');
  if (!input || !btn || !remove) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) return toast('Photo 2MB se choti honi chahiye.');
    const reader = new FileReader();
    reader.onload = () => {
      try { localStorage.setItem(`ll_profile_photo_${state.user?.id || state.user?.email || 'user'}`, reader.result); applyProfilePhoto(); toast('Profile picture save ho gayi.'); }
      catch (_) { toast('Photo save nahi ho saki.'); }
    };
    reader.readAsDataURL(file);
  });
  remove.addEventListener('click', () => { localStorage.removeItem(`ll_profile_photo_${state.user?.id || state.user?.email || 'user'}`); applyProfilePhoto(); });
  applyProfilePhoto();
}

function applyProfilePhoto() {
  const avatar = $('#profileAvatar'), remove = $('#profilePhotoRemoveBtn');
  if (!avatar || !state.user) return;
  const key = `ll_profile_photo_${state.user.id || state.user.email || 'user'}`;
  const photo = localStorage.getItem(key);
  if (photo) { avatar.innerHTML = `<img src="${photo}" alt="Profile picture">`; if (remove) remove.hidden = false; }
  else { avatar.textContent = (state.user.fullName || 'C').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(); if (remove) remove.hidden = true; }
}

async function loadProfile() {
  if (!state.user) return;
  $('#profileName').textContent = state.user.fullName || 'Customer';
  $('#profileAvatar').textContent = (state.user.fullName || 'C').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  $('#profileRole').textContent = state.user.role === 'DRIVER' ? 'Driver / Transporter' : 'Customer';
  $('#profileMobile').textContent = state.user.mobile || '—';
  $('#profileEmail').textContent = state.user.email || '—';
  $('#profileCity').textContent = state.user.city || 'City not added';
  applyProfilePhoto();

  const vehicleCard = $('#driverVehiclesCard');
  if (vehicleCard) vehicleCard.hidden = state.user.role !== 'DRIVER';

  if (state.user.role === 'DRIVER') {
    await loadDriverVehicles();
    $('#profileLoads').innerHTML = '<p class="muted-empty">Driver profile ke loads yahan show nahi hote.</p>';
    return;
  }

  try {
    const result = await getMyLoads();
    renderLoadResults(result.loads || [], '#profileLoads', true);
  } catch (err) {
    $('#profileLoads').innerHTML = '<p class="muted-empty">Profile posts load nahi ho sake.</p>';
  }
}

async function loadDriverVehicles() {
  const list = $('#driverVehicles');
  if (!list || !state.user || state.user.role !== 'DRIVER') return;
  try {
    const result = await getMyVehicles();
    const vehicles = result.vehicles || [];
    list.innerHTML = vehicles.map(v => `
      <div class="result-card">
        <b>🚚 ${v.vehicleType}</b>
        <p>${v.vehicleNumber} · ${Number(v.capacityKg).toLocaleString()} kg${v.brand ? ' · ' + v.brand : ''}${v.model ? ' ' + v.model : ''}</p>
        <small>Status: ${v.status} · Verification: ${v.isVerified ? 'Verified' : 'Pending'}</small>
      </div>
    `).join('') || '<p class="muted-empty">Abhi koi gaari add nahi hui.</p>';
  } catch (err) {
    list.innerHTML = '<p class="muted-empty">Vehicles load nahi ho sakin.</p>';
  }
}

function initDriverVehicles() {
  const form = $('#addVehicleForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user || state.user.role !== 'DRIVER') return toast('Driver account se login karein.');
    if (!form.checkValidity()) return form.reportValidity();
    const file = $('#vDocument').files?.[0];
    if (file && file.size > 5 * 1024 * 1024) return toast('Vehicle document 5MB se chhota hona chahiye.');
    const fd = new FormData();
    fd.append('vehicleType', $('#vVehicleType').value);
    fd.append('vehicleNumber', $('#vVehicleNumber').value.trim());
    fd.append('capacityKg', $('#vCapacity').value);
    fd.append('brand', $('#vBrand').value.trim());
    fd.append('model', $('#vModel').value.trim());
    fd.append('year', $('#vYear').value);
    fd.append('documentExpiryDate', $('#vDocumentExpiry').value);
    if (file) fd.append('vehicleDoc', file);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await createVehicle(fd);
      form.reset();
      await loadDriverVehicles();
      toast('Gaari add ho gayi. Verification admin karega.');
    } catch (err) {
      toast(err.message || 'Gaari add nahi ho saki.');
    } finally {
      button.disabled = false;
    }
  });
}


async function loadSpaceMarketplace() {
  if (!state.user) return;
  try {
    const [listingsResult, requestsResult] = await Promise.all([listSpaceListings({}), listSpaceRequests({})]);
    renderSpaceListings(listingsResult.listings || []);
    renderSpaceRequests(requestsResult.requests || []);
    if (state.user.role === 'DRIVER') {
      const vehicles = await getMyVehicles();
      $('#spaceVehicle').innerHTML = '<option value="">Select vehicle</option>' + (vehicles.vehicles || []).map(v => '<option value="' + v.id + '" data-capacity="' + v.capacityKg + '">' + v.vehicleType + ' · ' + v.vehicleNumber + ' · ' + v.capacityKg + ' kg</option>').join('');
      const bookings = await getMySpaceBookings();
      const pending = (bookings.bookings || []).filter(b => b.status === 'REQUESTED');
      if ($('#driverBookings')) $('#driverBookings').innerHTML += pending.map(b => '<div class="result-card"><b>📦 Space Request: ' + b.spaceRequest.pickupLocation + ' → ' + b.spaceRequest.destination + '</b><p>' + b.bookedWeightKg + ' kg · ' + b.spaceRequest.cargoType + '</p><button class="btn btn-primary accept-space-booking-btn" data-booking="' + b.id + '">Accept</button> <button class="btn btn-outline reject-space-booking-btn" data-booking="' + b.id + '">Reject</button></div>').join('');
    }
  } catch (err) { console.warn('Space marketplace failed', err); }
}

function renderSpaceListings(listings) {
  const el = $('#spaceListings');
  if (!el) return;
  if (!listings.length) { el.innerHTML = '<p class="muted-empty">Is route par available space nahi mili.</p>'; return; }
  el.innerHTML = listings.map(l => '<div class="result-card"><div class="rc-top"><h4>🚛 ' + l.fromLocation + ' → ' + l.toLocation + '</h4><span class="badge-pill">' + Math.round(l.availableWeightKg) + ' kg available</span></div><p>Date: ' + new Date(l.travelDate).toLocaleDateString() + ' · Vehicle: ' + l.vehicle.vehicleType + ' · ' + l.vehicle.vehicleNumber + '</p><p>Cargo: ' + (l.cargoType || 'General') + ' · Driver: ' + (l.driver?.user?.fullName || '—') + '</p>' + (state.user?.role === 'CUSTOMER' ? '<button class="btn btn-primary request-space-book-btn" data-listing="' + l.id + '" data-from="' + l.fromLocation + '" data-to="' + l.toLocation + '">📦 Book Space</button>' : '') + '</div>').join('');
}

function renderSpaceRequests(requests) {
  const el = $('#spaceRequests');
  if (!el) return;
  if (!requests.length) { el.innerHTML = '<p class="muted-empty">Abhi koi cargo space request nahi.</p>'; return; }
  el.innerHTML = requests.map(r => '<div class="result-card"><div class="rc-top"><h4>📦 ' + r.pickupLocation + ' → ' + r.destination + '</h4><span class="badge-pill">' + r.cargoWeightKg + ' kg</span></div><p>Date: ' + new Date(r.travelDate).toLocaleDateString() + ' · Cargo: ' + (r.cargoType || 'General') + '</p><p>' + (r.description || '') + '</p>' + (state.user?.role === 'DRIVER' ? '<button class="btn btn-primary find-space-match-btn" data-request="' + r.id + '">🚛 Is cargo ke liye space offer karein</button>' : '') + '</div>').join('');
}

function initSpaceMarketplace() {
  $('#spaceListingForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await createSpaceListing({ vehicleId: $('#spaceVehicle').value, fromLocation: $('#spaceFrom').value.trim(), toLocation: $('#spaceTo').value.trim(), travelDate: $('#spaceDate').value, totalCapacityKg: Number($('#spaceTotal').value), availableWeightKg: Number($('#spaceAvailable').value), cargoType: $('#spaceCargoType').value.trim(), expectedCharges: $('#spaceCharges').value || undefined, exactPickupAddress: $('#spaceExactPickup').value.trim() || undefined });
      toast('Gaari ka available space post ho gaya.'); e.target.reset(); await loadSpaceMarketplace();
    } catch (err) { toast(err.message); }
  });
  $('#spaceRequestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await createSpaceRequest({ pickupLocation: $('#reqPickup').value.trim(), destination: $('#reqDestination').value.trim(), travelDate: $('#reqDate').value, cargoWeightKg: Number($('#reqWeight').value), cargoType: $('#reqCargoType').value.trim(), vehicleRequirement: $('#reqVehicle').value.trim(), expectedBudget: $('#reqBudget').value || undefined, description: $('#reqDescription').value.trim() });
      toast('Cargo space request post ho gayi. Matching spaces check kar raha hoon...');
      const matches = await getSpaceMatches(result.request.id);
      renderSpaceListings(matches.listings || []);
      e.target.reset();
      await loadSpaceMarketplace();
    } catch (err) { toast(err.message); }
  });
  $('#spaceSearchBtn')?.addEventListener('click', async () => {
    try { const r = await listSpaceListings({ from: $('#spaceSearchFrom').value.trim(), to: $('#spaceSearchTo').value.trim() }); renderSpaceListings(r.listings || []); } catch (err) { toast(err.message); }
  });
}

document.addEventListener('click', async (e) => {
  const book = e.target.closest('.request-space-book-btn');
  const accept = e.target.closest('.accept-space-booking-btn');
  const reject = e.target.closest('.reject-space-booking-btn');
  const match = e.target.closest('.find-space-match-btn');
  try {
    if (book) {
      const weight = prompt('Kitna weight book karna hai (kg)?');
      if (!weight || Number(weight) <= 0) return;
      const reqs = await listSpaceRequests({});
      const request = (reqs.requests || []).find(r => r.customerId === state.user.id && r.status === 'OPEN' && Number(r.cargoWeightKg) === Number(weight) && r.pickupLocation.toLowerCase().includes((book.dataset.from || '').toLowerCase()) && r.destination.toLowerCase().includes((book.dataset.to || '').toLowerCase()));
      if (!request) { toast('Pehle apni matching Space Request post karein.'); return; }
      await createSpaceBooking({ spaceListingId: book.dataset.listing, spaceRequestId: request.id });
      toast('Space booking request driver ko bhej di gayi hai.');
      book.disabled = true; book.textContent = 'Request sent';
    }
    if (match) {
      const matches = await getSpaceMatches(match.dataset.request);
      renderSpaceListings(matches.listings || []);
      $('#spaceListings')?.scrollIntoView({ behavior: 'smooth' });
    }
    if (accept) {
      const fare = prompt('Agreed fare (PKR), optional:');
      const result = await acceptSpaceBooking(accept.dataset.booking, fare);
      toast('Space booking accept ho gayi. Remaining space reduce ho gaya aur pickup location unlock hai.');
      await loadSpaceMarketplace();
      if (result.booking?.exactPickup?.exactPickupAddress) toast('📍 Exact pickup unlock: ' + result.booking.exactPickup.exactPickupAddress);
    }
    if (reject) {
      await rejectSpaceBooking(reject.dataset.booking);
      toast('Space booking reject kar di gayi.');
      await loadSpaceMarketplace();
    }
  } catch (err) { toast(err.message); }
});

function openAdminPanel() {
  if (!state.user || state.user.role !== 'ADMIN') return;
  closeModal('loginModal');
  closeModal('signupModal');
  exitProfileView();
  const section = $('#adminDashboard');
  if (!section) return;
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadAdminDashboard();
}

function updateAuthUI() {
  const loggedIn = !!state.user;
  const notificationBtn = $('#notificationBtn');
  if (notificationBtn) notificationBtn.hidden = !loggedIn;
  const isAdmin = loggedIn && state.user.role === 'ADMIN';
  $('#loginBtn').style.display = loggedIn ? 'none' : '';
  $('#loginBtnMobile').style.display = loggedIn ? 'none' : '';
  $('#signupBtn').textContent = loggedIn ? '👤 My Profile' : 'Sign Up';

  // Admin Panel is intentionally visible only to an authenticated ADMIN.
  ['adminPanelBtn', 'adminPanelBtnMobile'].forEach((id) => {
    let button = $('#' + id);
    if (!button) {
      button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'btn btn-primary';
      button.textContent = '🛠️ Admin Panel';
      button.addEventListener('click', openAdminPanel);
      const parent = id.endsWith('Mobile') ? $('.nav-mobile-auth') : $('.nav-auth');
      if (parent) parent.appendChild(button);
    }
    button.hidden = !isAdmin;
    button.style.display = isAdmin ? '' : 'none';
  });
  $('#signupBtnMobile').textContent = loggedIn ? '👤 My Profile' : 'Sign Up';
  $('#dashboard').style.display = loggedIn ? '' : 'none';
  $('#profile').hidden = !(loggedIn && document.body.classList.contains('profile-view'));
  $('#adminDashboard').hidden = !(loggedIn && state.user.role === 'ADMIN');
  $('#driverBookingsCard').hidden = !(loggedIn && state.user.role === 'DRIVER');
  if ($('#driverSpaceCard')) $('#driverSpaceCard').hidden = !(loggedIn && state.user.role === 'DRIVER');
  if ($('#customerSpaceCard')) $('#customerSpaceCard').hidden = !(loggedIn && state.user.role === 'CUSTOMER');

  if (loggedIn) {
    loadDashboard();
    loadAdminDashboard();
    loadProfile();
    loadMarketplace();
    loadSpaceMarketplace();
    initPushNotifications();
    startNotificationPolling();
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
  if ($('#vVehicleType')) $('#vVehicleType').innerHTML = '<option value="">Select vehicle type</option>' + opts;
}

/* ============================================================
   POST LOAD FORM + VALIDATION + RECOMMENDATION
   ============================================================ */
function initPostLoadForm() {
  $('#heroPostLoadBtn').addEventListener('click', () => { if (!state.user) { openModal('signupModal'); setSignupTab('customer'); } else { $('#postload').scrollIntoView({ behavior: 'smooth' }); } });

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
      await loadMarketplace();
      await loadProfile();

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
  if (loadId) {
    body.insertAdjacentHTML('beforeend', '<div id="smart-match-results" class="smart-match-results"><p class="muted-empty">🤖 Finding best verified drivers...</p></div>');
    getSmartLoadMatches(loadId).then(async (result) => {
      const el = $('#smart-match-results');
      if (!el) return;
      if (!result.matches?.length) {
        el.innerHTML = '<p class="muted-empty">Abhi koi verified available driver match nahi mila.</p>';
        return;
      }
      const matches = await Promise.all(result.matches.map(async (m) => {
        try { const trust = await getDriverTrustScore(m.driver.id); return { ...m, trust: trust.trust || trust }; }
        catch (_) { return { ...m, trust: null }; }
      }));
      el.innerHTML = '<h4>🤖 Smart Driver Matches</h4>' + matches.map((m) => `
        <div class="rec-vehicle">
          <b>${m.driver.fullName}</b> · ${m.vehicle.vehicleType} · ${m.vehicle.capacityKg} kg
          <div><small>Match: <b>${m.matchScore}%</b> · Trust: <b>${m.trust?.score ?? 'New'}</b>/100 · ${m.distanceKm != null ? m.distanceKm + ' km away' : 'distance unavailable'}</small></div>
          <div><small>${m.trust?.averageRating ? `⭐ ${m.trust.averageRating}/5 (${m.trust.ratingCount}) · ` : ''}${m.reasons.slice(0,3).join(' · ')}</small></div>
          <button class="btn btn-primary book-vehicle-btn" data-load="${loadId}" data-driver="${m.driverId}" data-vehicle="${m.vehicleId}">Book this matched vehicle</button>
        </div>
      `).join('');
    }).catch(() => {
      const el = $('#smart-match-results');
      if (el) el.innerHTML = '<p class="muted-empty">Smart matching temporarily unavailable.</p>';
    });
  }
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

async function loadMarketplace() {
  if (!state.user) return;
  try {
    const result = await findLoads({});
    renderLoadResults(result.loads || [], '#flResults');
  } catch (err) {
    console.warn('Marketplace load failed', err);
  }
}

function renderLoadResults(loads, targetSel = '#flResults', ownOnly = false) {
  const el = $(targetSel);
  if (!loads.length) {
    el.innerHTML = '<p class="muted-empty">No loads found.</p>';
    return;
  }
  el.innerHTML = loads.map((l) => `
    <div class="result-card">
      <div class="rc-top">
        <h4>${l.pickupAddress} → ${l.destinationAddress}</h4>
        <span class="badge-pill">${l.status}</span>
      </div>
      <p>${l.description}</p>
      <p>Weight: ${l.weightKg} kg · Vehicle: ${l.preferredVehicle || 'Any suitable'}</p>
      ${l.customer ? `<p class="muted-empty">👤 Posted by: <b>${l.customer.fullName}</b>${l.customer.city ? ` · ${l.customer.city}` : ''}</p>` : ''}
      <small>Posted ${new Date(l.createdAt).toLocaleString()}</small>
      ${(!ownOnly && state.user?.role === 'DRIVER') ? `
        <button type="button" class="btn btn-primary contact-load-btn" data-load-id="${l.id}" style="margin-top:12px;width:100%">
          📲 LoadLink Team se Contact Karein
        </button>
      ` : ''}
    </div>
  `).join('');
}

async function contactPostedLoad(loadId) {
  if (!state.user || state.user.role !== 'DRIVER') {
    return toast('Driver account se login karein.');
  }

  const load = await apiRequest(`/loads/${encodeURIComponent(loadId)}`);
  let vehicles = [];
  try {
    const result = await getMyVehicles();
    vehicles = result.vehicles || [];
  } catch (_) {}

  const vehicleText = vehicles.length
    ? vehicles.map((v, i) => `${i + 1}. ${v.vehicleType} - ${v.vehicleNumber} - ${v.capacityKg} kg${v.brand ? ` - ${v.brand}` : ''}${v.model ? ` ${v.model}` : ''}`).join('\\n')
    : 'No vehicle added yet';

  const l = load.load || load;
  const message = [
    'Assalam-o-Alaikum LoadLink Team,',
    '',
    '📦 *Posted Load Request*',
    `Load ID: ${l.id || loadId}`,
    `📍 Pickup: ${l.pickupAddress || '-'}`,
    `🏁 Destination: ${l.destinationAddress || '-'}`,
    `📝 Description: ${l.description || '-'}`,
    `⚖️ Weight: ${l.weightKg || '-'} kg`,
    `🚚 Preferred Vehicle: ${l.preferredVehicle || 'Any suitable'}`,
    `📌 Status: ${l.status || '-'}`,
    `🕒 Posted: ${l.createdAt ? new Date(l.createdAt).toLocaleString() : '-'}`,
    '',
    '👤 *Posted By*',
    `Name: ${l.customer?.fullName || '-'}`,
    `City: ${l.customer?.city || '-'}`,
    '',
    '🚛 *Driver / Transporter*',
    `Name: ${state.user.fullName || '-'}`,
    `Mobile: ${state.user.mobile || '-'}`,
    `City: ${state.user.city || '-'}`,
    'Vehicles:',
    vehicleText,
    '',
    'Please is load ke liye meri taraf se contact arrange kar dein.'
  ].join('\\n');

  const whatsappNumber = '923089011588';
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.contact-load-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '📲 WhatsApp khul raha hai...';
  contactPostedLoad(btn.dataset.loadId)
    .catch((err) => toast(err.message || 'Load details share nahi ho sakin.'))
    .finally(() => {
      btn.disabled = false;
      btn.textContent = '📲 LoadLink Team se Contact Karein';
    });
});

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
        ${state.user.role === 'DRIVER' ? `
          <div class="field-row">
            ${t.status === 'ASSIGNED' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="PICKED_UP">Picked Up</button>' : ''}
            ${t.status === 'PICKED_UP' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="IN_TRANSIT">In Transit</button>' : ''}
            ${t.status === 'IN_TRANSIT' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="NEAR_DESTINATION">Near Destination</button>' : ''}
            ${t.status === 'NEAR_DESTINATION' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="DELIVERED">Delivered</button>' : ''}
            ${t.status === 'DELIVERED' ? '<button class="btn btn-outline delivery-proof-btn" data-trip="' + t.id + '">📦 Add Proof of Delivery</button>' : ''}
            ${t.status === 'DELIVERED' && state.user.role !== 'DRIVER' ? '<button class="btn btn-outline view-proof-btn" data-trip="' + t.id + '">👁️ View Delivery Proof</button>' : ''}
          </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '<p class="muted-empty">Could not load live trips.</p>';
  }
}

document.addEventListener('click', async (e) => {
  const view = e.target.closest('.view-proof-btn');
  if (view) {
    try {
      const result = await getDeliveryProof(view.dataset.trip);
      const p = result.proof;
      toast('POD: ' + p.receiverName + (p.receiverPhone ? ' · ' + p.receiverPhone : '') + (p.notes ? ' · ' + p.notes : ''));
    } catch (err) { toast(err.message); }
    return;
  }
  const btn = e.target.closest('.delivery-proof-btn');
  if (!btn) return;
  $('#deliveryProofForm').reset();
  $('#proofTripId').value = btn.dataset.trip;
  openModal('deliveryProofModal');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'deliveryProofForm') return;
  e.preventDefault();
  const form = e.target;
  const tripId = $('#proofTripId').value;
  const fd = new FormData();
  fd.append('receiverName', $('#proofReceiverName').value.trim());
  fd.append('receiverPhone', $('#proofReceiverPhone').value.trim());
  fd.append('notes', $('#proofNotes').value.trim());
  const photo = $('#proofPhoto').files?.[0];
  const signature = $('#proofSignature').files?.[0];
  if (photo && photo.size > 5 * 1024 * 1024) return toast('Photo 5MB se chhoti honi chahiye.');
  if (signature && signature.size > 5 * 1024 * 1024) return toast('Signature 5MB se chhoti honi chahiye.');
  if (photo) fd.append('photo', photo);
  if (signature) fd.append('signature', signature);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await submitDeliveryProof(tripId, fd);
    closeModal('deliveryProofModal');
    toast('Proof of Delivery save ho gaya.');
    await loadLiveTrips();
  } catch (err) { toast(err.message); }
  finally { button.disabled = false; }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.raise-dispute-btn');
  if (!btn) return;
  $('#disputeForm').reset();
  $('#disputeTripId').value = btn.dataset.trip;
  openModal('disputeModal');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'disputeForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await createDispute({ tripId: $('#disputeTripId').value, category: $('#disputeCategory').value, description: $('#disputeDescription').value.trim() });
    closeModal('disputeModal');
    toast('Dispute submit ho gaya. Team review karegi.');
    await loadLiveTrips();
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; }
});

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
  initHeroSlider();
  initAuthModals();
  initMapModal();
  renderCategories();
  initPostLoadForm();
  initSearchSections();
  initSpaceMarketplace();
  initDashboard();
  initProfilePhoto();
  if (state.user) loadMarketplace();
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
