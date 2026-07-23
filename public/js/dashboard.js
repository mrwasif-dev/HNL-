// ============================================================
// STATE
// ============================================================
let statusInterval = null;
let botStartTime = null;
let currentUser = null;

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    setTimeout(() => t.classList.add('show'), 10);
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 3500);
}

function formatTime(s) {
    if (s < 0) s = 0;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
}

async function api(path, opts = {}) {
    const res = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...opts
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.status = res.status;
        throw err;
    }
    return data;
}

// ============================================================
// BOOTSTRAP — decide auth vs signup vs dashboard
// ============================================================
let authMode = 'login';

async function bootstrap() {
    try {
        const me = await api('/api/auth/me');
        currentUser = me;
        showDashboard();
        return;
    } catch (e) {
        // not logged in, fall through
    }

    try {
        const st = await api('/api/auth/status');
        authMode = st.setupDone ? 'login' : 'signup';
    } catch (e) {
        authMode = 'login';
    }
    renderAuthMode();
}

function renderAuthMode() {
    const subtitle = document.getElementById('authSubtitle');
    const label = document.getElementById('authSubmitLabel');
    const toggle = document.getElementById('authToggle');

    if (authMode === 'signup') {
        subtitle.textContent = 'Create your admin account to get started';
        label.textContent = 'Create Account';
        toggle.innerHTML = 'Already set up? <a onclick="switchAuthMode(\'login\')">Log in</a>';
    } else {
        subtitle.textContent = 'Log in to your dashboard';
        label.textContent = 'Login';
        toggle.innerHTML = '';
    }
}

function switchAuthMode(mode) {
    authMode = mode;
    document.getElementById('authError').style.display = 'none';
    renderAuthMode();
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('authSubmitBtn');
    const errBox = document.getElementById('authError');
    errBox.style.display = 'none';

    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
        const data = await api(endpoint, { method: 'POST', body: JSON.stringify({ username, password }) });
        currentUser = { username: data.username };
        showDashboard();
    } catch (err) {
        errBox.textContent = err.message || 'Something went wrong';
        errBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
});

async function dashLogout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
}

// ============================================================
// SHOW DASHBOARD
// ============================================================
function showDashboard() {
    document.getElementById('authWrap').classList.add('hidden');
    document.getElementById('dashWrap').classList.remove('hidden');
    document.getElementById('accountUsername').textContent = currentUser.username || '-';
    startAutoRefresh();
    loadFsrConfig();
    initFsrForm();
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}

// ============================================================
// STATUS POLLING (bot connection / QR / uptime)
// ============================================================
async function fetchStatus() {
    try {
        const data = await api('/api/status');
        if (botStartTime === null && data.botStartTime) botStartTime = data.botStartTime;

        const badge = document.getElementById('statusBadge');
        let badgeText, badgeClass;
        if (data.connected) { badgeText = 'Online'; badgeClass = ''; }
        else if (data.qr) { badgeText = 'Scan'; badgeClass = 'scan'; }
        else { badgeText = 'Offline'; badgeClass = 'offline'; }
        badge.innerHTML = '<i class="pulse-dot"></i>' + badgeText;
        badge.className = 'status-badge' + (badgeClass ? ' ' + badgeClass : '');

        const botStatus = document.getElementById('botStatus');
        if (data.connected) { botStatus.textContent = '● Connected'; botStatus.className = 'value green'; }
        else if (data.qr) { botStatus.textContent = '◉ Waiting QR'; botStatus.className = 'value blue'; }
        else { botStatus.textContent = '● Disconnected'; botStatus.className = 'value red'; }

        const dbStatus = document.getElementById('dbStatus');
        if (data.dbConnected) { dbStatus.textContent = '● Active'; dbStatus.className = 'value green'; }
        else if (data.dbConfigured) { dbStatus.textContent = '◉ Connecting'; dbStatus.className = 'value blue'; }
        else { dbStatus.textContent = '○ Disabled'; dbStatus.className = 'value gray'; }

        document.getElementById('uptimeDisplay').textContent = formatTime(data.uptimeSeconds ?? 0);
        document.getElementById('sessionDisplay').textContent = data.sessionId || '-';

        const qrSection = document.getElementById('qrSection');
        const img = document.getElementById('qrImage');
        const ph = document.getElementById('qrPlaceholder');
        const qrStatus = document.getElementById('qrStatus');
        const hint = document.getElementById('qrHint');

        if (data.connected) {
            qrSection.classList.add('collapsed');
        } else {
            qrSection.classList.remove('collapsed');
            if (data.qr) {
                img.src = data.qr; img.style.display = 'block'; ph.style.display = 'none';
                qrStatus.textContent = '📱 Scan QR Code'; qrStatus.className = 'qr-status ready';
                hint.innerHTML = '<i class="fas fa-phone"></i> WhatsApp → <span class="highlight">Linked Devices</span> → Link a Device';
            } else {
                img.style.display = 'none'; ph.style.display = 'flex';
                qrStatus.textContent = '⏳ Generating QR...'; qrStatus.className = 'qr-status waiting';
                hint.innerHTML = '<i class="fas fa-clock"></i> Please wait...';
            }
        }
        document.getElementById('restartBtn').disabled = false;
        return data;
    } catch (e) {
        if (e.status === 401) { location.reload(); return; }
        console.error(e);
        showToast('Failed to fetch status', 'error');
    }
}

