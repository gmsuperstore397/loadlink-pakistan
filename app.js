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

function isDriverUser(user = state.user) {
  return !!user && (user.role === 'DRIVER' || user.role === 'FLEET_OWNER' || !!user.driverProfile);
}

async function refreshDriverSession() {
  try {
    const me = await apiRequest('/auth/me');
    if (me.user) {
      state.user = me.user;
      localStorage.setItem('ll_user', JSON.stringify(me.user));
      return isDriverUser(me.user);
    }
  } catch (_) {}
  return isDriverUser();
}

const state = {
  token: null,
  user: JSON.parse(localStorage.getItem('ll_user') || 'null'),
  map: null,
  mapMarker: null,
  mapTarget: null, // 'pickup' | 'destination'
  pickupCoords: null,
  destinationCoords: null,
  pendingOtpEmail: null,
  liveTripMap: null,
  liveTripMarkers: new Map(),
  referral: null,
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
      credentials: 'include',
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
function getPendingReferralCode() {
  const fromUrl = new URLSearchParams(location.search).get('ref');
  if (fromUrl) {
    localStorage.setItem('ll_referral_code', fromUrl.trim().toUpperCase());
    return fromUrl.trim().toUpperCase();
  }
  return (localStorage.getItem('ll_referral_code') || '').trim().toUpperCase();
}

function clearPendingReferralCode() {
  localStorage.removeItem('ll_referral_code');
}

async function saveAndAttachPendingReferral() {
  const code = getPendingReferralCode();
  if (!state.user || !code) return;
  try {
    await attachReferral(code);
    clearPendingReferralCode();
  } catch (_) {}
}

function saveSession(token, user) {
  state.token = token || null;
  state.user = user;
  localStorage.setItem('ll_user', JSON.stringify(user));
}
function clearSession() {
  state.token = null;
  state.user = null;
  clearInterval(notificationPollTimer);
  const panel = $('#notificationPanel');
  if (panel) panel.hidden = true;
  localStorage.removeItem('ll_user');
}

async function logoutUser() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
    updateAuthUI();
  }
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
const getSmartReturnLoads = (query) => apiRequest(`/return-loads/smart?${new URLSearchParams(query)}`);
const getTripReturnSuggestions = (tripId) => apiRequest(`/return-loads/smart/trip/${tripId}`);
const getSmartReturnRoute = (tripId) => apiRequest(`/return-loads/smart/route/${tripId}`);
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
const getDriverRatings = (userId) => apiRequest(`/ratings/${userId}`);
const createRating = (body) => apiRequest('/ratings', { method: 'POST', body });
const getDeliveryProof = (tripId) => apiRequest(`/trips/${tripId}/proof`);
const submitDeliveryProof = (tripId, formData) => apiRequest(`/trips/${tripId}/proof`, { method: 'POST', body: formData, isForm: true });
const submitCommissionSlip = (tripId, formData) => apiRequest(`/trips/${tripId}/commission-slip`, { method: 'POST', body: formData, isForm: true });
const createDispute = (body) => apiRequest('/disputes', { method: 'POST', body });
const getMyDisputes = () => apiRequest('/disputes/mine');
const createSOS = (tripId, body) => apiRequest('/sos/trips/' + tripId, { method: 'POST', body });
const getMySOS = () => apiRequest('/sos/mine');

const getTrips = () => apiRequest('/trips');
const updateTripLocation = (tripId, latitude, longitude) => apiRequest(`/trips/${tripId}/location`, { method: 'PATCH', body: { latitude, longitude } });
const setTripTracking = (tripId, enabled) => apiRequest(`/trips/${tripId}/tracking`, { method: 'PATCH', body: { enabled } });
const updateTripStatus = (tripId, status) => apiRequest(`/trips/${tripId}/status`, { method: 'PATCH', body: { status } });
const forgotPassword = (identifier) => apiRequest('/auth/forgot-password', { method: 'POST', body: identifier.includes('@') ? { email: identifier } : { mobile: identifier } });
const resetPassword = (token, password) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
const getNotifications = () => apiRequest('/notifications');
const getUnreadCount = () => apiRequest('/notifications/unread-count');
const markAllRead = () => apiRequest('/notifications/read-all', { method: 'PATCH' });
const markNotificationRead = (id) => apiRequest('/notifications/' + id + '/read', { method: 'PATCH' });

let notificationPollTimer = null;
let pendingConfirmation = null;

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
  if (!state.user) return;
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
const getReferralDashboard = () => apiRequest('/referrals/me');
const attachReferral = (referralCode) => apiRequest('/referrals/attach', { method: 'POST', body: { referralCode } });

async function loadReferralDashboard() {
  if (!state.user) return;
  try {
    const data = await getReferralDashboard();
    state.referral = data || {};
    const code = String(data.referralCode || data.code || state.user.referralCode || '').trim().toUpperCase();
    const link = data.referralLink || (code ? new URL('/?ref=' + encodeURIComponent(code), location.origin).toString() : '');
    if ($('#myReferralCode')) $('#myReferralCode').value = code;
    if ($('#myReferralLink')) $('#myReferralLink').value = link;
    const setText = (id, value) => { const el = $('#' + id); if (el) el.textContent = String(value ?? 0); };
    setText('referralTotal', data.totalReferrals ?? data.total ?? 0);
    setText('referralQualified', data.qualifiedReferrals ?? data.qualified ?? 0);
    setText('referralCash', 'PKR ' + Number(data.rewardsEarned ?? data.totalRewards ?? data.rewardAmount ?? 0).toLocaleString());
    setText('referralPoints', data.loadPoints ?? data.points ?? 0);
    if ($('#referralLevelBadge')) $('#referralLevelBadge').textContent = data.level || 'Starter';
    const rewards = data.rewards || data.rewardTransactions || [];
    if ($('#referralRewardsList')) $('#referralRewardsList').innerHTML = rewards.length
      ? rewards.slice(0, 20).map(x => '<div class="result-card"><b>' + escapeHtml(x.description || x.type || 'Referral reward') + '</b><p>PKR ' + Number(x.amount || x.rewardAmount || 0).toLocaleString() + (x.points ? ' · ' + Number(x.points).toLocaleString() + ' points' : '') + '</p><small>' + (x.createdAt ? new Date(x.createdAt).toLocaleString() : '') + '</small></div>').join('')
      : '<p class="muted-empty">Abhi koi referral reward nahi mila.</p>';
    if (code && !state.user.referralCode) {
      state.user.referralCode = code;
      localStorage.setItem('ll_user', JSON.stringify(state.user));
    }
  } catch (err) {
    // The share link should still work if the dashboard request fails.
    const code = String(state.user.referralCode || '').trim().toUpperCase();
    if (code) {
      if ($('#myReferralCode')) $('#myReferralCode').value = code;
      if ($('#myReferralLink')) $('#myReferralLink').value = new URL('/?ref=' + encodeURIComponent(code), location.origin).toString();
    }
    console.warn('Referral dashboard failed', err);
  }
}


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

  const hamburgerBtn = $('#hamburgerBtn');
  const navMobile = $('#navMobile');

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = navMobile.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', String(open));
  });

  // Close the mobile hamburger menu whenever the user taps/clicks
  // anywhere outside the menu itself (and outside the hamburger button).
  // Capture phase keeps this reliable even if another element stops bubbling.
  document.addEventListener('pointerdown', (e) => {
    if (!navMobile.classList.contains('open')) return;
    if (navMobile.contains(e.target) || hamburgerBtn.contains(e.target)) return;
    navMobile.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }, true);

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

