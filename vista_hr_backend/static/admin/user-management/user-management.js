document.addEventListener("DOMContentLoaded", async () => {

    // ══ Collapsible sidebar ═══════════════════════════════════
    (function () {
        const sidebar = document.getElementById("adminSidebar");
        const toggleBtn = document.getElementById("sidebarToggle");
        const iconClose = document.getElementById("toggleIconClose");
        const iconOpen = document.getElementById("toggleIconOpen");
        const STORAGE_KEY = "vista_sidebar_collapsed";

        function setCollapsed(collapsed) {
            if (!sidebar) return;
            sidebar.classList.toggle("collapsed", collapsed);
            if (iconClose) iconClose.hidden = collapsed;
            if (iconOpen) iconOpen.hidden = !collapsed;
            localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
        }

        // Restore saved state
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === "1") setCollapsed(true);

        // Toggle on button click
        toggleBtn?.addEventListener("click", () => {
            setCollapsed(!sidebar.classList.contains("collapsed"));
            // Re-render lucide icons after transition
            setTimeout(() => {
                if (window.lucide?.createIcons) lucide.createIcons();
            }, 260);
        });
    })();

    const LOGIN_URL = "/auth/login.html";
    const API_BASE = "/api";

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
        showInfo("Admin access only.");
        window.location.replace(LOGIN_URL);
        return;
    }

    // Propagate avatar photo or initials
    if (me && window.UserAvatar) {
        UserAvatar.apply(me);
    } else {
        const initials = ((me.first_name || me.name || "A")[0] || "A").toUpperCase();
        const avatarEl = document.getElementById("adminAvatar");
        if (avatarEl) avatarEl.textContent = initials;
    }

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
        content: document.getElementById("viewContent"),
        analytics: document.getElementById("viewAnalytics"),
        tickets: document.getElementById("viewTickets"),
    };

    const pageTitles = {
        overview: ["Overview", "Platform health at a glance"],
        analytics: ["Analytics", "Platform performance and trends"],
        users: ["Users", "Manage accounts, roles, and verifications"],
        content: ["Content", "Listings management and Amenities CMS"],
        tickets: ["Tickets", "Manage support tickets and concerns"],
    };

    let currentView = "overview";

    function switchView(name) {
        if (!views[name]) return;
        if (name === "analytics") loadAnalytics();
        currentView = name;

        Object.entries(views).forEach(([key, el]) => {
            if (!el) return;
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
        if (name === "users") { loadUsers(); initUserSubTabs(); }
        if (name === "content") { initContentSubTabs(); }
        if (name === "tickets") { tkLoad(); }
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
                openApproveModal("Approve KYC Application", async () => {
                    try {
                        await apiFetch(`/admin/kyc/${btn.dataset.ovKycApprove}/approve`, { method: "POST" });
                        await loadOverview();
                    } catch (err) { showError(err.message); }
                });
                return;
                try {
                    await apiFetch(`/admin/kyc/${btn.dataset.ovKycApprove}/approve`, { method: "POST" });
                    await loadOverview();
                } catch (err) { showError(err.message); }
            });
        });

        el.querySelectorAll("[data-ov-kyc-reject]").forEach(btn => {
            btn.addEventListener("click", () => {
                openRejectModal("Reject KYC Application", async (reason) => {
                    try {
                        await apiFetch(`/admin/kyc/${btn.dataset.ovKycReject}/reject`, {
                            method: "POST",
                            body: JSON.stringify({ reason }),
                        });
                        await loadOverview();
                    } catch (err) { showError(err.message); }
                });
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
    const cardGrid = document.getElementById("userCardGrid");
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
        const el = id => document.getElementById(id);
        if (el("totalUsers")) el("totalUsers").textContent = users.length;
        if (el("totalOwners")) el("totalOwners").textContent = users.filter(u => u.role === "Property Owner").length;
        if (el("totalResidents")) el("totalResidents").textContent = users.filter(u => u.role === "Resident").length;
        const suspended = users.filter(u => u.is_suspended).length;
        if (el("ovSuspended")) el("ovSuspended").textContent = suspended;
        const chip = el("suspendedChip");
        if (chip) chip.style.display = suspended > 0 ? "" : "none";
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

        const grid = document.getElementById("userCardGrid");
        if (!grid) return;

        if (!filtered.length) {
            grid.innerHTML = `<div class="um-empty">
                <i data-lucide="users"></i>
                <p>No users found.</p>
            </div>`;
            document.getElementById("userPagination")?.remove();
            if (window.lucide?.createIcons) lucide.createIcons();
            renderStats();
            return;
        }

        // Pagination slice
        const totalPages = Math.ceil(filtered.length / USERS_PER_PAGE);
        if (currentUserPage > totalPages) currentUserPage = 1;
        const pageSlice = filtered.slice((currentUserPage - 1) * USERS_PER_PAGE, currentUserPage * USERS_PER_PAGE);

        grid.innerHTML = pageSlice.map(u => {
            const initials = (u.name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
            const statusCls = u.status === "Active" ? "active" : u.status === "Suspended" ? "suspended" : "pending";
            const suspUntil = u.is_suspended && u.suspended_until
                ? new Date((u.suspended_until.includes("+") || u.suspended_until.endsWith("Z") ? u.suspended_until : u.suspended_until + "Z"))
                    .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
                : null;

            return `<div class="um-card" data-id="${u.id}">
                <div class="um-card-top">
                    <div class="um-avatar um-avatar--${u.role === 'Admin' ? 'admin' : u.role === 'Property Owner' ? 'owner' : 'resident'}">
                        ${initials}
                    </div>
                    <div class="um-card-info">
                        <div class="um-card-name">${escHtml(u.name)}</div>
                        <div class="um-card-email">${escHtml(u.email)}</div>
                    </div>
                    <span class="badge ${roleBadgeClass(u.role)}" style="margin-left:auto;flex-shrink:0">${escHtml(u.role)}</span>
                </div>

                <div class="um-card-mid">
                    <span class="badge ${statusCls}">${escHtml(u.status)}</span>
                    ${suspUntil ? `<span style="font-size:11px;color:var(--muted)">Until ${suspUntil}</span>` : ""}
                    <div class="strike-row" style="margin-left:auto">
                        ${[1, 2, 3, 4, 5].map(i => `<span class="strike-pip${u.strike_count >= i ? " filled" : ""}" title="Strike ${i}"></span>`).join("")}
                        <span style="font-size:11px;color:var(--muted);margin-left:4px">${u.strike_count}/5</span>
                    </div>
                </div>

                <div class="um-card-actions">
    ${u.role === 'Admin'
                    ? `<span style="font-size: 12px; color: var(--muted); width: 100%; text-align: center; border: 1px dashed #ccc; padding: 5px; border-radius: 4px;">
            <i data-lucide="lock" style="width:12px; height:12px; vertical-align:middle;"></i> System Protected
           </span>`
                    : `
            <button class="um-btn" data-action="edit" data-id="${u.id}">
                <i data-lucide="edit-3"></i> Edit
            </button>
            ${u.is_suspended
                        ? `<button class="um-btn um-btn--green" data-action="uplift" data-id="${u.id}">
                        <i data-lucide="check-circle-2"></i> Uplift
                   </button>`
                        : `<button class="um-btn um-btn--warn" data-action="suspend" data-id="${u.id}">
                        <i data-lucide="ban"></i> Suspend
                   </button>`
                    }
            ${u.strike_count > 0
                        ? `<button class="um-btn um-btn--ghost" data-action="reset-strikes" data-id="${u.id}" title="Reset strikes">
                        <i data-lucide="rotate-ccw"></i>
                   </button>`
                        : ""
                    }
            <button class="um-btn um-btn--danger" data-action="delete" data-id="${u.id}">
                <i data-lucide="trash-2"></i>
            </button>
        `
                }
</div>
            </div>`;
        }).join("");

        if (window.lucide?.createIcons) lucide.createIcons();
        renderStats();

        // Render user pagination controls
        let pagEl = document.getElementById("userPagination");
        if (!pagEl) {
            pagEl = document.createElement("div");
            pagEl.id = "userPagination";
            pagEl.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;";
            grid.parentNode.insertBefore(pagEl, grid.nextSibling);
        }
        if (totalPages <= 1) { pagEl.hidden = true; }
        else {
            pagEl.hidden = false;
            pagEl.innerHTML = `
                <button id="uPagPrev" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${currentUserPage <= 1 ? "disabled" : ""}>
                    &larr; Prev
                </button>
                <span style="font-size:13px;color:#6b7280;font-weight:500;">Page ${currentUserPage} of ${totalPages}</span>
                <button id="uPagNext" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${currentUserPage >= totalPages ? "disabled" : ""}>
                    Next &rarr;
                </button>`;
            document.getElementById("uPagPrev")?.addEventListener("click", () => { if (currentUserPage > 1) { currentUserPage--; renderUsers(); } });
            document.getElementById("uPagNext")?.addEventListener("click", () => { if (currentUserPage < totalPages) { currentUserPage++; renderUsers(); } });
        }
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

    document.getElementById("userCardGrid")?.addEventListener("click", async e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        const user = users.find(u => u.id === id);
        if (!user) return;

        if (user.role === 'Admin') {
            alert("This is a system administrator account and cannot be modified.");
            return;
        }

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
            } catch (err) { showError(err?.error || err?.message || "An error occurred."); }
            return;
        }

        if (action === "reset-strikes") {
            if (!confirm(`Reset strike count for ${user.name} to 0?`)) return;
            try {
                await apiFetch(`/admin/users/${id}/reset-strikes`, { method: "POST" });
                await loadUsers();
            } catch (err) { showError(err?.error || err?.message || "An error occurred."); }
            return;
        }

        if (action === "delete") {
            if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
            try {
                await apiFetch(`/users/${id}`, { method: "DELETE" });
                addActivity("deleted", user);
                await loadUsers();
            } catch (err) { showError(err.message); }
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
            emailInput.readOnly = true;
            emailInput.style.opacity = "0.6";
            emailInput.style.cursor = "not-allowed";
            passwordInput.value = "";
            // Hide password field on edit — admin cannot change passwords
            const pwField = passwordInput.closest(".form-field, .field, div") || passwordInput.parentElement;
            if (pwField) pwField.hidden = true;
            roleInput.value = user.role;
            statusInput.value = user.status;
            if (passwordHint) passwordHint.textContent = "leave blank to keep current";
        } else {
            editingId = null;
            modalTitle.textContent = "Add user";
            nameInput.value = "";
            emailInput.value = "";
            emailInput.readOnly = false;
            emailInput.style.opacity = "";
            emailInput.style.cursor = "";
            passwordInput.value = "";
            // Show password field on add
            const pwField = passwordInput.closest(".form-field, .field, div") || passwordInput.parentElement;
            if (pwField) pwField.hidden = false;
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

        if (!name || !email) { showInfo("Name and email are required."); return; }
        if (!editingId && !password) { showInfo("Password is required for new users."); return; }
        if (!editingId && password.length < 8) { showInfo("Password must be at least 8 characters."); return; }

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
        } catch (err) { showError(err.message); }
    });

    addUserBtn?.addEventListener("click", () => openModal("add"));
    closeModalBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    modalOverlay?.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
    searchInput?.addEventListener("input", () => { currentUserPage = 1; renderUsers(); });
    roleFilter?.addEventListener("change", () => { currentUserPage = 1; renderUsers(); });
    statusFilter?.addEventListener("change", () => { currentUserPage = 1; renderUsers(); });

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
                    const approveTitle = type === "kyc" ? "Approve KYC Application" : "Approve Student Verification";
                    openApproveModal(approveTitle, async () => {
                        const endpoint = type === "kyc"
                            ? `/admin/kyc/${id}/approve`
                            : `/admin/student/${id}/approve`;
                        try {
                            await apiFetch(endpoint, { method: "POST" });
                            if (type === "kyc") loadKyc(); else loadStudent();
                            refreshBadges();
                        } catch (err) { showError(err.message); }
                    });
                }

                if (action.endsWith("-reject")) {
                    const modalTitle = type === "kyc" ? "Reject KYC Application" : "Reject Student Verification";
                    openRejectModal(modalTitle, async (reason) => {
                        const endpoint = type === "kyc"
                            ? `/admin/kyc/${id}/reject`
                            : `/admin/student/${id}/reject`;
                        try {
                            await apiFetch(endpoint, {
                                method: "POST",
                                body: JSON.stringify({ reason }),
                            });
                            if (type === "kyc") loadKyc(); else loadStudent();
                            refreshBadges();
                        } catch (err) { showError(err.message); }
                    });
                }
            });
        });
    }


    // ── Reject modal ──────────────────────────────────────────
    let _rejectCallback = null;

    function openRejectModal(title, onConfirm) {
        _rejectCallback = onConfirm;
        const overlay = document.getElementById("rejectOverlay");
        const titleEl = document.getElementById("rejectModalTitle");
        const textarea = document.getElementById("rejectReasonInput");
        const errEl = document.getElementById("rejectModalErr");
        const countEl = document.getElementById("rejectCharCount");
        const lbl = document.getElementById("rejectModalLbl");
        const spin = document.getElementById("rejectModalSpin");
        const confirm = document.getElementById("rejectModalConfirm");

        if (titleEl) titleEl.textContent = title || "Reject Application";
        if (textarea) textarea.value = "";
        if (errEl) errEl.style.display = "none";
        if (countEl) countEl.textContent = "0";
        if (lbl) lbl.hidden = false;
        if (spin) spin.hidden = true;
        if (confirm) confirm.disabled = false;

        // Deselect all chips
        document.querySelectorAll(".reject-chip").forEach(c => c.classList.remove("selected"));

        if (overlay) overlay.style.display = "flex";
        if (window.lucide?.createIcons) lucide.createIcons();
        textarea?.focus();
    }

    function openApproveModal(title, onConfirm) {
        const overlay = document.getElementById("approveOverlay");
        const titleEl = document.getElementById("approveModalTitle");
        if (titleEl) titleEl.textContent = title || "Approve Application";
        if (overlay) { overlay.hidden = false; overlay.classList.add("open"); }
        document.body.style.overflow = "hidden";

        const confirmBtn = document.getElementById("approveModalConfirm");
        const cancelBtn = document.getElementById("approveModalCancel");

        const cleanup = () => {
            if (overlay) { overlay.hidden = true; overlay.classList.remove("open"); }
            document.body.style.overflow = "";
            if (confirmBtn) confirmBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
        };

        if (confirmBtn) confirmBtn.onclick = async () => {
            cleanup();
            await onConfirm();
        };
        if (cancelBtn) cancelBtn.onclick = cleanup;
        overlay?.addEventListener("click", e => { if (e.target === overlay) cleanup(); }, { once: true });
    }

    function closeRejectModal() {
        const overlay = document.getElementById("rejectOverlay");
        if (overlay) overlay.style.display = "none";
        _rejectCallback = null;
    }

    // Wire modal controls — runs inside main DOMContentLoaded, no nested listener needed
    (function initRejectModal() {
        const textarea = document.getElementById("rejectReasonInput");
        const countEl = document.getElementById("rejectCharCount");
        const confirm = document.getElementById("rejectModalConfirm");
        const errEl = document.getElementById("rejectModalErr");
        const lbl = document.getElementById("rejectModalLbl");
        const spin = document.getElementById("rejectModalSpin");

        textarea?.addEventListener("input", () => {
            if (countEl) countEl.textContent = textarea.value.length;
        });

        document.querySelectorAll(".reject-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                document.querySelectorAll(".reject-chip").forEach(c => c.classList.remove("selected"));
                chip.classList.add("selected");
                if (textarea) {
                    textarea.value = chip.dataset.reason;
                    if (countEl) countEl.textContent = textarea.value.length;
                }
            });
        });

        document.getElementById("rejectModalClose")?.addEventListener("click", closeRejectModal);
        document.getElementById("rejectModalCancel")?.addEventListener("click", closeRejectModal);
        document.getElementById("rejectOverlay")?.addEventListener("click", e => {
            if (e.target === document.getElementById("rejectOverlay")) closeRejectModal();
        });

        confirm?.addEventListener("click", async () => {
            const reason = textarea?.value.trim();
            if (!reason) {
                if (errEl) { errEl.textContent = "Please provide a rejection reason."; errEl.style.display = "block"; }
                return;
            }
            if (errEl) errEl.style.display = "none";
            confirm.disabled = true;
            if (lbl) lbl.hidden = true;
            if (spin) spin.hidden = false;
            if (_rejectCallback) await _rejectCallback(reason);
            if (lbl) lbl.hidden = false;
            if (spin) spin.hidden = true;
            confirm.disabled = false;
            closeRejectModal();
        });
    })();

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
    const USERS_PER_PAGE = 10;
    let currentUserPage = 1;
    let listingsTotal = 0;
    const LISTINGS_PER_PAGE = 5;
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
        } catch (err) { showError("Failed: " + err.message); }
    }

    // ══ Strike + Suspension Modal ═════════════════════════════
    function showStrikeModal(user) {
        const existing = document.getElementById("strikeModal");
        if (existing) existing.remove();

        const isBanned = user.strike_count >= 5;
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
            <span class="strike-meter-count">${strikes}/5 strikes</span>
          </div>
          <div class="strike-meter">
            ${[1, 2, 3].map(i => `<div class="strike-pip-lg${strikes >= i ? " filled" : ""}">
              ${i}
              ${i === 5 ? '<span class="strike-pip-label">Ban</span>' : ''}
            </div>`).join('')}
          </div>
          ${isBanned ? '<p class="strike-warn">This user already has 5 strikes. Suspending will result in a <strong>permanent ban</strong>.</p>' : ''}
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
                showError(err?.error || "Failed to suspend account.");
                btn.disabled = false; btn.textContent = isBanned ? "Permanently Ban" : "Suspend";
            }
        });
    }

    // ── Logout ───────────────────────────────────────────────
    document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
        await fetch(`/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => { });
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

    // ══ AMENITIES CMS ═════════════════════════════════════════
    (function () {
        let activeAmenTab = "pending";

        // Tab switching
        document.getElementById("amenitiesTabBar")?.addEventListener("click", e => {
            const btn = e.target.closest(".amenities-tab");
            if (!btn) return;
            document.querySelectorAll(".amenities-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeAmenTab = btn.dataset.tab;
            document.getElementById("amenTabPending").hidden = activeAmenTab !== "pending";
            document.getElementById("amenTabSystem").hidden = activeAmenTab !== "system";
            document.getElementById("amenTabHighlights").hidden = activeAmenTab !== "highlights";
            if (activeAmenTab === "pending") loadPending();
            if (activeAmenTab === "system") loadSystemAmenities();
            if (activeAmenTab === "highlights") loadSystemHighlights();
        });

        // ── Pending review ─────────────────────────────────────
        async function loadPending() {
            const list = document.getElementById("amenPendingList");
            if (!list) return;
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Loading…</div>`;
            try {
                const res = await apiFetch("/admin/amenities/pending");
                const rows = res.pending || [];

                const badge = document.getElementById("amenPendingBadge");
                if (badge) { badge.textContent = rows.length; badge.hidden = rows.length === 0; }
                const navBadge = document.getElementById("amenitiesBadge");
                if (navBadge) { navBadge.textContent = rows.length; navBadge.hidden = rows.length === 0; }

                if (!rows.length) {
                    list.innerHTML = `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">
                        No pending custom amenities. All clear! ✓
                    </div>`;
                    return;
                }

                list.innerHTML = rows.map(r => `
                <div class="amenity-row" data-id="${r.id}">
                    <div class="amenity-row-left">
                        <div class="amenity-icon-wrap">
                            <i data-lucide="${escHtml(r.icon || "sparkles")}"></i>
                        </div>
                        <div>
                            <div class="amenity-label">${escHtml(r.label)}</div>
                            <div class="amenity-meta">
                                ${r.type === "highlight" ? "Highlight" : `Amenity · ${r.category || ""}`}
                                ${r.owner_name ? ` · by <strong>${escHtml(r.owner_name)}</strong>` : ""}
                            </div>
                        </div>
                    </div>
                    <div class="amenity-row-actions">
                        <button class="btn success" data-action="approve" data-id="${r.id}" type="button">
                            <i data-lucide="check"></i> Apply to All
                        </button>
                        <button class="btn danger-outline" data-action="reject" data-id="${r.id}" type="button">
                            <i data-lucide="x"></i> Reject
                        </button>
                    </div>
                </div>`).join("");

                if (window.lucide?.createIcons) lucide.createIcons();

                list.querySelectorAll("[data-action]").forEach(btn => {
                    btn.addEventListener("click", async () => {
                        const id = btn.dataset.id;
                        const action = btn.dataset.action;
                        btn.disabled = true;
                        try {
                            await apiFetch(`/admin/amenities/${id}/${action}`, { method: "PATCH" });
                            await loadPending();
                        } catch (err) {
                            showError(err?.error || "Failed.");
                            btn.disabled = false;
                        }
                    });
                });

            } catch (err) {
                list.innerHTML = `<div style="padding:24px;color:#ef4444;font-size:13px">Failed to load. ${err?.error || ""}</div>`;
            }
        }

        // ── System amenities ───────────────────────────────────
        async function loadSystemAmenities() {
            const list = document.getElementById("amenSystemList");
            if (!list) return;
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Loading…</div>`;
            try {
                const res = await apiFetch("/admin/amenities");
                const rows = (res.amenities || []).filter(r => r.type === "amenity");
                renderAmenityList(list, rows, "amenity");
            } catch (err) {
                list.innerHTML = `<div style="padding:24px;color:#ef4444;font-size:13px">Failed to load.</div>`;
            }
        }

        async function loadSystemHighlights() {
            const list = document.getElementById("amenHighlightsList");
            if (!list) return;
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Loading…</div>`;
            try {
                const res = await apiFetch("/admin/amenities");
                const rows = (res.amenities || []).filter(r => r.type === "highlight");
                renderAmenityList(list, rows, "highlight");
            } catch (err) {
                list.innerHTML = `<div style="padding:24px;color:#ef4444;font-size:13px">Failed to load.</div>`;
            }
        }

        function renderAmenityList(container, rows, type) {
            if (!rows.length) {
                container.innerHTML = `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">No ${type}s yet.</div>`;
                return;
            }
            container.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:4px 0;";
            container.innerHTML = rows.map(r => `
            <div class="amenity-card" data-id="${r.id}" style="
                background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;
                padding:16px;display:flex;flex-direction:column;align-items:center;
                gap:10px;text-align:center;transition:box-shadow 0.15s;">
                <div style="
                    width:44px;height:44px;border-radius:12px;
                    background:${r.is_active ? "#eff6ff" : "#f3f4f6"};
                    display:flex;align-items:center;justify-content:center;
                    color:${r.is_active ? "#2563eb" : "#9ca3af"};">
                    <i data-lucide="${escHtml(r.icon || "sparkles")}" style="width:22px;height:22px;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(r.label)}</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:2px;">
                        ${type === "highlight" ? "Highlight" : escHtml(r.category || "amenity")}
                        · <span style="color:${r.is_active ? "#16a34a" : "#9ca3af"};font-weight:600;">${r.is_active ? "Active" : "Hidden"}</span>
                    </div>
                </div>
                <div style="display:flex;gap:6px;width:100%;">
                    <button class="btn ghost" data-action="toggle" data-id="${r.id}"
                        data-active="${r.is_active}" type="button"
                        style="flex:1;font-size:11px;padding:5px 0;">
                        ${r.is_active ? "Hide" : "Show"}
                    </button>
                    <button class="btn danger-outline" data-action="delete" data-id="${r.id}" type="button"
                        style="padding:5px 8px;">
                        <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                    </button>
                </div>
            </div>`).join("");

            if (window.lucide?.createIcons) lucide.createIcons();

            container.querySelectorAll("[data-action]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.id;
                    const action = btn.dataset.action;
                    btn.disabled = true;
                    try {
                        if (action === "toggle") {
                            const isActive = btn.dataset.active === "true";
                            await apiFetch(`/admin/amenities/${id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ is_active: !isActive }),
                            });
                        } else if (action === "delete") {
                            if (!confirm("Delete this amenity?")) { btn.disabled = false; return; }
                            await apiFetch(`/admin/amenities/${id}`, { method: "DELETE" });
                        }
                        if (type === "amenity") loadSystemAmenities();
                        else loadSystemHighlights();
                    } catch (err) {
                        showError(err?.error || "Failed.");
                        btn.disabled = false;
                    }
                });
            });
        }

        // Expose for switchView to call
        window.loadAmenitiesAdmin = function () {
            loadPending();
            document.getElementById("amenTabPending").hidden = false;
            document.getElementById("amenTabSystem").hidden = true;
            document.getElementById("amenTabHighlights").hidden = true;
            document.querySelectorAll(".amenities-tab").forEach(b => {
                b.classList.toggle("active", b.dataset.tab === "pending");
            });
        };

        // Poll pending count every 60s
        setInterval(async () => {
            try {
                const res = await apiFetch("/admin/amenities/pending");
                const count = (res.pending || []).length;
                const badge = document.getElementById("amenitiesBadge");
                if (badge) { badge.textContent = count; badge.hidden = count === 0; }
            } catch { }
        }, 60_000);

    })();


    // ══ User sub-tabs ═════════════════════════════════════════
    function initUserSubTabs() {
        const wrap = document.getElementById("userSubTabs");
        if (!wrap || wrap.dataset.bound) return;
        wrap.dataset.bound = "1";
        wrap.querySelectorAll(".user-subtab[data-utab]").forEach(btn => {
            btn.addEventListener("click", () => {
                wrap.querySelectorAll(".user-subtab").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const tab = btn.dataset.utab;
                document.getElementById("uTabList").hidden = tab !== "list";
                document.getElementById("uTabKyc").hidden = tab !== "kyc";
                document.getElementById("uTabStudent").hidden = tab !== "student";
                document.getElementById("uTabResident").hidden = tab !== "resident";
                if (tab === "kyc") loadKyc();
                if (tab === "student") loadStudent();
            });
        });
    }

    // ══ Content sub-tabs ══════════════════════════════════════
    function initContentSubTabs() {
        const wrap = document.getElementById("contentSubTabs");
        if (!wrap) return;
        if (!wrap.dataset.bound) {
            wrap.dataset.bound = "1";
            wrap.querySelectorAll(".user-subtab[data-ctab]").forEach(btn => {
                btn.addEventListener("click", () => {
                    wrap.querySelectorAll(".user-subtab").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    const tab = btn.dataset.ctab;
                    document.getElementById("cTabListings").hidden = tab !== "listings";
                    document.getElementById("cTabAmenities").hidden = tab !== "amenities";
                    if (tab === "listings") loadListings();
                    if (tab === "amenities") loadAmenitiesAdmin();
                });
            });
        }
        // Load default tab (listings)
        loadListings();
    }


    // ══ User page sub-tabs ════════════════════════════════════
    function initUserSubTabs() {
        const wrap = document.getElementById("userSubTabs");
        if (!wrap || wrap.dataset.bound) return;
        wrap.dataset.bound = "1";

        wrap.querySelectorAll(".um-subtab[data-utab]").forEach(btn => {
            btn.addEventListener("click", () => {
                wrap.querySelectorAll(".um-subtab").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const tab = btn.dataset.utab;
                ["list", "kyc", "student", "resident", "history"].forEach(t => {
                    const el = document.getElementById(`uTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
                    if (el) el.hidden = t !== tab;
                });
                if (tab === "kyc") loadKyc();
                if (tab === "student") loadStudent();
                if (tab === "history") loadActivityLog();
            });
        });
    }

    // ══ Activity log (client-side — from loaded users) ═══════
    const _activityLog = [];

    function addActivity(action, user) {
        _activityLog.unshift({
            action,
            userName: user.name || user.email,
            userRole: user.role,
            userId: user.id,
            timestamp: new Date().toISOString(),
        });
        if (_activityLog.length > 100) _activityLog.pop();
    }

    function loadActivityLog() {
        const list = document.getElementById("activityLogList");
        if (!list) return;

        const roleF = document.getElementById("historyRoleFilter")?.value || "all";
        const actionF = document.getElementById("historyActionFilter")?.value || "all";

        const filtered = _activityLog.filter(e =>
            (roleF === "all" || (e.userRole || "").toUpperCase().includes(roleF.toUpperCase())) &&
            (actionF === "all" || e.action === actionF)
        );

        if (!filtered.length) {
            list.innerHTML = `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px">
                No activity recorded yet in this session.
            </div>`;
            return;
        }

        list.innerHTML = filtered.map(e => {
            const time = new Date(e.timestamp).toLocaleString("en-PH", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila"
            });
            const icons = { suspended: "ban", uplifted: "check-circle-2", created: "user-plus", deleted: "trash-2" };
            const colors = { suspended: "#dc2626", uplifted: "#16a34a", created: "#123458", deleted: "#9ca3af" };
            const icon = icons[e.action] || "activity";
            const color = colors[e.action] || "#6b7280";
            return `<div class="um-history-row">
                <div class="um-history-icon" style="background:${color}20;color:${color}">
                    <i data-lucide="${icon}"></i>
                </div>
                <div class="um-history-body">
                    <div class="um-history-text">
                        <strong>${escHtml(e.userName)}</strong>
                        <span class="badge ${e.userRole === 'Property Owner' ? 'role-owner' : e.userRole === 'Admin' ? 'role-admin' : 'role-resident'}" style="font-size:10px;padding:1px 6px">${escHtml(e.userRole || "")}</span>
                        was <strong>${e.action}</strong>
                    </div>
                    <div class="um-history-time">${time}</div>
                </div>
            </div>`;
        }).join("");

        if (window.lucide?.createIcons) lucide.createIcons();

        // Wire filters
        ["historyRoleFilter", "historyActionFilter"].forEach(id => {
            document.getElementById(id)?.addEventListener("change", loadActivityLog);
        });
    }

    // ── Tickets panel ────────────────────────────────────────
    let tkAllTickets = [];
    let tkCurrent = null;

    async function tkLoad() {
        try {
            const data = await apiFetch("/admin/tickets");
            tkAllTickets = data.tickets || [];
        } catch { tkAllTickets = []; }
        tkRender(tkAllTickets);
        tkUpdateStats(tkAllTickets);

        // Badge on sidebar
        const openCount = tkAllTickets.filter(t => t.status === "OPEN").length;
        const badge = document.getElementById("ticketsBadge");
        if (badge) { badge.textContent = openCount; badge.hidden = openCount === 0; }
    }

    function tkRender(tickets) {
        const tbody = document.getElementById("tkBody");
        const empty = document.getElementById("tkEmpty");
        if (!tickets.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = tickets.map(t => {
            const sts = (t.status || "OPEN").toLowerCase().replace("_", "-");
            const cat = (t.category || "OTHER").toLowerCase();
            const date = t.created_at ? new Date(t.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
            const statusColors = { open: "#92400e;background:#fef3c7", "in-progress": "#1e40af;background:#dbeafe", resolved: "#065f46;background:#d1fae5", closed: "#6b7280;background:#f3f4f6" };
            const sc = statusColors[sts] || statusColors.open;
            return `<tr>
                <td>#${t.id}</td>
                <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.subject || ""}</td>
                <td style="font-size:12px;color:var(--muted);">${t.user_name || "—"}<br><small>${t.user_role || ""}</small></td>
                <td><span style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(0,0,0,0.05);color:var(--muted);">${t.category}</span></td>
                <td><span style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;color:${sc};">${t.status.replace("_", " ")}</span></td>
                <td style="font-size:12px;color:var(--muted);white-space:nowrap;">${date}</td>
                <td><button class="btn ghost" style="padding:4px 12px;font-size:11px;" data-tkid="${t.id}">View</button></td>
            </tr>`;
        }).join("");

        tbody.querySelectorAll("[data-tkid]").forEach(btn => {
            btn.addEventListener("click", () => tkOpenModal(parseInt(btn.dataset.tkid)));
        });
    }

    function tkUpdateStats(tickets) {
        setText("tkStatOpen", tickets.filter(t => t.status === "OPEN").length);
        setText("tkStatProg", tickets.filter(t => t.status === "IN_PROGRESS").length);
        setText("tkStatResolved", tickets.filter(t => t.status === "RESOLVED").length);
        setText("tkStatTotal", tickets.length);
    }

    document.getElementById("tkFilterStatus")?.addEventListener("change", tkApplyFilters);
    document.getElementById("tkFilterCat")?.addEventListener("change", tkApplyFilters);

    function tkApplyFilters() {
        const s = document.getElementById("tkFilterStatus").value;
        const c = document.getElementById("tkFilterCat").value;
        let f = tkAllTickets;
        if (s) f = f.filter(t => t.status === s);
        if (c) f = f.filter(t => t.category === c);
        tkRender(f);
    }

    // Reply modal
    function tkOpenModal(id) {
        const t = tkAllTickets.find(x => x.id === id);
        if (!t) return;
        tkCurrent = t;
        document.getElementById("tkModalTitle").textContent = `Ticket #${t.id}`;
        document.getElementById("tkDetailUser").textContent = `${t.user_name || "—"} (${t.user_email || ""})`;
        document.getElementById("tkDetailCat").textContent = t.category;
        document.getElementById("tkDetailStatus").textContent = (t.status || "").replace("_", " ");
        document.getElementById("tkDetailDate").textContent = t.created_at ? new Date(t.created_at).toLocaleString("en-PH") : "—";
        document.getElementById("tkDetailBody").textContent = t.body;

        const prev = document.getElementById("tkPrevReply");
        if (t.admin_reply) { prev.hidden = false; document.getElementById("tkPrevReplyText").textContent = t.admin_reply; }
        else { prev.hidden = true; }

        document.getElementById("tkReplyStatus").value = t.status;
        document.getElementById("tkReplyText").value = "";
        document.getElementById("tkReplyOverlay").style.display = "flex";
        lucide.createIcons();
    }

    function tkCloseModal() { document.getElementById("tkReplyOverlay").style.display = "none"; tkCurrent = null; }
    document.getElementById("tkCloseBtn")?.addEventListener("click", tkCloseModal);
    document.getElementById("tkCancelBtn")?.addEventListener("click", tkCloseModal);
    document.getElementById("tkReplyOverlay")?.addEventListener("click", e => { if (e.target.id === "tkReplyOverlay") tkCloseModal(); });

    document.getElementById("tkSubmitBtn")?.addEventListener("click", async () => {
        if (!tkCurrent) return;
        const btn = document.getElementById("tkSubmitBtn");
        btn.disabled = true; btn.textContent = "Sending...";
        try {
            const body = {};
            const reply = document.getElementById("tkReplyText").value.trim();
            const status = document.getElementById("tkReplyStatus").value;
            if (reply) body.admin_reply = reply;
            if (status) body.status = status;
            await apiFetch(`/admin/tickets/${tkCurrent.id}`, { method: "PATCH", body: JSON.stringify(body) });
            tkCloseModal();
            await tkLoad();
            showInfo("Ticket updated");
        } catch { showInfo("Failed to update ticket"); }
        finally { btn.disabled = false; btn.textContent = "Send reply"; }
    });

    // Load tickets when view is shown
    const origSwitchView = window._adminSwitchView;
    document.querySelectorAll(".sidenav-item[data-view]").forEach(item => {
        item.addEventListener("click", () => {
            if (item.dataset.view === "tickets") tkLoad();
        });
    });

    // Initial load if starting on tickets view
    if (location.hash === "#tickets") tkLoad();


});