(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const token = () => localStorage.getItem('ll_admin_token');

  async function fetchAnalytics() {
    const response = await fetch('/api/admin/analytics', {
      headers: { Authorization: 'Bearer ' + (token() || '') }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Analytics request failed');
    return data.data || data;
  }

  function rows(items) {
    if (!Array.isArray(items) || !items.length) return '<p class="muted">No data.</p>';
    return '<div class="analytics-list">' + items.map((item) => {
      const label = item.status || item.role || item.verification || 'Unknown';
      const count = item._count?._all ?? 0;
      return '<div class="analytics-row"><span>' + esc(label.replaceAll('_',' ')) + '</span><b>' + count + '</b></div>';
    }).join('') + '</div>';
  }

  function render(data) {
    const k = data.kpis || {};
    const cards = [
      ['Users', k.totalUsers], ['Customers', k.totalCustomers], ['Drivers', k.totalDrivers],
      ['Verified Drivers', k.verifiedDrivers], ['Available Vehicles', k.activeVehicles],
      ['Loads (30d)', k.loads30], ['Bookings (30d)', k.bookings30], ['Trips (30d)', k.trips30],
      ['Paid Revenue (30d)', 'Rs. ' + Number(k.paidRevenue || 0).toLocaleString()],
      ['Avg Agreed Fare', 'Rs. ' + Number(k.averageAgreedFare || 0).toLocaleString()],
      ['Trip Completion', (k.tripCompletionRate || 0) + '%'], ['Load Delivery', (k.loadDeliveryRate || 0) + '%'],
      ['Disputes (30d)', k.disputes30], ['Paid Payments (30d)', k.paid30],
    ];
    $('#analyticsKpis').innerHTML = cards.map(([label,value]) =>
      '<div class="analytics-kpi"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>'
    ).join('');
    const d = data.last7Days || {};
    $('#analytics7').innerHTML = [
      ['New Users',d.newUsers],['New Loads',d.newLoads],['New Bookings',d.newBookings]
    ].map(([label,value]) => '<div class="analytics-row"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>').join('');
    const b = data.breakdowns || {};
    $('#analyticsLoads').innerHTML = rows(b.loadStatus);
    $('#analyticsBookings').innerHTML = rows(b.bookingStatus);
    $('#analyticsTrips').innerHTML = rows(b.tripStatus);
    $('#analyticsPayments').innerHTML = rows(b.paymentStatus);
    $('#analyticsDrivers').innerHTML = rows(b.driverVerification);
  }

  async function load() {
    try {
      const data = await fetchAnalytics();
      render(data);
    } catch (e) {
      if (window.toast) window.toast(e.message);
      else alert(e.message);
    }
  }

  function openAnalytics() {
    document.querySelectorAll('.section').forEach((section) => { section.hidden = true; });
    const section = $('#analyticsSection');
    if (section) section.hidden = false;
    const title = $('#pageTitle');
    if (title) title.textContent = 'Admin Analytics';
    load();
  }

  function installNav() {
    const nav = $('#sideNav');
    if (!nav || nav.querySelector('[data-analytics-nav]')) return;
    const buttons = [...nav.querySelectorAll('button')];
    if (!buttons.length) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '📊 Analytics';
    button.dataset.analyticsNav = '1';
    button.addEventListener('click', openAnalytics);
    nav.appendChild(button);
  }

  const style = document.createElement('style');
  style.textContent = '.analytics-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}.analytics-kpi,.analytics-card{background:#f7fafc;border:1px solid #e7edf2;border-radius:12px;padding:14px}.analytics-kpi span{display:block;color:#6b7c8f;font-size:12px}.analytics-kpi b{display:block;font-size:22px;margin-top:5px}.analytics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:15px}.analytics-card h3{margin-top:0}.analytics-list{display:grid;gap:7px}.analytics-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #e7edf2}.analytics-row:last-child{border-bottom:0}';
  document.head.appendChild(style);

  const observer = new MutationObserver(installNav);
  observer.observe(document.body, { childList: true, subtree: true });
  installNav();
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#analyticsRefresh')) load();
  });
})();