async function syncSessionFromStorage() {
  const rawUser = localStorage.getItem('ll_user');
  try {
    const cachedUser = rawUser ? JSON.parse(rawUser) : null;
    if (cachedUser) state.user = cachedUser;
  } catch (_) {}
  try {
    const data = await apiRequest('/auth/me');
    state.user = data.user || null;
    if (state.user) localStorage.setItem('ll_user', JSON.stringify(state.user));
    else localStorage.removeItem('ll_user');
  } catch (_) {
    state.user = null;
    localStorage.removeItem('ll_user');
  }
  return state.user;
}

function applyPendingReferralToForms() {
  const referralCode = getPendingReferralCode();
  if (!referralCode) return '';
  const customerField = $('#cReferralCode');
  const driverField = $('#dReferralCode');
  if (customerField && !customerField.value.trim()) customerField.value = referralCode;
  if (driverField && !driverField.value.trim()) driverField.value = referralCode;
  return referralCode;
}

function initAuthModals() {
  applyPendingReferralToForms();
  // If the user is already logged in, Login should never open the login form again.
  $('#loginBtn').addEventListener('click', async () => { await syncSessionFromStorage(); state.user ? showProfile() : openModal('loginModal'); });
  $('#loginBtnMobile').addEventListener('click', async () => { await syncSessionFromStorage(); state.user ? showProfile() : openModal('loginModal'); });
  $('#signupBtn').addEventListener('click', () => {
    if (state.user) return showProfile();
    applyPendingReferralToForms();
    openModal('signupModal');
  });
  $('#signupBtnMobile').addEventListener('click', () => {
    if (state.user) return showProfile();
    applyPendingReferralToForms();
    openModal('signupModal');
  });
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
        referralCode: $('#cReferralCode').value.trim() || getPendingReferralCode() || undefined,
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
    const driverReferralCode = $('#dReferralCode').value.trim() || getPendingReferralCode();
    if (driverReferralCode) fd.append('referralCode', driverReferralCode);
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
  applyPendingReferralToForms();
  $('.signup-tab').forEach((t) => t.classList.toggle('active', t.dataset.role === role));
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
    const [n, p, u, d] = await Promise.all([getNotifications(), getPayments(), getUnreadCount(), getMyDisputes()]);
    loadReferralDashboard().catch(() => {});

    const driver = isDriverUser();
    const customerDashboard = $('#customerDashboardContent');
    const driverDashboard = $('#driverDashboardContent');
    if (customerDashboard) customerDashboard.hidden = driver;
    if (driverDashboard) driverDashboard.hidden = !driver;

    if (driver) {
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
    const disputeList = $('#myDisputesList');
    if (disputeList) {
      const disputes = d.disputes || [];
      disputeList.innerHTML = disputes.map(x => `
        <div class="result-card">
          <b>${x.category} · ${String(x.status || '').replaceAll('_',' ')}</b>
          <p>${x.description}</p>
          <small>Trip: ${x.trip?.id ? x.trip.id.slice(0, 8) : '—'} · ${new Date(x.createdAt).toLocaleString()}</small>
          ${x.resolution ? '<p><b>Resolution:</b> ' + x.resolution + '</p>' : ''}
        </div>`).join('') || '<p class="muted-empty">Abhi koi dispute nahi.</p>';
    }
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

function buildReferralShareData() {
  const link = ($('#myReferralLink')?.value || '').trim();
  const code = ($('#myReferralCode')?.value || '').trim();
  const fallbackLink = code
    ? new URL('/?ref=' + encodeURIComponent(code), location.origin).toString()
    : '';
  const finalLink = link || fallbackLink;
  return {
    link: finalLink,
    text: finalLink
      ? 'LoadLink Pakistan join karein. Mere referral link se signup karein: ' + finalLink
      : 'LoadLink Pakistan join karein.',
  };
}

async function copyReferralLink(value) {
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {}
  try {
    const input = $('#myReferralLink');
    if (input) {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      return document.execCommand('copy');
    }
  } catch (_) {}
  return false;
}

async function shareReferralLink() {
  const { link, text } = buildReferralShareData();
  if (!link) {
    toast('Referral link abhi load nahi hua. Profile dobara open karein.');
    return;
  }

  // Android/iPhone native share sheet.
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'LoadLink Pakistan',
        text: 'LoadLink Pakistan join karein. Mere referral link se signup karein.',
        url: link,
      });
      return;
    } catch (err) {
      // User cancelled the native sheet: do nothing. Other browser errors
      // should continue to the reliable WhatsApp/copy fallbacks below.
      if (err?.name === 'AbortError') return;
    }
  }

  // Reliable mobile fallback. Direct navigation is less likely to be blocked
  // than window.open() after an async operation.
  const whatsappUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
  try {
    window.location.href = whatsappUrl;
    return;
  } catch (_) {}

  const copied = await copyReferralLink(link);
  toast(copied ? 'Referral link copy ho gaya. WhatsApp se share karein.' : 'Referral link: ' + link);
}

