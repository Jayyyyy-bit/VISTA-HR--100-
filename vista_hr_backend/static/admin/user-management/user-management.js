document.addEventListener("DOMContentLoaded", async () => {
    const LOGIN_URL = "/auth/login.html";
    const API_BASE = "http://127.0.0.1:5000/api";

    // ── Auth guard ──────────────────────────────────────────
    let me = null;
    try {
        if (window.AuthGuard?.fetchMe) {
            const res = await window.AuthGuard.fetchMe();
            if (res?.ok) me = res.data?.user || null;
        }
        if (!me) {
            const raw = await fetch(`${API_BASE}/auth/me`, { credentials: "include" })
                .then(r => r.json()).catch(() => null);
            me = raw?.user || raw?.data?.user || null;
        }
    } catch { me = null; }

    if (!me) { window.location.replace(LOGIN_URL); return; }
    if (String(me.role || "").toUpperCase() !== "ADMIN") {
        alert("Admin access only.");
        window.location.replace(LOGIN_URL);
        return;
    }

    // Set avatar initials
    const initials = ((me.first_name || me.name || "A")[0] || "A").toUpperCase();
    const avatarEl = document.getElementById("adminAvatar");
    if (avatarEl) avatarEl.textContent = initials;

    // ── Shared fetch helper ─────────────────────────────────
    async function apiFetch(path, options = {}) {
        const res = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
            ...options,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || data?.error || "Request failed");
        return data;
    }

    // ── Navigation ──────────────────────────────────────────
    const views = {
        overview: document.getElementById("viewOverview"),
        users: document.getElementById("viewUsers"),
        kyc: document.getElementById("viewKyc"),
        student: document.getElementById("viewStudent"),
        listings: document.getElementById("viewListings"),
        analytics: document.getElementById("viewAnalytics"),
    };

    const pageTitles = {
        overview: ["Overview", "Platform health at a glance"],
        analytics: ["Analytics", "Platform performance and trends"],
        users: ["User Management", "Manage accounts, roles, and access"],
        kyc: ["Owner KYC", "Review property owner ID verifications"],
        student: ["Student Verification", "Review resident student ID submissions"],
        listings: ["Listings Management", "View, filter, and moderate all listings"],
    };

    let currentView = "overview";

    function switchView(name) {
        if (!views[name]) return;
        if (name === "analytics") loadAnalytics();
        currentView = name;

        Object.entries(views).forEach(([key, el]) => {
            el.hidden = (key !== name);
            el.classList.toggle("active", key === name);
        });

        document.querySelectorAll(".sidenav-item").forEach(a => {
            a.classList.toggle("active", a.dataset.view === name);
        });

        const [title, sub] = pageTitles[name] || ["Admin", ""];
        document.getElementById("pageTitle").textContent = title;
        document.getElementById("pageSub").textContent = sub;

        if (name === "kyc") loadKyc();
        if (name === "student") loadStudent();
        if (name === "users") loadUsers();
        if (name === "listings") loadListings();
    }

    document.querySelectorAll(".sidenav-item").forEach(a => {
        a.addEventListener("click", e => {
            e.preventDefault();
            switchView(a.dataset.view);
        });
    });

    document.querySelectorAll(".text-btn[data-goto]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.goto));
    });

    // ── Role/status helpers ─────────────────────────────────
    function mapRoleToBackend(role) {
        if (role === "Admin") return "ADMIN";
        if (role === "Property Owner") return "OWNER";
        return "RESIDENT";
    }

    function mapRoleFromBackend(role) {
        if (role === "ADMIN") return "Admin";
        if (role === "OWNER") return "Property Owner";
        return "Resident";
    }

    function apiStatusToUi(user) {
        if (user.is_suspended) return "Suspended";
        if (!user.is_verified) return "Pending";
        return "Active";
    }

    function roleBadgeClass(role) {
        if (role === "Admin") return "role-admin";
        if (role === "Property Owner") return "role-owner";
        return "role-resident";
    }

    function avatarClass(role) {
        if (role === "Property Owner") return "owner";
        if (role === "Admin") return "admin";
        return "resident";
    }

    function getInitials(name) {
        const parts = (name || "").trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return (parts[0] || "?")[0].toUpperCase();
    }

    function escHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ══════════════════════════════════════════════════════════
    // OVERVIEW
    // ══════════════════════════════════════════════════════════
    let cachedUsers = [];

    async function loadOverview() {
        try {
            const [userData, kycData, studentData] = await Promise.all([
                apiFetch("/users"),
                apiFetch("/admin/kyc?status=PENDING"),
                apiFetch("/admin/student?status=PENDING"),
            ]);

            cachedUsers = (userData.users || []).map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: mapRoleFromBackend(u.role),
                status: apiStatusToUi(u),
                is_verified: !!u.is_verified,
                is_suspended: !!u.is_suspended,
                created_at: u.created_at,
            }));

            const total = cachedUsers.length;
            const admins = cachedUsers.filter(u => u.role === "Admin").length;
            const owners = cachedUsers.filter(u => u.role === "Property Owner").length;
            const residents = cachedUsers.filter(u => u.role === "Resident").length;
            const suspended = cachedUsers.filter(u => u.status === "Suspended").length;
            const kycItems = kycData.kyc_applications || [];
            const stuItems = studentData.student_applications || [];

            // Stats
            document.getElementById("ovTotalUsers").textContent = total;
            document.getElementById("ovPendingKyc").textContent = kycItems.length;
            document.getElementById("ovPendingStudent").textContent = stuItems.length;
            document.getElementById("ovSuspended").textContent = suspended;

            // Highlight alert cards if counts > 0
            document.getElementById("kycStatCard").classList.toggle("has-alert", kycItems.length > 0);
            document.getElementById("studentStatCard").classList.toggle("has-alert", stuItems.length > 0);

            // Breakdown bars
            document.getElementById("bkAdmins").textContent = admins;
            document.getElementById("bkOwners").textContent = owners;
            document.getElementById("bkResidents").textContent = residents;
            const max = Math.max(total, 1);
            setTimeout(() => {
                document.getElementById("bkAdminsBar").style.width = Math.round(admins / max * 100) + "%";
                document.getElementById("bkOwnersBar").style.width = Math.round(owners / max * 100) + "%";
                document.getElementById("bkResidentsBar").style.width = Math.round(residents / max * 100) + "%";
            }, 80);

            // KYC queue (show max 5)
            renderKycQueue(kycItems.slice(0, 5));

            // Recent users (last 5 by created_at)
            const recent = [...cachedUsers]
                .filter(u => u.created_at)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5);
            renderRecentUsers(recent);

            // Update nav badges
            const kycBadge = document.getElementById("kycBadge");
            const studentBadge = document.getElementById("studentBadge");
            if (kycBadge) { kycBadge.textContent = kycItems.length; kycBadge.hidden = kycItems.length === 0; }
            if (studentBadge) { studentBadge.textContent = stuItems.length; studentBadge.hidden = stuItems.length === 0; }

        } catch (err) {
            console.error("Overview load error:", err);
        }
    }

    function renderKycQueue(items) {
        const el = document.getElementById("ovKycQueue");
        if (!items.length) {
            el.innerHTML = `<div class="queue-empty">No pending KYC applications. All clear!</div>`;
            return;
        }
        el.innerHTML = items.map(u => {
            const submitted = u.kyc_submitted_at
                ? new Date(u.kyc_submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                : "—";
            return `
            <div class="queue-item">
                <div class="q-avatar owner">${getInitials(u.name)}</div>
                <div class="q-info">
                    <div class="q-name">${escHtml(u.name)}</div>
                    <div class="q-meta">Property Owner · Submitted ${submitted}</div>
                </div>
                <div class="q-btns">
                    <button class="q-btn approve" data-ov-kyc-approve="${u.id}">Approve</button>
                    <button class="q-btn reject"  data-ov-kyc-reject="${u.id}">Reject</button>
                </div>
            </div>`;
        }).join("");

        el.querySelectorAll("[data-ov-kyc-approve]").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Approve this KYC application?")) return;
                try {
                    await apiFetch(`/admin/kyc/${btn.dataset.ovKycApprove}/approve`, { method: "POST" });
                    await loadOverview();
                } catch (err) { alert(err.message); }
            });
        });

        el.querySelectorAll("[data-ov-kyc-reject]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const reason = prompt("Enter rejection reason (shown to the user):");
                if (reason === null) return;
                try {
                    await apiFetch(`/admin/kyc/${btn.dataset.ovKycReject}/reject`, {
                        method: "POST",
                        body: JSON.stringify({ reason: reason.trim() || "Documents were unclear." }),
                    });
                    await loadOverview();
                } catch (err) { alert(err.message); }
            });
        });
    }

    function renderRecentUsers(users) {
        const el = document.getElementById("ovRecentUsers");
        if (!users.length) {
            el.innerHTML = `<div class="queue-empty">No registered users yet.</div>`;
            return;
        }
        el.innerHTML = users.map(u => {
            const statusCls = u.status === "Active" ? "active" : u.status === "Suspended" ? "suspended" : "pending";
            return `
            <div class="queue-item">
                <div class="q-avatar ${avatarClass(u.role)}">${getInitials(u.name)}</div>
                <div class="q-info">
                    <div class="q-name">${escHtml(u.name)}</div>
                    <div class="q-meta">${escHtml(u.role)} · ${escHtml(u.email)}</div>
                </div>
                <span class="badge ${statusCls}">${escHtml(u.status)}</span>
            </div>`;
        }).join("");
    }

    // ══════════════════════════════════════════════════════════
    // USERS VIEW
    // ══════════════════════════════════════════════════════════
    let users = [];
    let editingId = null;

    const tableBody = document.getElementById("userTableBody");
    const searchInput = document.getElementById("searchInput");
    const roleFilter = document.getElementById("roleFilter");
    const statusFilter = document.getElementById("statusFilter");
    const addUserBtn = document.getElementById("addUserBtn");
    const modalOverlay = document.getElementById("modalOverlay");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const saveUserBtn = document.getElementById("saveUserBtn");
    const modalTitle = document.getElementById("modalTitle");
    const nameInput = document.getElementById("nameInput");
    const emailInput = document.getElementById("emailInput");
    const passwordInput = document.getElementById("passwordInput");
    const passwordHint = document.getElementById("passwordHint");
    const roleInput = document.getElementById("roleInput");
    const statusInput = document.getElementById("statusInput");

    function renderStats() {
        document.getElementById("totalUsers").textContent = users.length;
        document.getElementById("totalOwners").textContent = users.filter(u => u.role === "Property Owner").length;
        document.getElementById("totalResidents").textContent = users.filter(u => u.role === "Resident").length;
    }

    function renderUsers() {
        const keyword = (searchInput?.value || "").trim().toLowerCase();
        const roleValue = roleFilter?.value || "all";
        const statusValue = statusFilter?.value || "all";

        const filtered = users.filter(u => {
            const matchKeyword = !keyword ||
                u.name.toLowerCase().includes(keyword) ||
                u.email.toLowerCase().includes(keyword) ||
                u.role.toLowerCase().includes(keyword);
            const matchRole = roleValue === "all" || u.role === roleValue;
            const matchStatus = statusValue === "all" || u.status === statusValue;
            return matchKeyword && matchRole && matchStatus;
        });

        if (!tableBody) return;
        tableBody.innerHTML = filtered.length
            ? filtered.map(u => `
            <tr>
                <td>
                    <div style="font-weight:600">${escHtml(u.name)}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px">${escHtml(u.email)}</div>
                </td>
                <td><span class="badge ${roleBadgeClass(u.role)}">${escHtml(u.role)}</span></td>
                <td>
                    <span class="badge ${u.status === 'Active' ? 'active' : u.status === 'Suspended' ? 'suspended' : 'pending'}">
                        ${escHtml(u.status)}
                    </span>
                    ${u.is_suspended && u.suspended_until ? `<div style="font-size:10px;color:var(--muted);margin-top:3px">Until ${new Date((u.suspended_until.includes('+') || u.suspended_until.endsWith('Z') ? u.suspended_until : u.suspended_until + 'Z')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}</div>` : ''}
                </td>
                <td>
                    <div class="strike-row">
                        ${[1, 2, 3].map(i => `<span class="strike-pip${u.strike_count >= i ? ' filled' : ''}" title="Strike ${i}"></span>`).join('')}
                        <span style="font-size:11px;color:var(--muted);margin-left:4px">${u.strike_count}/3</span>
                    </div>
                </td>
                <td>
                    <div class="action-row">
                        <button class="action-btn" data-action="edit" data-id="${u.id}">Edit</button>
                        ${u.is_suspended
                    ? `<button class="action-btn active" data-action="uplift" data-id="${u.id}">Uplift</button>`
                    : `<button class="action-btn warn" data-action="suspend" data-id="${u.id}">Suspend</button>`}
                        ${u.strike_count > 0 ? `<button class="action-btn ghost" data-action="reset-strikes" data-id="${u.id}" title="Reset strikes">↺</button>` : ''}
                        <button class="action-btn danger" data-action="delete" data-id="${u.id}">Delete</button>
                    </div>
                </td>
            </tr>`).join("")
            : `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">No users found.</td></tr>`;

        renderStats();
    }

    async function loadUsers() {
        try {
            const data = await apiFetch("/users");
            users = (data.users || []).map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: mapRoleFromBackend(u.role),
                status: apiStatusToUi(u),
                is_verified: !!u.is_verified,
                is_suspended: !!u.is_suspended,
                suspended_until: u.suspended_until || null,
                suspension_reason: u.suspension_reason || "",
                strike_count: u.strike_count || 0,
                kyc_status: u.kyc_status || "NONE",
                email_verified: !!u.email_verified,
                created_at: u.created_at,
            }));
            renderUsers();
        } catch (err) {
            console.error("loadUsers error:", err);
        }
    }

    tableBody?.addEventListener("click", async e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        const user = users.find(u => u.id === id);
        if (!user) return;

        if (action === "edit") { openModal("edit", user); return; }

        if (action === "suspend") {
            // Show suspension modal with strike/reason/date options
            showStrikeModal(user);
            return;
        }

        if (action === "uplift") {
            if (!confirm(`Lift suspension for ${user.name}?`)) return;
            try {
                await apiFetch(`/users/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ is_suspended: false }),
                });
                await loadUsers();
            } catch (err) { alert(err?.error || err.message); }
            return;
        }

        if (action === "reset-strikes") {
            if (!confirm(`Reset strike count for ${user.name} to 0?`)) return;
            try {
                await apiFetch(`/admin/users/${id}/reset-strikes`, { method: "POST" });
                await loadUsers();
            } catch (err) { alert(err?.error || err.message); }
            return;
        }

        if (action === "delete") {
            if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
            try {
                await apiFetch(`/users/${id}`, { method: "DELETE" });
                await loadUsers();
            } catch (err) { alert(err.message); }
        }
    });

    // ── Modal ────────────────────────────────────────────────
    function openModal(mode = "add", user = null) {
        modalOverlay.classList.add("open");
        if (mode === "edit" && user) {
            editingId = user.id;
            modalTitle.textContent = "Edit user";
            nameInput.value = user.name;
            emailInput.value = user.email;
            passwordInput.value = "";
            roleInput.value = user.role;
            statusInput.value = user.status;
            if (passwordHint) passwordHint.textContent = "leave blank to keep current";
        } else {
            editingId = null;
            modalTitle.textContent = "Add user";
            nameInput.value = "";
            emailInput.value = "";
            passwordInput.value = "";
            roleInput.value = "Resident";
            statusInput.value = "Active";
            if (passwordHint) passwordHint.textContent = "required";
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeModal() { modalOverlay.classList.remove("open"); }

    saveUserBtn?.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const role = roleInput.value;
        const status = statusInput.value;

        if (!name || !email) { alert("Name and email are required."); return; }
        if (!editingId && !password) { alert("Password is required for new users."); return; }
        if (!editingId && password.length < 8) { alert("Password must be at least 8 characters."); return; }

        const payload = {
            name,
            email,
            role: mapRoleToBackend(role),
            is_verified: status !== "Pending",
            is_suspended: status === "Suspended",
        };
        if (!editingId || password) payload.password = password;

        try {
            if (editingId !== null) {
                await apiFetch(`/users/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
            } else {
                await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) });
            }
            closeModal();
            await loadUsers();
        } catch (err) { alert(err.message); }
    });

    addUserBtn?.addEventListener("click", () => openModal("add"));
    closeModalBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    modalOverlay?.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
    searchInput?.addEventListener("input", renderUsers);
    roleFilter?.addEventListener("change", renderUsers);
    statusFilter?.addEventListener("change", renderUsers);

    // ══════════════════════════════════════════════════════════
    // KYC VIEW
    // ══════════════════════════════════════════════════════════
    let kycStatusFilter = "PENDING";

    document.querySelectorAll("#kycFilterBar .filter-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#kycFilterBar .filter-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            kycStatusFilter = btn.dataset.status;
            loadKyc();
        });
    });

    // ── Analytics ────────────────────────────────────────────
    const _charts = {};
    let _extraLoaded = false;
    let _showingCharts = false;
    let _analyticsData = null;

    function _destroyChart(key) {
        if (_charts[key]) { try { _charts[key].destroy(); } catch { } delete _charts[key]; }
    }

    // Shared tooltip config — used by renderAnalytics AND renderExtraCharts
    const tooltipPlugin = {
        backgroundColor: "#111827", titleColor: "#f9fafb", bodyColor: "#d1d5db",
        borderColor: "#374151", borderWidth: 1,
        padding: { top: 8, bottom: 8, left: 12, right: 12 },
        cornerRadius: 8,
        titleFont: { size: 12, weight: "600" }, bodyFont: { size: 12 },
        displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4, usePointStyle: true,
    };

    async function loadAnalytics() {
        // Reset toggle state each time we enter the view
        _showingCharts = false;
        _extraLoaded = false;
        _analyticsData = null;
        _showRecent();

        // Reset toggle button label
        const btn = document.getElementById('anToggleBtn');
        if (btn) {
            btn.innerHTML = '<i data-lucide="bar-chart-3"></i> Show more charts';
            if (window.lucide?.createIcons) lucide.createIcons();
        }
        document.getElementById('anSectionLabel').textContent = 'Recent bookings';

        try {
            _analyticsData = await apiFetch('/admin/analytics');
            // requestAnimationFrame ensures the section is visible before
            // Chart.js tries to measure canvas — fixes 0x0 render on hidden canvas
            requestAnimationFrame(() => renderAnalytics(_analyticsData));
        } catch (err) {
            console.error('Analytics load failed:', err);
        }

        // Bind toggle button — use a flag to avoid duplicate listeners
        const toggleBtn = document.getElementById('anToggleBtn');
        if (toggleBtn && !toggleBtn.dataset.bound) {
            toggleBtn.dataset.bound = '1';
            toggleBtn.addEventListener('click', toggleAnalyticsView);
        }
    }

    function toggleAnalyticsView() {
        _showingCharts = !_showingCharts;
        const btn = document.getElementById('anToggleBtn');
        const label = document.getElementById('anSectionLabel');

        if (_showingCharts) {
            _showExtra();
            if (btn) btn.innerHTML = '<i data-lucide="calendar-check-2"></i> Show recent bookings';
            if (label) label.textContent = 'Detailed breakdown';
            if (!_extraLoaded && _analyticsData) {
                renderExtraCharts(_analyticsData);
                _extraLoaded = true;
            }
        } else {
            _showRecent();
            if (btn) btn.innerHTML = '<i data-lucide="bar-chart-3"></i> Show more charts';
            if (label) label.textContent = 'Recent bookings';
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _showRecent() {
        const r = document.getElementById('anRecentSection');
        const e = document.getElementById('anExtraSection');
        if (e) e.hidden = true;
        if (r) {
            r.hidden = false;
            // re-trigger animation
            r.classList.remove('an-panel-swap');
            void r.offsetWidth;
            r.classList.add('an-panel-swap');
        }
    }

    function _showExtra() {
        const r = document.getElementById('anRecentSection');
        const e = document.getElementById('anExtraSection');
        if (r) r.hidden = true;
        if (e) {
            e.hidden = false;
            e.classList.remove('an-panel-swap');
            void e.offsetWidth;
            e.classList.add('an-panel-swap');
            // Resize charts after container becomes visible
            setTimeout(() => {
                ['growth', 'listings', 'cities', 'types'].forEach(k => {
                    if (_charts[k]) _charts[k].resize();
                });
            }, 50);
        }
    }

    function renderAnalytics(d) {
        const s = d.summary || {};
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        // Destroy stale charts before re-rendering (prevents "canvas already in use")
        ['bookings', 'verify', 'growth', 'listings', 'cities', 'types'].forEach(k => _destroyChart(k));

        set('anTotalUsers', s.total_users ?? '—');
        set('anUserSub', `${s.total_residents ?? 0} residents · ${s.total_owners ?? 0} owners`);
        set('anPublished', s.published_listings ?? '—');
        set('anListingSub', `of ${s.total_listings ?? '—'} total`);
        set('anTotalBookings', s.total_bookings ?? '—');
        set('anBookingSub', `${s.pending_bookings ?? 0} pending`);

        const navy = '#1B3F6E', amber = '#C8872A', green = '#15803d', teal = '#0d9488',
            red = '#dc2626', gray = '#9ca3af', purple = '#6366f1', muted = '#e5e7eb';

        // Booking funnel
        _destroyChart('bookings');
        const bCtx = document.getElementById('cBookings')?.getContext('2d');
        if (bCtx && d.booking_funnel) {
            _charts.bookings = new Chart(bCtx, {
                type: 'bar',
                data: {
                    labels: d.booking_funnel.labels,
                    datasets: [{
                        data: d.booking_funnel.values,
                        backgroundColor: [amber, green, navy, purple, red, gray],
                        borderRadius: 6, borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }, tooltip: {
                            ...tooltipPlugin, callbacks: {
                                label: (ctx) => ` ${ctx.parsed.y} bookings`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: muted } }
                    }
                }
            });
        }

        // Verification pipeline
        _destroyChart('verify');
        const vCtx = document.getElementById('cVerify')?.getContext('2d');
        if (vCtx && d.verification) {
            _charts.verify = new Chart(vCtx, {
                type: 'bar',
                data: {
                    labels: d.verification.labels,
                    datasets: [{
                        data: d.verification.values,
                        backgroundColor: [gray, amber, green, red, gray, amber, green, red],
                        borderRadius: 6, borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }, tooltip: {
                            ...tooltipPlugin, callbacks: {
                                label: (ctx) => ` ${ctx.parsed.y} users`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 30 } },
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: muted } }
                    }
                }
            });
        }

        // Recent bookings table
        const tbody = document.getElementById('anRecentBody');
        if (tbody) {
            if (!d.recent_bookings?.length) {
                tbody.innerHTML = `<tr><td colspan="6" class="an-empty">No bookings yet.</td></tr>`;
            } else {
                tbody.innerHTML = d.recent_bookings.map(b => `
                    <tr>
                        <td style="color:#9ca3af">#${b.id}</td>
                        <td>${escHtml(b.listing_title || '—')}</td>
                        <td>${escHtml(b.resident_name || '—')}</td>
                        <td style="color:#9ca3af">${b.move_in_date ? new Date(b.move_in_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                        <td><span class="an-pill ${b.status}">${b.status}</span></td>
                        <td style="color:#9ca3af">${b.created_at ? new Date(b.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    </tr>`).join('');
            }
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function renderExtraCharts(d) {
        const navy = '#1B3F6E', amber = '#C8872A', green = '#15803d', teal = '#0d9488',
            gray = '#9ca3af', red = '#dc2626', muted = '#e5e7eb';

        // tooltipPlugin defined at module scope above

        // User growth
        _destroyChart('growth');
        const gCtx = document.getElementById('cGrowth')?.getContext('2d');
        if (gCtx && d.user_growth) {
            _charts.growth = new Chart(gCtx, {
                type: 'line',
                data: {
                    labels: d.user_growth.labels,
                    datasets: [{
                        data: d.user_growth.values,
                        borderColor: navy, backgroundColor: 'rgba(27,63,110,.08)',
                        borderWidth: 2, pointRadius: 2, fill: true, tension: 0.4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { ...tooltipPlugin, callbacks: { label: (ctx) => ` ${ctx.parsed.y} new users` } } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 10 } },
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: muted } }
                    }
                }
            });
        }

        // Listing statuses (doughnut)
        _destroyChart('listings');
        const lCtx = document.getElementById('cListings')?.getContext('2d');
        if (lCtx && d.listing_status) {
            _charts.listings = new Chart(lCtx, {
                type: 'doughnut',
                data: {
                    labels: d.listing_status.labels,
                    datasets: [{
                        data: d.listing_status.values,
                        backgroundColor: [gray, amber, green, '#cbd5e1'],
                        borderWidth: 2, borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    plugins: {
                        legend: {
                            display: true, position: 'bottom',
                            labels: { font: { size: 11 }, padding: 10 }
                        },
                        tooltip: { ...tooltipPlugin, callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} listings` } }
                    }
                }
            });
        }

        // Top cities (horizontal bar)
        _destroyChart('cities');
        const cCtx = document.getElementById('cCities')?.getContext('2d');
        if (cCtx && d.top_cities) {
            if (!d.top_cities.labels.length) {
                cCtx.canvas.closest('.an-chart-wrap').innerHTML = '<div class="an-empty">No city data yet</div>';
            } else {
                _charts.cities = new Chart(cCtx, {
                    type: 'bar',
                    data: {
                        labels: d.top_cities.labels,
                        datasets: [{
                            data: d.top_cities.values,
                            backgroundColor: navy, borderRadius: 4, borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                        plugins: { legend: { display: false }, tooltip: { ...tooltipPlugin, callbacks: { label: (ctx) => ` ${ctx.parsed.x} listings` } } },
                        scales: {
                            x: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: muted } },
                            y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                        }
                    }
                });
            }
        }

        // Listing types (doughnut)
        _destroyChart('types');
        const tCtx = document.getElementById('cTypes')?.getContext('2d');
        if (tCtx && d.listing_types) {
            if (!d.listing_types.labels.length) {
                tCtx.canvas.closest('.an-chart-wrap').innerHTML = '<div class="an-empty">No listings yet</div>';
            } else {
                _charts.types = new Chart(tCtx, {
                    type: 'doughnut',
                    data: {
                        labels: d.listing_types.labels,
                        datasets: [{
                            data: d.listing_types.values,
                            backgroundColor: [navy, amber, green, teal, gray, red],
                            borderWidth: 2, borderColor: '#fff'
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '60%',
                        plugins: {
                            legend: {
                                display: true, position: 'bottom',
                                labels: { font: { size: 11 }, padding: 10 }
                            }
                        }
                    }
                });
            }
        }
    }


    async function loadKyc() {
        const list = document.getElementById("kycList");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/kyc?status=${kycStatusFilter}`);
            const items = data.kyc_applications || [];
            if (!items.length) {
                list.innerHTML = `<div class="verifyEmpty">No ${kycStatusFilter.toLowerCase()} KYC applications.</div>`;
                return;
            }
            list.innerHTML = items.map(u => kycCardHTML(u)).join("");
            bindVerifyActions(list, "kyc");
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function kycCardHTML(u) {
        const statusCls = { PENDING: "pending", APPROVED: "active", REJECTED: "suspended" }[u.kyc_status] || "pending";
        const submitted = u.kyc_submitted_at
            ? new Date(u.kyc_submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
            : "—";
        const isPending = u.kyc_status === "PENDING";
        const rejectNote = u.kyc_reject_reason
            ? `<div class="verifyReason">Reason: ${escHtml(u.kyc_reject_reason)}</div>` : "";
        return `
        <div class="verifyCard" data-id="${u.id}">
            <div class="verifyCardTop">
                <div class="verifyCardInfo">
                    <div class="verifyName">${escHtml(u.name)}</div>
                    <div class="verifyEmail">${escHtml(u.email)}</div>
                    <div class="verifyMeta">Submitted ${submitted}</div>
                    ${rejectNote}
                </div>
                <span class="badge ${statusCls}">${escHtml(u.kyc_status)}</span>
            </div>
            <div class="verifyDocs">
                ${u.kyc_id_front_url ? `<button class="docThumb" type="button" onclick="openLightbox('${u.kyc_id_front_url}','ID Front')"><img src="${u.kyc_id_front_url}" alt="ID Front"/><span>Front <i data-lucide="zoom-in"></i></span></button>` : ""}
                ${u.kyc_id_back_url ? `<button class="docThumb" type="button" onclick="openLightbox('${u.kyc_id_back_url}','ID Back')"><img src="${u.kyc_id_back_url}"  alt="ID Back"/><span>Back <i data-lucide="zoom-in"></i></span></button>` : ""}
                ${u.kyc_selfie_url ? `<button class="docThumb" type="button" onclick="openLightbox('${u.kyc_selfie_url}','Selfie')"><img src="${u.kyc_selfie_url}"   alt="Selfie"/><span>Selfie <i data-lucide="zoom-in"></i></span></button>` : ""}
            </div>
            ${isPending ? `
            <div class="verifyActions">
                <button class="btn verifyApprove" data-action="kyc-approve" data-id="${u.id}">Approve</button>
                <button class="btn ghost verifyReject" data-action="kyc-reject" data-id="${u.id}">Reject</button>
            </div>` : ""}
        </div>`;
    }

    // ══════════════════════════════════════════════════════════
    // STUDENT VIEW
    // ══════════════════════════════════════════════════════════
    let studentStatusFilter = "PENDING";

    document.querySelectorAll("#studentFilterBar .filter-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#studentFilterBar .filter-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            studentStatusFilter = btn.dataset.status;
            loadStudent();
        });
    });

    async function loadStudent() {
        const list = document.getElementById("studentList");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/student?status=${studentStatusFilter}`);
            const items = data.student_applications || [];
            if (!items.length) {
                list.innerHTML = `<div class="verifyEmpty">No ${studentStatusFilter.toLowerCase()} student applications.</div>`;
                return;
            }
            list.innerHTML = items.map(u => studentCardHTML(u)).join("");
            bindVerifyActions(list, "student");
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function studentCardHTML(u) {
        const statusCls = { PENDING: "pending", APPROVED: "active", REJECTED: "suspended" }[u.student_status] || "pending";
        const submitted = u.student_submitted_at
            ? new Date(u.student_submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
            : "—";
        const isPending = u.student_status === "PENDING";
        const rejectNote = u.student_reject_reason
            ? `<div class="verifyReason">Reason: ${escHtml(u.student_reject_reason)}</div>` : "";
        return `
        <div class="verifyCard" data-id="${u.id}">
            <div class="verifyCardTop">
                <div class="verifyCardInfo">
                    <div class="verifyName">${escHtml(u.name)}</div>
                    <div class="verifyEmail">${escHtml(u.email)}</div>
                    <div class="verifyMeta">Submitted ${submitted}</div>
                    ${rejectNote}
                </div>
                <span class="badge ${statusCls}">${escHtml(u.student_status)}</span>
            </div>
            <div class="verifyDocs">
                ${u.student_id_url ? `<button class="docThumb" type="button" onclick="openLightbox('${u.student_id_url}','School ID')"><img src="${u.student_id_url}"  alt="School ID"/><span>School ID <i data-lucide="zoom-in"></i></span></button>` : ""}
                ${u.student_cor_url ? `<button class="docThumb" type="button" onclick="openLightbox('${u.student_cor_url}','CoR')"><img src="${u.student_cor_url}" alt="CoR"/><span>CoR <i data-lucide="zoom-in"></i></span></button>` : ""}
            </div>
            ${isPending ? `
            <div class="verifyActions">
                <button class="btn verifyApprove" data-action="student-approve" data-id="${u.id}">Approve</button>
                <button class="btn ghost verifyReject" data-action="student-reject" data-id="${u.id}">Reject</button>
            </div>` : ""}
        </div>`;
    }

    // ── Shared approve/reject handler ───────────────────────
    function bindVerifyActions(container, type) {
        container.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;

                if (action.endsWith("-approve")) {
                    if (!confirm("Approve this application?")) return;
                    const endpoint = type === "kyc"
                        ? `/admin/kyc/${id}/approve`
                        : `/admin/student/${id}/approve`;
                    try {
                        await apiFetch(endpoint, { method: "POST" });
                        if (type === "kyc") loadKyc(); else loadStudent();
                        refreshBadges();
                    } catch (err) { alert(err.message); }
                }

                if (action.endsWith("-reject")) {
                    const reason = prompt("Enter a reason for rejection (shown to the user):");
                    if (reason === null) return;
                    const endpoint = type === "kyc"
                        ? `/admin/kyc/${id}/reject`
                        : `/admin/student/${id}/reject`;
                    try {
                        await apiFetch(endpoint, {
                            method: "POST",
                            body: JSON.stringify({ reason: reason.trim() || "Documents were unclear." }),
                        });
                        if (type === "kyc") loadKyc(); else loadStudent();
                        refreshBadges();
                    } catch (err) { alert(err.message); }
                }
            });
        });
    }

    // ── Badge refresh ────────────────────────────────────────
    async function refreshBadges() {
        try {
            const [kData, sData] = await Promise.all([
                apiFetch("/admin/kyc?status=PENDING"),
                apiFetch("/admin/student?status=PENDING"),
            ]);
            const kCount = (kData.kyc_applications || []).length;
            const sCount = (sData.student_applications || []).length;
            const kycBadge = document.getElementById("kycBadge");
            const studentBadge = document.getElementById("studentBadge");
            if (kycBadge) { kycBadge.textContent = kCount; kycBadge.hidden = kCount === 0; }
            if (studentBadge) { studentBadge.textContent = sCount; studentBadge.hidden = sCount === 0; }
        } catch { }
    }


    // ── Lightbox (document viewer) ───────────────────────────
    (function () {
        const el = document.createElement("div");
        el.id = "docLightbox";
        el.innerHTML = [
            '<div class="lb-backdrop"></div>',
            '<div class="lb-content">',
            '  <div class="lb-header">',
            '    <span class="lb-label" id="lbLabel"></span>',
            '    <div class="lb-actions">',
            '      <a class="lb-open-btn" id="lbOpenBtn" href="#" target="_blank"><i data-lucide="external-link"></i> Open full size</a>',
            '      <button class="lb-close" id="lbClose" type="button"><i data-lucide="x"></i></button>',
            '    </div>',
            '  </div>',
            '  <div class="lb-img-wrap"><img id="lbImg" src="" alt="Document"/></div>',
            '</div>'
        ].join("");
        document.body.appendChild(el);
        document.getElementById("lbClose").addEventListener("click", closeLightbox);
        el.querySelector(".lb-backdrop").addEventListener("click", closeLightbox);
        document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });




        // ══════════════════════════════════════════════════════════

    })();

    window.openLightbox = function (url, label) {
        document.getElementById("lbImg").src = url;
        document.getElementById("lbLabel").textContent = label;
        document.getElementById("lbOpenBtn").href = url;
        document.getElementById("docLightbox").classList.add("open");
        document.body.style.overflow = "hidden";
        if (window.lucide?.createIcons) lucide.createIcons();
    };

    function closeLightbox() {
        document.getElementById("docLightbox").classList.remove("open");
        document.body.style.overflow = "";
        setTimeout(() => { const img = document.getElementById("lbImg"); if (img) img.src = ""; }, 300);
    }


    // LISTINGS MANAGEMENT VIEW
    // ══════════════════════════════════════════════════════════
    let listingsStatusFilter = "";
    let listingsPage = 1;
    let listingsTotal = 0;
    const LISTINGS_PER_PAGE = 20;
    let listingsSearchTimer = null;

    document.querySelectorAll("#listingsFilterBar .filter-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#listingsFilterBar .filter-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            listingsStatusFilter = btn.dataset.status;
            listingsPage = 1;
            loadListings();
        });
    });

    document.getElementById("listingsSearch")?.addEventListener("input", () => {
        clearTimeout(listingsSearchTimer);
        listingsSearchTimer = setTimeout(() => { listingsPage = 1; loadListings(); }, 320);
    });

    document.getElementById("listingsPrevPage")?.addEventListener("click", () => {
        if (listingsPage > 1) { listingsPage--; loadListings(); }
    });
    document.getElementById("listingsNextPage")?.addEventListener("click", () => {
        const maxPage = Math.ceil(listingsTotal / LISTINGS_PER_PAGE);
        if (listingsPage < maxPage) { listingsPage++; loadListings(); }
    });

    async function loadListings() {
        const list = document.getElementById("listingsList");
        const countEl = document.getElementById("listingsCount");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading listings…</div>`;

        const q = (document.getElementById("listingsSearch")?.value || "").trim();
        const params = new URLSearchParams({ page: listingsPage, per_page: LISTINGS_PER_PAGE });
        if (listingsStatusFilter) params.set("status", listingsStatusFilter);
        if (q) params.set("city", q);

        try {
            const data = await apiFetch(`/admin/listings?${params}`);
            const items = data.listings || [];
            listingsTotal = data.total || 0;

            if (countEl) countEl.textContent = `${listingsTotal} listing${listingsTotal !== 1 ? "s" : ""}`;

            if (!items.length) {
                list.innerHTML = `<div class="verifyEmpty">No listings found.</div>`;
                const pg = document.getElementById("listingsPagination");
                if (pg) pg.hidden = true;
                return;
            }

            list.innerHTML = `<div class="listings-table">
        <div class="lt-head">
            <div class="lt-col lt-photo"></div>
            <div class="lt-col lt-info">Listing</div>
            <div class="lt-col lt-owner">Owner</div>
            <div class="lt-col lt-city">City</div>
            <div class="lt-col lt-price">Rent</div>
            <div class="lt-col lt-status">Status</div>
            <div class="lt-col lt-actions">Actions</div>
        </div>
        ${items.map(l => listingRowHTML(l)).join("")}
    </div>`;

            list.querySelectorAll("[data-listing-action]").forEach(btn => {
                btn.addEventListener("click", () =>
                    handleListingAction(btn.dataset.listingAction, parseInt(btn.dataset.id))
                );
            });

            const maxPage = Math.ceil(listingsTotal / LISTINGS_PER_PAGE);
            const pagLabel = document.getElementById("listingsPageLabel");
            if (pagLabel) pagLabel.textContent = `Page ${listingsPage} of ${maxPage}`;
            const pagEl = document.getElementById("listingsPagination");
            if (pagEl) pagEl.hidden = listingsTotal <= LISTINGS_PER_PAGE;
            const prevBtn = document.getElementById("listingsPrevPage");
            const nextBtn = document.getElementById("listingsNextPage");
            if (prevBtn) prevBtn.disabled = listingsPage <= 1;
            if (nextBtn) nextBtn.disabled = listingsPage >= maxPage;

            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load listings. ${escHtml(err.message)}</div>`;
        }
    }

    function listingRowHTML(l) {
        const STATUS_STYLE = { PUBLISHED: "active", DRAFT: "pending", READY: "warn", ARCHIVED: "suspended" };
        const cls = STATUS_STYLE[l.status] || "pending";
        const cover = l.cover
            ? `<img src="${escHtml(l.cover)}" alt="" class="lt-thumb">`
            : `<div class="lt-thumb-ph"><i data-lucide="home"></i></div>`;
        const price = l.monthly_rent
            ? `₱${Number(l.monthly_rent).toLocaleString()}/mo`
            : `<span style="color:var(--ink-2)">On request</span>`;
        const updated = l.updated_at
            ? new Date(l.updated_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
            : "—";
        const actionBtn = l.status === "PUBLISHED"
            ? `<button class="btn ghost sm" data-listing-action="archive" data-id="${l.id}"><i data-lucide="archive"></i> Archive</button>`
            : l.status === "ARCHIVED"
                ? `<button class="btn sm" data-listing-action="unarchive" data-id="${l.id}"><i data-lucide="rotate-ccw"></i> Restore</button>`
                : "";
        return `<div class="lt-row">
    <div class="lt-col lt-photo">${cover}</div>
    <div class="lt-col lt-info">
        <div class="lt-title">${escHtml(l.title || "Untitled")}</div>
        <div class="lt-sub">${escHtml(l.place_type || "—")} · Updated ${updated}</div>
    </div>
    <div class="lt-col lt-owner">
        <div class="lt-owner-name">${escHtml(l.owner_name || "—")}</div>
        <div class="lt-sub">ID #${l.owner_id}</div>
    </div>
    <div class="lt-col lt-city">${escHtml(l.city || "—")}</div>
    <div class="lt-col lt-price">${price}</div>
    <div class="lt-col lt-status"><span class="badge ${cls}">${escHtml(l.status)}</span></div>
    <div class="lt-col lt-actions">${actionBtn}</div>
    </div>`;
    }

    async function handleListingAction(action, id) {
        const newStatus = action === "archive" ? "ARCHIVED" : "PUBLISHED";
        if (!confirm(`${action === "archive" ? "Archive" : "Restore"} this listing?`)) return;
        try {
            await apiFetch(`/admin/listings/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            loadListings();
        } catch (err) { alert("Failed: " + err.message); }
    }

    // ══ Strike + Suspension Modal ═════════════════════════════
    function showStrikeModal(user) {
        const existing = document.getElementById("strikeModal");
        if (existing) existing.remove();

        const isBanned = user.strike_count >= 3;
        const strikes = user.strike_count || 0;

        const modal = document.createElement("div");
        modal.id = "strikeModal";
        modal.innerHTML = `
    <div class="strike-overlay" id="strikeOverlay">
      <div class="strike-dialog">

        <div class="strike-dialog-head">
          <h3>Suspend Account</h3>
          <button class="strike-close" id="strikeClose" type="button">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="strike-user-row">
          <div class="strike-user-av">${escHtml((user.name || "?")[0].toUpperCase())}</div>
          <div>
            <div class="strike-user-name">${escHtml(user.name)}</div>
            <div class="strike-user-email">${escHtml(user.email)}</div>
          </div>
        </div>

        <!-- Strike meter -->
        <div class="strike-meter-wrap">
          <div class="strike-meter-label">
            <span>Strike history</span>
            <span class="strike-meter-count">${strikes}/3 strikes</span>
          </div>
          <div class="strike-meter">
            ${[1, 2, 3].map(i => `<div class="strike-pip-lg${strikes >= i ? " filled" : ""}">
              ${i}
              ${i === 3 ? '<span class="strike-pip-label">Ban</span>' : ''}
            </div>`).join('')}
          </div>
          ${isBanned ? '<p class="strike-warn">This user already has 3 strikes. Suspending will result in a <strong>permanent ban</strong>.</p>' : ''}
        </div>

        <!-- Add strike checkbox -->
        <label class="strike-check-row" id="strikeCheckRow">
          <input type="checkbox" id="strikeAddCheck" ${isBanned ? "checked disabled" : "checked"}>
          <span>Add a strike <em>(${strikes + 1 <= 3 ? `${strikes + 1}/3` : "max reached"})</em></span>
        </label>

        <!-- Reason -->
        <div class="strike-field">
          <label class="strike-label">Reason for suspension</label>
          <textarea id="strikeReason" class="strike-textarea"
            placeholder="Explain why this account is being suspended…" rows="3"></textarea>
        </div>

        <!-- Date (only if not permanent ban) -->
        ${!isBanned ? `
        <div class="strike-field" id="strikeDateWrap">
          <label class="strike-label">Suspended until <em>(leave blank for indefinite)</em></label>
          <input type="datetime-local" id="strikeUntil" class="strike-input">
        </div>` : `
        <p class="strike-perm-note">
          <i data-lucide="alert-triangle"></i>
          Permanent ban — account will be blocked indefinitely.
        </p>`}

        <div class="strike-actions">
          <button class="btn ghost" id="strikeCancelBtn" type="button">Cancel</button>
          <button class="btn danger-solid" id="strikeConfirmBtn" type="button">
            ${isBanned ? "Permanently Ban" : "Suspend"}
          </button>
        </div>

      </div>
    </div>`;

        document.body.appendChild(modal);
        if (window.lucide?.createIcons) lucide.createIcons();

        // Set min date
        const untilInput = document.getElementById("strikeUntil");
        if (untilInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            untilInput.min = now.toISOString().slice(0, 16);
        }

        // Close handlers
        const close = () => modal.remove();
        document.getElementById("strikeClose")?.addEventListener("click", close);
        document.getElementById("strikeCancelBtn")?.addEventListener("click", close);
        document.getElementById("strikeOverlay")?.addEventListener("click", e => {
            if (e.target === document.getElementById("strikeOverlay")) close();
        });

        // Confirm
        document.getElementById("strikeConfirmBtn")?.addEventListener("click", async () => {
            const reason = (document.getElementById("strikeReason")?.value || "").trim();
            const addStrike = document.getElementById("strikeAddCheck")?.checked !== false;
            const untilVal = document.getElementById("strikeUntil")?.value;
            const susUntil = untilVal ? new Date(untilVal).toISOString() : null;

            const payload = {
                is_suspended: true,
                suspension_reason: reason || null,
                suspended_until: susUntil,
                add_strike: addStrike,
            };

            const btn = document.getElementById("strikeConfirmBtn");
            btn.disabled = true; btn.textContent = "Suspending…";

            try {
                await apiFetch(`/users/${user.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                modal.remove();
                await loadUsers();
            } catch (err) {
                alert(err?.error || "Failed to suspend account.");
                btn.disabled = false; btn.textContent = isBanned ? "Permanently Ban" : "Suspend";
            }
        });
    }

    // ── Logout ───────────────────────────────────────────────
    document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
        await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => { });
        window.location.replace("/auth/login.html");
    });

    // ── Analytics ───────────────────────────────────────────────




    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function fmtDate(dt) {
        if (!dt) return "—";
        try { return new Date(dt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
        catch { return "—"; }
    }

    // ── Init ─────────────────────────────────────────────────
    await loadOverview();
    if (window.lucide?.createIcons) lucide.createIcons();
});