function refreshStatus() {
    fetchStatus().finally(() => showToast('Status updated', 'info'));
}

async function restartBot() {
    const btn = document.getElementById('restartBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Restarting...';
    btn.disabled = true;
    try {
        await api('/api/restart', { method: 'POST' });
        showToast('⚡ Bot restarting...', 'warning');
        setTimeout(() => { fetchStatus(); showToast('✅ Restarted', 'success'); }, 5000);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        btn.innerHTML = orig; btn.disabled = false;
    }
}

async function logoutWA() {
    if (!confirm('This disconnects the bot from WhatsApp. Continue?')) return;
    try {
        await api('/api/logout', { method: 'POST' });
        showToast('👋 WhatsApp disconnected', 'success');
        setTimeout(fetchStatus, 1500);
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    }
}

function startAutoRefresh() {
    if (statusInterval) clearInterval(statusInterval);
    fetchStatus();
    statusInterval = setInterval(fetchStatus, 10000);
}

// ============================================================
// FSR GROUP CONFIG (Account tab)
// ============================================================
async function loadFsrConfig() {
    try {
        const data = await api('/api/fsr/config');
        document.getElementById('fsrGroupJid').value = (data.config && data.config.groupJid) || '';
    } catch (e) { console.error(e); }
}

async function saveFsrConfig() {
    const btn = document.getElementById('saveFsrConfigBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    btn.disabled = true;
    try {
        await api('/api/fsr/config', {
            method: 'POST',
            body: JSON.stringify({ groupJid: document.getElementById('fsrGroupJid').value.trim() })
        });
        showToast('✅ FSR group saved', 'success');
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        btn.innerHTML = orig; btn.disabled = false;
    }
}

// ============================================================
// FSR FORM
// ============================================================
function initFsrForm() {
    if (window._fsrFormInited) return;
    window._fsrFormInited = true;

    // Default date = today
    const dateEl = document.getElementById('fsrDate');
    if (dateEl && !dateEl.value) {
        const now = new Date();
        dateEl.value = now.toISOString().slice(0, 10);
    }

    // Region manual toggle
    const regionSelect = document.getElementById('fsrRegion');
    regionSelect.addEventListener('change', () => {
        document.getElementById('fsrRegionManualWrap').classList.toggle('hidden', regionSelect.value !== 'manual');
    });

    // Site ID — auto-uppercase, alphanumeric only, max 6 chars, first char forced to a letter
    const siteIdEl = document.getElementById('fsrSiteId');
    siteIdEl.addEventListener('input', () => {
        let v = siteIdEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 0 && !/[A-Z]/.test(v[0])) {
            v = v.slice(1); // drop a leading digit — site ID must start with a letter
        }
        siteIdEl.value = v.slice(0, 6);
    });

    // Simple select-pill groups (Oil Filter / Fuel Filter / Air Filter)
    document.querySelectorAll('.pill-group[data-select-group]').forEach(group => {
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill');
            if (!btn) return;
            group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Engine Oil group (special — has a manual numeric entry option)
    const engineOilGroup = document.getElementById('engineOilGroup');
    const engineOilManualWrap = document.getElementById('engineOilManualWrap');
    const engineOilManual = document.getElementById('engineOilManual');
    engineOilGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        engineOilGroup.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        engineOilManualWrap.classList.toggle('hidden', btn.dataset.value !== 'manual');
        if (btn.dataset.value === 'manual') engineOilManual.focus();
    });
    engineOilManual.addEventListener('input', () => {
        engineOilManual.value = engineOilManual.value.replace(/[^0-9]/g, '');
    });

    // Numeric-only fields
    ['fsrCoolant', 'fsrSilicon', 'fsrCottonWaste', 'fsrPvcTape', 'fsrCableTie'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', () => { el.value = el.value.replace(/[^0-9.]/g, ''); });
    });
}