function initDashboard() {
  // Delegated handlers keep working even when the profile/dashboard markup is
  // re-rendered after login.
  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest?.('#copyReferralBtn');
    const shareButton = event.target.closest?.('#shareReferralBtn');

    if (copyButton) {
      event.preventDefault();
      const { link } = buildReferralShareData();
      if (!link) return toast('Referral link abhi load nahi hua. Profile dobara open karein.');
      copyButton.disabled = true;
      try {
        const copied = await copyReferralLink(link);
        toast(copied ? 'Referral link copy ho gaya.' : 'Copy nahi ho saka. Link manually select karein.');
      } finally {
        copyButton.disabled = false;
      }
      return;
    }

    if (shareButton) {
      event.preventDefault();
      shareButton.disabled = true;
      try {
        await shareReferralLink();
      } catch (err) {
        const { link } = buildReferralShareData();
        const copied = await copyReferralLink(link);
        toast(copied ? 'Share open nahi hua. Referral link copy ho gaya.' : 'Share nahi ho saka. Dobara try karein.');
      } finally {
        shareButton.disabled = false;
      }
    }
  });
  $('#profileLogoutBtn').addEventListener('click', async () => {
    try {
      await logoutUser();
      toast('Logout successful.');
      location.reload();
    } catch (_) {
      clearSession();
      location.reload();
    }
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


function getProfileCompletion(user, vehicles = []) {
  if (!user) return { percent: 0, missing: [] };
  const checks = [];
  const add = (label, value, weight) => checks.push({ label, complete: !!String(value ?? '').trim(), weight });
  add('Full name', user.fullName, 15);
  add('Mobile number', user.mobile, 15);
  add('Email address', user.email, 15);
  add('City', user.city, 10);

  if (user.role === 'DRIVER') {
    const d = user.driverProfile || {};
    add('CNIC details', d.cnic, 10);
    add('Driving license', d.drivingLicense, 10);
    add('CNIC expiry date', d.cnicExpiryDate, 5);
    add('License expiry date', d.licenseExpiryDate, 5);
    checks.push({ label: 'At least one vehicle', complete: vehicles.length > 0, weight: 10 });
    // Profile photo is useful but optional, so it does not block 100%.
  } else {
    // Customer profile is complete from the core account details above.
    // Profile picture remains optional.
  }

  const total = checks.reduce((s, x) => s + x.weight, 0);
  const earned = checks.reduce((s, x) => s + (x.complete ? x.weight : 0), 0);
  return { percent: Math.round((earned / total) * 100), missing: checks.filter(x => !x.complete).map(x => x.label) };
}

function renderProfileCompletion(vehicles = []) {
  const result = getProfileCompletion(state.user, vehicles);
  const percent = result.percent;
  const percentEl = $('#profileCompletionPercent');
  const fillEl = $('#profileCompletionFill');
  const hintEl = $('#profileCompletionHint');
  const missingEl = $('#profileCompletionMissing');
  if (!percentEl || !fillEl) return;
  percentEl.textContent = percent + '%';
  fillEl.style.width = percent + '%';
  if (hintEl) hintEl.textContent = percent >= 100 ? 'Profile 100% complete hai.' : 'Profile complete karne ke liye remaining details add karein.';
  if (missingEl) missingEl.innerHTML = result.missing.length
    ? '<b>Remaining:</b> ' + result.missing.map(escapeHtml).join(' • ')
    : '<span class="profile-complete-message">✓ Profile complete</span>';
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
  renderProfileCompletion();

  const vehicleCard = $('#driverVehiclesCard');
  if (vehicleCard) vehicleCard.hidden = state.user.role !== 'DRIVER';

  if (state.user.role === 'DRIVER') {
    await loadDriverVehicles();
    await loadDriverFeedback();
    renderProfileCompletion(window.__profileVehicles || []);
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

async function loadDriverFeedback() {
  const card = $('#driverFeedbackCard');
  if (!card || !state.user || state.user.role !== 'DRIVER') return;
  card.hidden = false;
  try {
    const result = await getDriverRatings(state.user.id);
    $('#driverCompletedLoads').textContent = Number(result.completedTrips || 0).toLocaleString();
    $('#driverAverageRating').textContent = result.average != null ? '⭐ ' + result.average + '/5' : '—';
    $('#driverRatingCount').textContent = Number(result.count || 0).toLocaleString();
    const list = $('#driverFeedbackList');
    const ratings = result.ratings || [];
    list.innerHTML = ratings.length
      ? ratings.slice(0, 10).map(r => '<div class="result-card"><b>⭐ ' + Number(r.rating) + '/5</b><p>' + escapeHtml(r.comment || 'Customer ne rating di hai, feedback nahi likha.') + '</p><small>By ' + escapeHtml(r.fromUser?.fullName || 'Customer') + ' · ' + new Date(r.createdAt).toLocaleDateString() + '</small></div>').join('')
      : '<p class="muted-empty">Abhi customer reviews nahi hain.</p>';
  } catch (_) {}
}

async function loadDriverVehicles() {
  const list = $('#driverVehicles');
  if (!list || !isDriverUser()) return;
  try {
    const result = await getMyVehicles();
    const vehicles = result.vehicles || [];
    window.__profileVehicles = vehicles;
    renderProfileCompletion(vehicles);
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
    await refreshDriverSession();
    if (!isDriverUser()) return toast('Driver/Transporter account se login karein.');
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
    const submitVehicle = async () => {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try { await createVehicle(fd);
      form.reset();
      await loadDriverVehicles();
        toast('Gaari add ho gayi. Verification admin karega.');
      } catch (err) { toast(err.message || 'Gaari add nahi ho saki.'); }
      finally { button.disabled = false; }
    };
    pendingConfirmation = submitVehicle;
    openModal('confirmPostModal');
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
  $('#confirmPostBtn')?.addEventListener('click', async () => {
    if (!pendingConfirmation) return;
    const action = pendingConfirmation;
    pendingConfirmation = null;
    closeModal('confirmPostModal');
    await action();
  });
  $('#editPostBtn')?.addEventListener('click', () => {
    pendingConfirmation = null;
    closeModal('confirmPostModal');
    $('#postload')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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

    pendingConfirmation = async () => {
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
    };
    openModal('confirmPostModal');
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
      const el = $('#fareEstimateLine');
      if (!el) return;
      el.innerHTML = f.estimatedFare
        ? `Rs. ${f.estimatedFare.toLocaleString()} <small>(suggested estimate)</small><br><span class="fare-range">Typical range: Rs. ${f.minFare.toLocaleString()} – ${f.maxFare.toLocaleString()}</span>`
        : 'Not available';
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
  $('#mapAddressSearchBtn').addEventListener('click', () => searchAddressOnMap($('#mapAddressSearch').value));
  $('#mapAddressSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAddressOnMap($('#mapAddressSearch').value);
    }
  });
}

let leafletPromise = null;
let lastGeocodeRequestAt = 0;

async function loadLeaflet() {
  if (window.L) return window.L;
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-loadlink-leaflet]');
    if (existing) {
      if (window.L) return resolve(window.L);
      existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Leaflet load nahi hua.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Leaflet load nahi hua.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.loadlinkLeaflet = 'true';
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet available nahi hua.'));
    script.onerror = () => reject(new Error('Leaflet script load nahi hua.'));
    document.head.appendChild(script);
  }).catch((err) => {
    leafletPromise = null;
    throw err;
  });
  return leafletPromise;
}

async function waitForGeocodeSlot() {
  const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastGeocodeRequestAt = Date.now();
}

async function reverseGeocodeLocation(latitude, longitude) {
  await waitForGeocodeSlot();
  const result = await apiRequest('/location/reverse-geocode', {
    method: 'POST',
    body: { latitude, longitude },
  });
  return result.displayName || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

async function geocodeAddress(address) {
  await waitForGeocodeSlot();
  const result = await apiRequest('/location/geocode', {
    method: 'POST',
    body: { address },
  });
  return result.location || null;
}

async function renderLeafletMap(lat, lng) {
  const L = await loadLeaflet();
  const mapEl = $('#locationMap');
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
    state.mapMarker = null;
  }
  mapEl.innerHTML = '';
  const center = [Number(lat), Number(lng)];
  const map = L.map(mapEl, {
    center,
    zoom: 13,
    zoomControl: true,
    attributionControl: true,
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
  });
  L.tileLayer('/api/map/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    minZoom: 2,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  const marker = L.marker(center, { draggable: true, autoPan: true, title: 'Selected location' }).addTo(map);

  const selectLocation = async (leafletLatLng) => {
    const selected = { lat: Number(leafletLatLng.lat), lng: Number(leafletLatLng.lng) };
    state._pendingCoords = selected;
    $('#selectedLocation').value = `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`;
    if ($('#mapSearchStatus')) $('#mapSearchStatus').textContent = '📍 Location select ho gayi. Address resolve ho raha hai…';
    try {
      const address = await reverseGeocodeLocation(selected.lat, selected.lng);
      if (address) $('#selectedLocation').value = address;
      if ($('#mapSearchStatus')) $('#mapSearchStatus').textContent = '📍 Location select ho gayi. Neeche Confirm Location press karein.';
    } catch (_) {
      if ($('#mapSearchStatus')) $('#mapSearchStatus').textContent = '📍 Location select ho gayi. Neeche Confirm Location press karein.';
    }
  };

  map.on('click', (event) => {
    if (!event.latlng) return;
    marker.setLatLng(event.latlng);
    selectLocation(event.latlng);
  });
  marker.on('dragend', () => selectLocation(marker.getLatLng()));

  state.map = map;
  state.mapMarker = marker;
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 150);
}

async function openMapModal(target) {
  state.mapTarget = target;
  state._pendingCoords = null;
  $('#mapModalTitle').textContent = target === 'pickup' ? 'Select Pickup Location' : 'Select Destination Location';
  $('#selectedLocation').value = '';
  $('#mapSearchStatus').textContent = 'OpenStreetMap map load ho raha hai…';
  $('#mapModal').classList.add('open');
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const defaultCenter = { lat: 30.3753, lng: 69.3451 };
    await renderLeafletMap(defaultCenter.lat, defaultCenter.lng);
    $('#mapSearchStatus').textContent = 'Address search karein ya map par pin move karein.';
  } catch (err) {
    $('#mapSearchStatus').textContent = '❌ ' + (err.message || 'Map load nahi ho saka.');
  }
}

function closeMapModal() {
  $('#mapModal').classList.remove('open');
  if (state.map) state.map.remove();
  state.map = null;
  state.mapMarker = null;
}

async function searchAddressOnMap(query) {
  const address = String(query || '').trim();
  const status = $('#mapSearchStatus');
  if (!address) {
    if (status) status.textContent = 'Address enter karein.';
    return;
  }
  try {
    if (status) status.textContent = '🔎 Location search ho rahi hai…';
    const result = await geocodeAddress(address);
    if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lng))) {
      if (status) status.textContent = '❌ Ye address nahi mila. Thora mukammal address try karein.';
      return;
    }
    state._pendingCoords = { lat: Number(result.lat), lng: Number(result.lng) };
    // Keep the user's complete address in the form. The geocoder may return a
    // shorter canonical street/area label even when it found the correct area.
    $('#selectedLocation').value = result.approximate
      ? address
      : (result.displayName || address);
    await renderLeafletMap(state._pendingCoords.lat, state._pendingCoords.lng);
    if (status) status.textContent = result.approximate
      ? '📍 Address match mil gaya. Map pin verify karke Confirm Location karein.'
      : '📍 Location mil gayi. Neeche Confirm Location press karein.';
  } catch (err) {
    if (status) status.textContent = '❌ Location search failed. Address dobara check karein.';
  }
}

function onMapClick(e) {
  return e;
}


document.addEventListener('click', async (e) => {
  const searchBtn = e.target.closest('.address-search-btn');
  if (!searchBtn) return;
  const target = searchBtn.dataset.mapTarget;
  const input = target === 'pickup' ? $('#pickup') : $('#destination');
  state.mapTarget = target;
  await openMapModal(target);
  const query = input?.value?.trim() || '';
  $('#mapAddressSearch').value = query;
  if (query) await searchAddressOnMap(query);
});

function confirmMapLocation() {
  const value = $('#selectedLocation').value;
  if (!value || !state._pendingCoords) {
    toast('Pehle address search karein ya map par location select karein.');
    return;
  }
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
    const box = $('#rlResults');
    try {
      box.innerHTML = '<p class="muted-empty">🤖 Return-route matches calculate ho rahe hain...</p>';
      const query = {
        returnDestination: $('#rlReturnDestination').value,
        vehicleType: $('#rlVehicleType').value,
        radiusKm: $('#rlRadius').value,
      };
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000, maximumAge: 60000 }));
          query.currentLat = pos.coords.latitude;
          query.currentLng = pos.coords.longitude;
        } catch (_) {}
      }
      const results = await getSmartReturnLoads(query);
      const loads = results.loads || [];
      if (!loads.length) {
        box.innerHTML = '<p class="muted-empty">Abhi koi strong return-route match nahi mila.</p>';
        return;
      }
      box.innerHTML = loads.map((l) => `
        <div class="result-card">
          <div class="rc-top"><h4>${escapeHtml(l.pickupAddress)} → ${escapeHtml(l.destinationAddress)}</h4><span class="badge-pill">🤖 ${l.smartMatchScore}% Match</span></div>
          <p>${escapeHtml(l.description || 'General cargo')}</p>
          <p>Weight: ${l.weightKg} kg · Vehicle: ${escapeHtml(l.preferredVehicle || 'Any suitable')}</p>
          ${l.distanceFromCurrentKm != null ? '<p>📍 Pickup: ' + Number(l.distanceFromCurrentKm).toFixed(1) + ' km away</p>' : ''}
          <p class="muted-empty">${(l.smartMatchReasons || []).slice(0,3).map(escapeHtml).join(' · ')}</p>
          <small>Posted ${new Date(l.createdAt).toLocaleString()}</small>
          <button type="button" class="btn btn-primary contact-load-btn" data-load-id="${escapeHtml(l.id)}" style="margin-top:12px;width:100%">📲 LoadLink Team se Contact Karein</button>
        </div>
      `).join('');
    } catch (err) { box.innerHTML = '<p class="muted-empty">' + escapeHtml(err.message) + '</p>'; }
  });
}