function addItemRow(listId, name = '', qty = '') {
    const list = document.getElementById(listId);
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
        <input type="text" class="item-name" placeholder="Item name" value="${String(name).replace(/"/g, '&quot;')}">
        <input type="text" class="item-qty" inputmode="numeric" placeholder="Qty" value="${String(qty).replace(/"/g, '&quot;')}">
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(row);
}

function collectItems(listId) {
    return Array.from(document.querySelectorAll('#' + listId + ' .item-row')).map(row => ({
        name: row.querySelector('.item-name').value.trim(),
        qty: row.querySelector('.item-qty').value.trim() || '1'
    })).filter(i => i.name);
}

function getSelectedPillValue(container) {
    const active = container.querySelector('.pill.active');
    return active ? active.dataset.value : 'none';
}

function getEngineOilValue() {
    const active = document.querySelector('#engineOilGroup .pill.active');
    if (!active) return '';
    if (active.dataset.value === 'manual') return document.getElementById('engineOilManual').value.trim();
    return active.dataset.value;
}

function getRegionValue() {
    const select = document.getElementById('fsrRegion');
    if (select.value === 'manual') return document.getElementById('fsrRegionManual').value.trim();
    return select.value;
}

async function submitFsr() {
    const name = document.getElementById('fsrName').value.trim();
    const region = getRegionValue();
    const siteId = document.getElementById('fsrSiteId').value.trim().toUpperCase();
    const date = document.getElementById('fsrDate').value;

    if (!name) return showToast('❌ Please enter the engineer name', 'error');
    if (!region) return showToast('❌ Please select or enter a region', 'error');
    if (!/^[A-Z][A-Z0-9]{5}$/.test(siteId)) return showToast('❌ Site ID must be 6 characters, starting with a letter', 'error');
    if (!date) return showToast('❌ Please pick a date', 'error');

    const payload = {
        name,
        region,
        siteId,
        date,
        engineOil: getEngineOilValue(),
        oilFilter: getSelectedPillValue(document.querySelector('[data-select-group="oilFilter"]')),
        fuelFilter: getSelectedPillValue(document.querySelector('[data-select-group="fuelFilter"]')),
        airFilter: getSelectedPillValue(document.querySelector('[data-select-group="airFilter"]')),
        coolant: document.getElementById('fsrCoolant').value.trim(),
        silicon: document.getElementById('fsrSilicon').value.trim(),
        cottonWaste: document.getElementById('fsrCottonWaste').value.trim(),
        pvcTape: document.getElementById('fsrPvcTape').value.trim(),
        cableTie: document.getElementById('fsrCableTie').value.trim(),
        manualItems: collectItems('manualItemsList'),
        serviceItems: collectItems('serviceItemsList')
    };

    const btn = document.getElementById('fsrSubmitBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Submitting...';
    btn.disabled = true;

    try {
        await api('/api/fsr/submit', { method: 'POST', body: JSON.stringify(payload) });
        showToast('✅ FSR submitted to WhatsApp group', 'success');
        resetFsrFormAfterSubmit();
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        btn.innerHTML = orig; btn.disabled = false;
    }
}

function resetFsrFormAfterSubmit() {
    // Keep Name and Region (same engineer/region usually does several sites
    // back to back) — clear everything specific to this site visit.
    document.getElementById('fsrSiteId').value = '';

    document.querySelectorAll('#engineOilGroup .pill').forEach(p => p.classList.remove('active'));
    document.getElementById('engineOilManualWrap').classList.add('hidden');
    document.getElementById('engineOilManual').value = '';

    document.querySelectorAll('.pill-group[data-select-group] .pill').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.pill-group[data-select-group]').forEach(group => {
        group.querySelector('.pill[data-value="none"]').classList.add('active');
    });

    ['fsrCoolant', 'fsrSilicon', 'fsrCottonWaste', 'fsrPvcTape', 'fsrCableTie'].forEach(id => {
        document.getElementById(id).value = '';
    });

    document.getElementById('manualItemsList').innerHTML = '';
    document.getElementById('serviceItemsList').innerHTML = '';

    document.getElementById('fsrSiteId').focus();
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !document.getElementById('dashWrap').classList.contains('hidden')) {
        fetchStatus();
    }
});

bootstrap();