function renderVehicleResults(vehicles) {
  const el = $('#ftResults');
  if (!vehicles.length) { el.innerHTML = '<p class="muted-empty">No vehicles found.</p>'; return; }
  el.innerHTML = vehicles.map((v) => `
    <div class="result-card">
      <div class="rc-top">
        <h4>${escapeHtml(v.vehicleType)}</h4>
        ${v.isVerified ? '<span class="badge-pill">✅ Verified</span>' : ''}
      </div>
      <p>Capacity: ${escapeHtml(v.capacityKg)} kg</p>
      ${v.distanceKm != null ? `<p>${Number(v.distanceKm).toFixed(1)} km away</p>` : ''}
      <p>Status: ${escapeHtml(v.status)}</p>
      <p>Driver: ${escapeHtml(v.driver?.user?.fullName || '—')}</p>
      ${state.user?.role === 'CUSTOMER' ? `
        <button type="button" class="btn btn-primary contact-driver-team-btn"
          data-driver-name="${escapeHtml(v.driver?.user?.fullName || '—')}"
          data-driver-city="${escapeHtml(v.driver?.user?.city || '—')}"
          data-vehicle-type="${escapeHtml(v.vehicleType || '—')}"
          data-vehicle-number="${escapeHtml(v.vehicleNumber || '—')}"
          data-capacity="${escapeHtml(v.capacityKg || '—')}"
          style="margin-top:12px;width:100%">
          📲 Contact LoadLink Team
        </button>
        <div class="muted-empty" style="margin-top:6px;text-align:center">WhatsApp: +92 309 2007904</div>
      ` : ''}
    </div>
  `).join('');
}

async function contactDriverViaTeam(btn) {
  if (!state.user || state.user.role !== 'CUSTOMER') {
    toast('Ye contact option customer account ke liye hai.');
    return;
  }

  const customerName = state.user.fullName || '—';
  const customerMobile = state.user.mobile || '—';
  const message = [
    'Assalam-o-Alaikum LoadLink Team,',
    '',
    '🚛 *Driver Contact Request*',
    '',
    '👤 *Customer Details*',
    `Name: ${customerName}`,
    `Mobile: ${customerMobile}`,
    `City: ${state.user.city || '—'}`,
    '',
    '🚚 *Driver / Vehicle Details*',
    `Driver Name: ${btn.dataset.driverName || '—'}`,
    `Driver City: ${btn.dataset.driverCity || '—'}`,
    `Vehicle Type: ${btn.dataset.vehicleType || '—'}`,
    `Vehicle Number: ${btn.dataset.vehicleNumber || '—'}`,
    `Capacity: ${btn.dataset.capacity || '—'} kg`,
    '',
    'Please customer ki taraf se is driver se contact arrange kar dein.',
  ].join('\\n');

  const whatsappNumber = '923092007904';
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.contact-driver-team-btn');
  if (!btn) return;
  contactDriverViaTeam(btn);
});

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
      ${(!ownOnly && isDriverUser()) ? `
        <button type="button" class="btn btn-primary contact-load-btn" data-load-id="${l.id}" style="margin-top:12px;width:100%">
          📲 LoadLink Team se Contact Karein
        </button>
      ` : ''}
    </div>
  `).join('');
}

async function contactPostedLoad(loadId) {
  // Always use the server-authoritative session; cached localStorage role
  // can be stale after a CUSTOMER -> DRIVER upgrade.
  await refreshDriverSession();
  if (!isDriverUser()) {
    return toast('Driver/Transporter account se login karein.');
  }

  let load;
  try {
    // Save the team-contact request FIRST. WhatsApp must not open as if the
    // team was contacted when the backend request failed.
    await apiRequest(`/loads/${encodeURIComponent(loadId)}/contact-team`, { method: 'POST', body: {} });
    load = await apiRequest(`/loads/${encodeURIComponent(loadId)}`);
    toast('✅ LoadLink Team ko request save ho gayi. WhatsApp bhi open ho raha hai.');
  } catch (requestError) {
    toast(requestError.message || 'Team request save nahi ho saki. WhatsApp nahi khola gaya.');
    return;
  }
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
let driverGeoTripId = null;
let driverGeoErrorShown = false;
function stopDriverTracking() { if (driverGeoWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(driverGeoWatch); driverGeoWatch = null; driverGeoTripId = null; }
function startDriverTracking(trip) {
  if (!state.user || state.user.role !== 'DRIVER' || !navigator.geolocation || !trip?.trackingEnabled) return;
  if (driverGeoWatch !== null && driverGeoTripId === trip.id) return;
  stopDriverTracking(); driverGeoTripId = trip.id; driverGeoErrorShown = false;
  const sendPosition = async (pos) => { const { latitude, longitude, accuracy } = pos.coords || {}; if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return; try { await updateTripLocation(trip.id, latitude, longitude); const accuracyText = Number.isFinite(accuracy) ? Math.round(accuracy) + 'm' : 'GPS'; const el=document.querySelector('[data-location-status="'+trip.id+'"]'); if(el) el.textContent='📍 Live location ON · ±'+accuracyText; } catch(err) { if(!driverGeoErrorShown){ driverGeoErrorShown=true; toast(err.message || 'Live location update nahi ho saki.'); } } };
  const handleError = (err) => { if(driverGeoErrorShown)return; driverGeoErrorShown=true; const messages={1:'Location permission denied. Browser settings mein Location allow karein.',2:'Current location mil nahi saki. GPS/location ON karke dobara try karein.',3:'Location request timeout. GPS signal check karein.'}; toast(messages[err?.code] || 'Live location available nahi hai.'); };
  driverGeoWatch=navigator.geolocation.watchPosition(sendPosition,handleError,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
}
async function enableDriverTracking(tripId) { if(!navigator.geolocation) return toast('Is browser mein GPS location support nahi hai.'); try { await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000})); await setTripTracking(tripId,true); toast('📍 Live location ON ho gayi.'); await loadLiveTrips(); } catch(err) { toast(err?.code===1?'Location permission denied. Browser settings mein Location allow karein.':(err.message||'Live tracking start nahi ho saki.')); } }
async function disableDriverTracking(tripId) { try { await setTripTracking(tripId,false); if(driverGeoTripId===tripId) stopDriverTracking(); toast('📍 Live location OFF ho gayi.'); await loadLiveTrips(); } catch(err) { toast(err.message || 'Live tracking stop nahi ho saki.'); } }
function clearLiveTripMap() {
  if (state.liveTripMap) {
    state.liveTripMap.remove();
    state.liveTripMap = null;
  }
  state.liveTripMarkers.clear();
}

function renderCustomerLiveTripMap(trips) {
  const host = $('#liveTripMap');
  const card = $('#customerLiveMapCard');
  const status = $('#liveTripMapStatus');
  if (!host) return;

  const customerTrips = (trips || []).filter((t) =>
    state.user?.role === 'CUSTOMER' &&
    t.trackingEnabled &&
    Number.isFinite(Number(t.currentLatitude)) &&
    Number.isFinite(Number(t.currentLongitude)) &&
    t.status !== 'DELIVERED'
  );

  if (!customerTrips.length || typeof L === 'undefined') {
    clearLiveTripMap();
    host.hidden = true;
    if (card) card.hidden = false;
    if (status) status.textContent = customerTrips.length ? 'Map library load nahi hui.' : 'Abhi koi authorized driver live location share nahi kar raha.';
    return;
  }

  if (card) card.hidden = false;
  host.hidden = false;
  if (status) status.textContent = customerTrips.length === 1
    ? 'Driver ki live location authorized trip par update ho rahi hai.'
    : customerTrips.length + ' active trips ki live locations update ho rahi hain.';

  if (!state.liveTripMap) {
    state.liveTripMap = L.map(host, { zoomControl: true, attributionControl: true }).setView(
      [Number(customerTrips[0].currentLatitude), Number(customerTrips[0].currentLongitude)], 11
    );
    L.tileLayer('/api/map/tiles/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(state.liveTripMap);
  }

  const activeIds = new Set();
  const bounds = [];
  customerTrips.forEach((trip) => {
    const lat = Number(trip.currentLatitude);
    const lng = Number(trip.currentLongitude);
    activeIds.add(trip.id);
    bounds.push([lat, lng]);

    let marker = state.liveTripMarkers.get(trip.id);
    const label = '🚚 Driver live · ' + (trip.vehicle?.vehicleNumber || trip.driver?.user?.fullName || 'Vehicle');
    if (!marker) {
      marker = L.marker([lat, lng]).addTo(state.liveTripMap);
      marker.bindPopup('<b>' + escapeHtml(label) + '</b><br>' + escapeHtml(trip.pickup || '') + ' → ' + escapeHtml(trip.destination || ''));
      state.liveTripMarkers.set(trip.id, marker);
    } else {
      marker.setLatLng([lat, lng]);
      marker.setPopupContent('<b>' + escapeHtml(label) + '</b><br>' + escapeHtml(trip.pickup || '') + ' → ' + escapeHtml(trip.destination || ''));
    }
  });

  for (const [id, marker] of state.liveTripMarkers.entries()) {
    if (!activeIds.has(id)) {
      state.liveTripMap.removeLayer(marker);
      state.liveTripMarkers.delete(id);
    }
  }

  if (bounds.length) {
    state.liveTripMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    setTimeout(() => state.liveTripMap?.invalidateSize(), 50);
  }
}

async function loadLiveTrips() {
  const el = $('#ltResults');
  if (!state.user) { el.innerHTML = '<p class="muted-empty">Login to see your live trips.</p>'; return; }
  try {
    const { trips } = await getTrips();
    if (!trips.length) { el.innerHTML = '<p class="muted-empty">No active trips.</p>'; return; }
    if (state.user.role === 'DRIVER') { const trackingTrip=trips.find(t=>t.trackingEnabled && ['ASSIGNED','PICKED_UP','IN_TRANSIT','NEAR_DESTINATION'].includes(t.status)); if(trackingTrip) startDriverTracking(trackingTrip); else stopDriverTracking(); }
    renderCustomerLiveTripMap(trips);
    el.innerHTML = trips.map((t) => `
      <div class="result-card">
        <div class="rc-top">
          <h4>Trip #${t.id.slice(0, 8)}</h4>
          <span class="badge-pill">${t.status}</span>
        </div>
        <p>${t.pickup} → ${t.destination}</p>
        <p>Vehicle: ${t.vehicle?.vehicleType || '—'}</p>
        <p>Last updated: ${new Date(t.updatedAt).toLocaleString()}</p>
        ${state.user.role === 'DRIVER' && ['ASSIGNED','PICKED_UP','IN_TRANSIT','NEAR_DESTINATION'].includes(t.status) ? '<p class="muted-empty" data-location-status="' + t.id + '">' + (t.trackingEnabled ? '📍 Live location ON' : '📍 Live location OFF') + '</p>' : ''}
        <div class="field-row">
          ${state.user.role === 'DRIVER' ? `
            ${t.trackingEnabled ? '<button class="btn btn-outline trip-tracking-btn" data-trip="' + t.id + '" data-tracking="false">⏹ Stop Location</button>' : '<button class="btn btn-primary trip-tracking-btn" data-trip="' + t.id + '" data-tracking="true">📍 Start Live Location</button>'}
            ${state.user.role === 'DRIVER' && t.booking && t.booking.commissionStatus !== 'VERIFIED' ? '<div class="trip-commission-note">💰 Commission 5% · PKR ' + Number(t.booking.commissionAmount || (Number(t.booking.agreedFare || 0) * 0.05)).toLocaleString() + ' · ' + (t.booking.commissionStatus === 'SLIP_UPLOADED' ? 'Slip uploaded — Manager verification pending' : 'Transaction slip required before Manager approval') + '</div><button class="btn btn-primary commission-slip-btn" data-trip="' + t.id + '" data-amount="' + Number(t.booking.commissionAmount || (Number(t.booking.agreedFare || 0) * 0.05)) + '">💰 Upload Commission Slip</button>' : ''}
            ${t.status === 'ASSIGNED' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="PICKED_UP">Picked Up</button>' : ''}
            ${t.status === 'PICKED_UP' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="IN_TRANSIT">In Transit</button>' : ''}
            ${t.status === 'IN_TRANSIT' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="NEAR_DESTINATION">Near Destination</button>' : ''}
            ${t.status === 'NEAR_DESTINATION' ? '<button class="btn btn-primary trip-status-btn" data-trip="' + t.id + '" data-status="DELIVERED">Delivered</button>' : ''}
            ${t.status === 'DELIVERED' ? '<button class="btn btn-outline delivery-proof-btn" data-trip="' + t.id + '">📦 Add Proof of Delivery</button>' : ''}
          ` : ''}
          ${t.status === 'DELIVERED' ? '<button class="btn btn-outline view-proof-btn" data-trip="' + t.id + '">👁️ View Delivery Proof</button>' : ''}
          ${t.status === 'DELIVERED' && state.user.role === 'CUSTOMER' && t.driver?.user?.id ? '<button class="btn btn-outline rate-driver-btn" data-trip="' + t.id + '" data-driver-user="' + t.driver.user.id + '">⭐ Rate Driver</button>' : ''}
          ${t.status !== 'DELIVERED' ? '<button class="btn btn-outline sos-btn" data-trip="' + t.id + '">🚨 SOS</button>' : ''}
          <button class="btn btn-outline raise-dispute-btn" data-trip="${t.id}">⚖️ Raise Dispute</button>
          ${state.user.role === 'DRIVER' && (t.status === 'IN_TRANSIT' || t.status === 'NEAR_DESTINATION') ? '<div class="trip-return-suggestions" data-trip-return="' + t.id + '"><p class="muted-empty">🔄 Return loads check ho rahe hain...</p></div><div class="trip-route-intelligence" data-trip-route="' + t.id + '"><p class="muted-empty">🧭 Best return route calculate ho raha hai...</p></div>' : ''}
        </div>      </div>
    `).join('');

    if (state.user.role === 'DRIVER') {
      trips.filter(t => t.status === 'IN_TRANSIT' || t.status === 'NEAR_DESTINATION').forEach(async (trip) => {
        try {
          const result = await getTripReturnSuggestions(trip.id);
          const box = document.querySelector('[data-trip-return="' + trip.id + '"]');
          if (box) {
            const loads = result.loads || [];
            if (!loads.length) {
              box.innerHTML = '<p class="muted-empty">🔄 Is delivery point ke qareeb abhi suitable return load nahi mila.</p>';
            } else {
              box.innerHTML = '<div class="trip-return-head"><strong>🔄 Smart Return Loads</strong><small>Delivery point ke qareeb</small></div>' + loads.map(load => '<div class="trip-return-item"><div><b>' + escapeHtml(load.pickupAddress) + ' → ' + escapeHtml(load.destinationAddress) + '</b><small>Match ' + load.returnMatchScore + '% · ' + Math.round(load.distanceFromDeliveryKm) + ' km away · ' + escapeHtml(load.weightKg) + ' kg</small><small>' + escapeHtml((load.returnMatchReasons || []).slice(0,2).join(' · ')) + '</small></div><button type="button" class="btn btn-outline contact-load-btn" data-load-id="' + load.id + '">Contact</button></div>').join('');
            }
          }
          const routeBox = document.querySelector('[data-trip-route="' + trip.id + '"]');
          if (routeBox) {
            const routeResult = await getSmartReturnRoute(trip.id);
            const routes = routeResult.routes || [];
            if (!routes.length) {
              routeBox.innerHTML = '<p class="muted-empty">🧭 Abhi koi practical multi-load return route nahi mila.</p>';
            } else {
              routeBox.innerHTML = '<div class="trip-route-head"><strong>🧭 Advanced Return Route</strong><small>Final: ' + escapeHtml(routeResult.finalDestination || '') + '</small></div>' +
                routes.map((route, idx) => '<div class="trip-route-card"><div class="trip-route-title"><b>Option ' + (idx + 1) + '</b><span>Score ' + route.chainScore + '%</span></div>' +
                  '<div class="trip-route-chain">Current Trip → ' + route.loads.map(load => escapeHtml(load.pickupAddress) + ' → ' + escapeHtml(load.destinationAddress)).join(' → ') + ' → Final Destination</div>' +
                  '<small>Detour ~' + route.totalDetourKm + ' km · Cargo ' + route.totalCargoKg + ' kg · Est. return revenue Rs. ' + Number(route.estimatedReturnRevenuePkr || 0).toLocaleString() + ' · ' + route.loads.length + ' load' + (route.loads.length > 1 ? 's' : '') + '</small>' +
                  route.loads.map(load => '<div class="trip-route-leg"><b>' + escapeHtml(load.pickupAddress) + ' → ' + escapeHtml(load.destinationAddress) + '</b><small>Pickup ' + load.legPickupKm + ' km · Detour ' + load.legDetourKm + ' km · ' + escapeHtml(load.weightKg) + ' kg</small></div>').join('') +
                '</div>').join('');
            }
          }
        } catch (_) {
          const box = document.querySelector('[data-trip-return="' + trip.id + '"]');
          if (box) box.innerHTML = '<p class="muted-empty">Return-load suggestions unavailable.</p>';
        }
      });
    }
  } catch (err) {
    el.innerHTML = '<p class="muted-empty">Could not load live trips.</p>';
  }
}

document.addEventListener('click', async (e) => {
  const tracking=e.target.closest('.trip-tracking-btn'); if(tracking){ tracking.disabled=true; try{ if(tracking.dataset.tracking==='true') await enableDriverTracking(tracking.dataset.trip); else await disableDriverTracking(tracking.dataset.trip); } finally{tracking.disabled=false;} return; }
  const rate = e.target.closest('.rate-driver-btn');
  if (rate) {
    $('#ratingForm').reset();
    $('#ratingTripId').value = rate.dataset.trip;
    $('#ratingToUserId').value = rate.dataset.driverUser;
    openModal('ratingModal');
    return;
  }
  const view = e.target.closest('.view-proof-btn');
  if (view) {
    try {
      const result = await getDeliveryProof(view.dataset.trip);
      const p = result.proof;
      toast('POD: ' + p.receiverName + (p.receiverPhone ? ' · ' + p.receiverPhone : '') + (p.notes ? ' · ' + p.notes : ''));
    } catch (err) { toast(err.message); }
    return;
  }
  const statusBtn=e.target.closest('.trip-status-btn'); if(statusBtn){ statusBtn.disabled=true; try{ await updateTripStatus(statusBtn.dataset.trip,statusBtn.dataset.status); if(statusBtn.dataset.status==='DELIVERED' && driverGeoTripId===statusBtn.dataset.trip) stopDriverTracking(); toast('Trip status update ho gaya.'); await loadLiveTrips(); } catch(err){toast(err.message);} finally{statusBtn.disabled=false;} return; }
  const commissionBtn = e.target.closest('.commission-slip-btn');
  if (commissionBtn) {
    $('#commissionSlipForm').reset();
    $('#commissionSlipTripId').value = commissionBtn.dataset.trip;
    $('#commissionSlipAmount').value = 'PKR ' + Number(commissionBtn.dataset.amount || 0).toLocaleString();
    openModal('commissionSlipModal');
    return;
  }
  const btn = e.target.closest('.delivery-proof-btn');
  if (!btn) return;
  $('#deliveryProofForm').reset();
  $('#proofTripId').value = btn.dataset.trip;
  openModal('deliveryProofModal');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'commissionSlipForm') {
    e.preventDefault();
    const form = e.target;
    const tripId = $('#commissionSlipTripId').value;
    const file = $('#commissionSlipFile').files?.[0];
    if (!file) return toast('Transaction slip select karein.');
    if (file.size > 5 * 1024 * 1024) return toast('Slip 5MB se chhoti honi chahiye.');
    const fd = new FormData();
    fd.append('slip', file);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await submitCommissionSlip(tripId, fd);
      closeModal('commissionSlipModal');
      toast('Commission transaction slip upload ho gayi. Manager verification ke baad approval hoga.');
      await loadLiveTrips();
    } catch (err) { toast(err.message); }
    finally { button.disabled = false; }
    return;
  }
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
  const btn = e.target.closest('.sos-btn');
  if (!btn) return;
  $('#sosForm').reset();
  $('#sosTripId').value = btn.dataset.trip;
  openModal('sosModal');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'sosForm') return;
  e.preventDefault();
  if (!window.confirm('🚨 Emergency SOS send karna hai?')) return;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const tripId = $('#sosTripId').value;
  const body = { type: $('#sosType').value, message: $('#sosMessage').value.trim() };
  if (navigator.geolocation) {
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }));
      body.latitude = position.coords.latitude;
      body.longitude = position.coords.longitude;
    } catch (_) {}
  }
  try {
    await createSOS(tripId, body);
    closeModal('sosModal');
    toast('🚨 SOS alert bhej diya gaya hai.');
    await loadLiveTrips();
  } catch (err) { toast(err.message); }
  finally { submitBtn.disabled = false; }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.raise-dispute-btn');
  if (!btn) return;
  $('#disputeForm').reset();
  $('#disputeTripId').value = btn.dataset.trip;
  openModal('disputeModal');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'ratingForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await createRating({
      tripId: $('#ratingTripId').value,
      toUserId: $('#ratingToUserId').value,
      rating: Number($('#ratingValue').value),
      comment: $('#ratingComment').value.trim() || undefined,
    });
    closeModal('ratingModal');
    toast('⭐ Driver ki rating aur feedback submit ho gaya. Shukriya!');
    await loadLiveTrips();
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; }
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
  // Referral links use /?ref=CODE. Save the code immediately and keep the
  // signup field pre-filled even if the user opens signup after page load.
  getPendingReferralCode();
  applyPendingReferralToForms();
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

  // Sync the existing session after all UI controls are initialized.
  syncSessionFromStorage().then(async (user) => {
    updateAuthUI();
    if (user) {
      await saveAndAttachPendingReferral();
      loadMarketplace();
      loadReferralDashboard();
    }
  });

  // Live Trips section loads lazily when scrolled into view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { loadLiveTrips(); io.disconnect(); }
    });
  }, { threshold: 0.2 });
  io.observe($('#livetrips'));
  window.__tripPoller = setInterval(() => { if (state.user && document.visibilityState === 'visible') loadLiveTrips(); }, 10000);
});
