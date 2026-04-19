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
        feedback: document.getElementById("viewFeedback"),
    };

    const pageTitles = {
        overview: ["Overview", "Platform health at a glance"],
        analytics: ["Analytics", "Platform performance and trends"],
        users: ["Users", "Manage accounts, roles, and verifications"],
        content: ["Content", "Listings management and Amenities CMS"],
        tickets: ["Tickets", "Manage support tickets and concerns"],
        feedback: ["Feedback", "User feedback and ratings"],
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
        if (name === "feedback") { fbLoad(); }
    }

    document.querySelectorAll(".sidenav-item").forEach(a => {
        a.addEventListener("click", e => {
            e.preventDefault();
            switchView(a.dataset.view);
        });
    });

    document.querySelectorAll(".text-btn[data-goto]").forEach(btn => {
        btn.addEventListener("click", () => {
            const goto = btn.dataset.goto;
            if (goto === "kyc") {
                switchView("users");
                // Wait for the users view to initialize, then click the KYC sub-tab
                setTimeout(() => {
                    const kycTab = document.querySelector(".um-subtab[data-utab='kyc']");
                    if (kycTab) kycTab.click();
                }, 50);
            } else if (goto === "users") {
                switchView("users");
            } else {
                switchView(goto);
            }
        });
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
        return "Verified";
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
            const [userData, kycData, studentData, listingsData, bookingsData, feedbackData] = await Promise.all([
                apiFetch("/users"),
                apiFetch("/admin/kyc?status=PENDING"),
                apiFetch("/admin/student?status=PENDING"),
                apiFetch("/admin/listings?status=PUBLISHED&per_page=1").catch(() => ({ total: 0 })),
                apiFetch("/bookings").catch(() => ({ bookings: [] })),
                apiFetch("/feedback?limit=50").catch(() => ({ feedback: [] })),
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

            // Active listings — admin endpoint returns `total` of filtered PUBLISHED listings
            const activeListings = listingsData.total || 0;

            const bookings = bookingsData.bookings || [];
            const activeBookings = bookings.filter(b =>
                ["APPROVED", "VIEWING_SCHEDULED", "ACTIVE"].includes(b.status)
            ).length;

            const feedback = feedbackData.feedback || [];
            const rated = feedback.filter(f => f.rating);
            const avgFeedback = rated.length
                ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1)
                : "—";

            // Stats
            document.getElementById("ovTotalUsers").textContent = total;
            const elActiveListings = document.getElementById("ovActiveListings");
            const elAvgFeedback = document.getElementById("ovAvgFeedback");
            const elAvgFeedbackSub = document.getElementById("ovAvgFeedbackSub");
            const elActiveBookings = document.getElementById("ovActiveBookings");
            if (elActiveListings) elActiveListings.textContent = activeListings;
            if (elAvgFeedback) elAvgFeedback.textContent = avgFeedback === "—" ? "—" : `${avgFeedback} ★`;
            if (elAvgFeedbackSub) elAvgFeedbackSub.textContent = `Based on ${rated.length} ${rated.length === 1 ? "review" : "reviews"}`;
            if (elActiveBookings) elActiveBookings.textContent = activeBookings;

            // Active users now (last_login_at within 15 min)
            const now = Date.now();
            const FIFTEEN_MIN = 15 * 60 * 1000;
            const activeNowUsers = (userData.users || []).filter(u => {
                if (!u.last_login_at) return false;
                const t = new Date(u.last_login_at).getTime();
                return !isNaN(t) && (now - t) <= FIFTEEN_MIN;
            });
            const activeCount = activeNowUsers.length;
            const activeAdmins = activeNowUsers.filter(u => mapRoleFromBackend(u.role) === "Admin").length;
            const activeOwners = activeNowUsers.filter(u => mapRoleFromBackend(u.role) === "Property Owner").length;
            const activeResidents = activeNowUsers.filter(u => mapRoleFromBackend(u.role) === "Resident").length;

            const elActiveCount = document.getElementById("anActiveCount");
            const elActiveAdmins = document.getElementById("anActiveAdmins");
            const elActiveOwners = document.getElementById("anActiveOwners");
            const elActiveResidents = document.getElementById("anActiveResidents");
            const elActiveEmpty = document.getElementById("anActiveEmpty");
            const elActiveDot = document.getElementById("anActiveDot");
            if (elActiveCount) elActiveCount.textContent = activeCount;
            if (elActiveAdmins) elActiveAdmins.textContent = activeAdmins;
            if (elActiveOwners) elActiveOwners.textContent = activeOwners;
            if (elActiveResidents) elActiveResidents.textContent = activeResidents;
            if (elActiveEmpty) elActiveEmpty.hidden = activeCount > 0;
            if (elActiveDot) elActiveDot.style.background = activeCount > 0 ? "#22c55e" : "#9ca3af";

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
            const statusCls = u.status === "Verified" ? "active" : u.status === "Suspended" ? "suspended" : "pending";
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
            const statusCls = u.status === "Verified" ? "active" : u.status === "Suspended" ? "suspended" : "pending";
            const suspUntil = u.is_suspended && u.suspended_until
                ? new Date((u.suspended_until.includes("+") || u.suspended_until.endsWith("Z") ? u.suspended_until : u.suspended_until + "Z"))
                    .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
                : null;

            // --- INJECTED VERIFICATION LOGIC ---
            let verifiedCount = 0;
            if (u.email_verified) verifiedCount++;
            if (u.kyc_status === "APPROVED") verifiedCount++;

            const verifColor = verifiedCount === 2 ? "var(--success, #10b981)" : "var(--muted, #64748b)";
            const isStudentVerified = u.role === "Resident" && u.student_verified;
            // -----------------------------------

            return `<div class="um-card" data-id="${u.id}">
                <div class="um-card-top">
                    <div class="um-avatar um-avatar--${u.role === 'Admin' ? 'admin' : u.role === 'Property Owner' ? 'owner' : 'resident'}" style="overflow:hidden;padding:0;position:relative;">
                        ${u.avatar_url
                    ? `<img src="${escHtml(u.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
                    : initials}
                    </div>
                    <div class="um-card-info">
                        <div class="um-card-name">${escHtml(u.name)}</div>
                        <div class="um-card-email">${escHtml(u.email)}</div>
                    </div>
                    <span class="badge ${roleBadgeClass(u.role)}" style="margin-left:auto;flex-shrink:0">${escHtml(u.role)}</span>
                </div>

                <div class="um-card-mid" style="display:flex; align-items:center;">
                    <span class="badge ${statusCls}">${escHtml(u.status)}</span>
                    ${suspUntil ? `<span style="font-size:11px;color:var(--muted);margin-left:6px;">Until ${suspUntil}</span>` : ""}
                    
                     ${u.role !== 'Admin' ? `
                    <span class="verifHoverTrigger" data-uid="${u.id}" style="font-size:12px; color:${verifColor}; margin-left:12px; display:flex; align-items:center; gap:4px; font-weight:500; cursor:pointer; padding:2px 6px; border-radius:6px; transition:background 150ms;">
                        <i data-lucide="shield-check" style="width:14px; height:14px;"></i>
                        ${verifiedCount}/2 Verified
                        <i data-lucide="info" style="width:11px; height:11px; opacity:0.5;"></i>
                    </span>

                    <div class="strike-row" style="margin-left:auto">
                        ${[1, 2, 3, 4, 5].map(i => `<span class="strike-pip${u.strike_count >= i ? " filled" : ""}" title="Strike ${i}"></span>`).join("")}
                        <span style="font-size:11px;color:var(--muted);margin-left:4px">${u.strike_count}/5</span>
                    </div>` : ''}
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

        // Attach hover popover to each N/2 Verified badge after render
        attachVerifHover();
    }

    // ── Verification history popover ───────────────────────────
    let _verifPopover = null;
    let _verifHideTimer = null;

    function ensureVerifPopover() {
        if (_verifPopover) return _verifPopover;
        _verifPopover = document.createElement("div");
        _verifPopover.id = "verifHoverPopover";
        _verifPopover.style.cssText = "position:fixed;z-index:9998;min-width:280px;max-width:340px;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.15);padding:14px;font-size:12px;opacity:0;pointer-events:none;transition:opacity 150ms;transform:translateY(4px);";
        _verifPopover.addEventListener("mouseenter", () => { clearTimeout(_verifHideTimer); });
        _verifPopover.addEventListener("mouseleave", () => { hideVerifPopover(); });
        document.body.appendChild(_verifPopover);
        return _verifPopover;
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("en-PH", {
                month: "short", day: "numeric", year: "numeric"
            });
        } catch { return "—"; }
    }

    function verifStatusPill(status) {
        const map = {
            APPROVED: "background:#dcfce7;color:#15803d;",
            PENDING: "background:#fef3c7;color:#92400e;",
            REJECTED: "background:#fee2e2;color:#991b1b;",
            NONE: "background:#f3f4f6;color:#6b7280;",
        };
        const style = map[status] || map.NONE;
        return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;${style}">${escHtml(status)}</span>`;
    }

    function renderDocThumbs(docs) {
        // docs: [{label, url}]
        const valid = docs.filter(d => d.url);
        if (!valid.length) {
            return `<div style="font-size:11px;color:#9ca3af;font-style:italic;">No documents uploaded</div>`;
        }
        return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">` +
            valid.map(d => `
                <a href="${escHtml(d.url)}" target="_blank" rel="noopener"
                    style="display:block;width:54px;height:54px;border-radius:8px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);position:relative;background:#f3f4f6;cursor:pointer;"
                    title="${escHtml(d.label)} — click to open">
                    <img src="${escHtml(d.url)}" alt="${escHtml(d.label)}"
                        style="width:100%;height:100%;object-fit:cover;">
                    <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;font-weight:600;padding:1px 4px;text-align:center;">${escHtml(d.label)}</span>
                </a>`).join("") +
            `</div>`;
    }

    function showVerifPopover(triggerEl, u) {
        const pop = ensureVerifPopover();
        clearTimeout(_verifHideTimer);

        const kycDocs = [
            { label: "ID Front", url: u.kyc_id_front_url },
            { label: "ID Back", url: u.kyc_id_back_url },
            { label: "Selfie", url: u.kyc_selfie_url },
        ];
        const studentDocs = [
            { label: "Student ID", url: u.student_id_url },
            { label: "COR", url: u.student_cor_url },
        ];

        const emailRow = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;">
                <span style="font-weight:600;color:#374151;">Email</span>
                ${u.email_verified
                ? `<span style="color:#15803d;display:flex;align-items:center;gap:4px;font-weight:600;"><i data-lucide="mail-check" style="width:12px;height:12px;"></i>Verified</span>`
                : `<span style="color:#9ca3af;">Not verified</span>`}
            </div>`;

        const kycSection = `
            <div style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;color:#374151;">Identity (KYC)</span>
                    ${verifStatusPill(u.kyc_status)}
                </div>
                <div style="font-size:10px;color:#9ca3af;margin-top:2px;">
                    Submitted: ${fmtDate(u.kyc_submitted_at)}
                </div>
                ${renderDocThumbs(kycDocs)}
            </div>`;

        const studentSection = u.role === "Resident" ? `
            <div style="padding:8px 0 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:600;color:#374151;">Student</span>
                    ${verifStatusPill(u.student_status)}
                </div>
                <div style="font-size:10px;color:#9ca3af;margin-top:2px;">
                    Submitted: ${fmtDate(u.student_submitted_at)}
                </div>
                ${renderDocThumbs(studentDocs)}
            </div>` : "";

        pop.innerHTML = `
            <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
                Verification history
            </div>
            ${emailRow}
            ${kycSection}
            ${studentSection}
        `;

        // Position popover: above trigger if there's room, else below
        const rect = triggerEl.getBoundingClientRect();
        pop.style.opacity = "0";
        pop.style.pointerEvents = "auto";
        pop.style.display = "block";

        // Temporarily show to measure
        requestAnimationFrame(() => {
            const popRect = pop.getBoundingClientRect();
            const gap = 8;
            let top = rect.top - popRect.height - gap;
            let left = rect.left + (rect.width / 2) - (popRect.width / 2);

            // Flip below if no room above
            if (top < 10) top = rect.bottom + gap;
            // Clamp horizontally
            if (left < 10) left = 10;
            if (left + popRect.width > window.innerWidth - 10) {
                left = window.innerWidth - popRect.width - 10;
            }

            pop.style.top = top + "px";
            pop.style.left = left + "px";
            pop.style.opacity = "1";
            pop.style.transform = "translateY(0)";

            if (window.lucide?.createIcons) lucide.createIcons();
        });
    }

    function hideVerifPopover() {
        clearTimeout(_verifHideTimer);
        _verifHideTimer = setTimeout(() => {
            if (_verifPopover) {
                _verifPopover.style.opacity = "0";
                _verifPopover.style.pointerEvents = "none";
            }
        }, 200);
    }

    function attachVerifHover() {
        document.querySelectorAll(".verifHoverTrigger").forEach(el => {
            el.addEventListener("mouseenter", () => {
                const uid = Number(el.dataset.uid);
                const u = users.find(x => x.id === uid);
                if (!u) return;
                el.style.background = "rgba(3,3,3,0.04)";
                showVerifPopover(el, u);
            });
            el.addEventListener("mouseleave", () => {
                el.style.background = "transparent";
                hideVerifPopover();
            });
        });
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
                kyc_submitted_at: u.kyc_submitted_at || null,
                kyc_id_front_url: u.kyc_id_front_url || null,
                kyc_id_back_url: u.kyc_id_back_url || null,
                kyc_selfie_url: u.kyc_selfie_url || null,
                student_status: u.student_status || "NONE",
                student_verified: !!u.student_verified,
                student_submitted_at: u.student_submitted_at || null,
                student_id_url: u.student_id_url || null,
                student_cor_url: u.student_cor_url || null,
                email_verified: !!u.email_verified,
                created_at: u.created_at,
                avatar_url: u.avatar_url || null,
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
            showError("This is a system administrator account and cannot be modified.");
            return;
        }

        if (action === "edit") { openModal("edit", user); return; }

        if (action === "suspend") {
            // Show suspension modal with strike/reason/date options
            showStrikeModal(user);
            return;
        }

        if (action === "uplift") {
            openApproveModal(`Lift suspension for ${user.name}?`, async () => {
                try {
                    await apiFetch(`/users/${id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ is_suspended: false }),
                    });
                    addActivity("uplifted", user);
                    await loadUsers();
                } catch (err) { showError(err?.error || err?.message || "An error occurred."); }
            });
            return;
        }

        if (action === "reset-strikes") {
            openApproveModal(`Reset strike count for ${user.name} to 0?`, async () => {
                try {
                    await apiFetch(`/admin/users/${id}/reset-strikes`, { method: "POST" });
                    await loadUsers();
                } catch (err) { showError(err?.error || err?.message || "An error occurred."); }
            });
            return;
        }

        // "delete" action removed — admins cannot delete accounts. Use suspend instead.
    });

    // ── Modal ────────────────────────────────────────────────
    function openModal(mode = "add", user = null) {
        modalOverlay.classList.add("open");
        if (mode === "edit" && user) {
            editingId = user.id;
            modalTitle.textContent = "Edit user";
            nameInput.value = user.name;
            nameInput.readOnly = true;
            nameInput.style.opacity = "0.6";
            nameInput.style.cursor = "not-allowed";
            nameInput.title = "Name cannot be changed by admin";
            emailInput.value = user.email;
            emailInput.readOnly = true;
            emailInput.style.opacity = "0.6";
            emailInput.style.cursor = "not-allowed";
            passwordInput.value = "";
            // Hide password field on edit — admin cannot change passwords
            const pwField = passwordInput.closest(".form-field, .field, div") || passwordInput.parentElement;
            if (pwField) pwField.hidden = true;
            roleInput.value = user.role;
            roleInput.hidden = true;
            let roleDisplay = document.getElementById("roleReadOnly");
            if (!roleDisplay) {
                roleDisplay = document.createElement("div");
                roleDisplay.id = "roleReadOnly";
                roleDisplay.style.cssText = "padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:8px;font-size:0.9rem;color:#374151;background:#f9fafb;";
                roleInput.parentNode.insertBefore(roleDisplay, roleInput.nextSibling);
            }
            roleDisplay.textContent = user.role;
            roleDisplay.hidden = false;
            statusInput.value = user.status;
            if (passwordHint) passwordHint.textContent = "leave blank to keep current";
        } else {
            editingId = null;
            roleInput.hidden = false;
            roleInput.disabled = false;
            roleInput.style.opacity = "";
            roleInput.style.cursor = "";
            roleInput.style.pointerEvents = "";
            const roleDisplay = document.getElementById("roleReadOnly");
            if (roleDisplay) roleDisplay.hidden = true;
            modalTitle.textContent = "Add admin";
            nameInput.value = "";
            nameInput.readOnly = false;
            nameInput.style.opacity = "";
            nameInput.style.cursor = "";
            nameInput.title = "";
            emailInput.value = "";
            emailInput.readOnly = false;
            emailInput.style.opacity = "";
            emailInput.style.cursor = "";
            passwordInput.value = "";
            // Show password field on add
            const pwField = passwordInput.closest(".form-field, .field, div") || passwordInput.parentElement;
            if (pwField) pwField.hidden = false;
            roleInput.value = "Admin";
            statusInput.value = "Verified";
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
                addActivity("created", { name, role });
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
            _kycPage = 1;
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


    let _kycPage = 1;
    const KYC_PER_PAGE = 5;
    let _kycItems = [];

    async function loadKyc() {
        const list = document.getElementById("kycList");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/kyc?status=${kycStatusFilter}`);
            _kycItems = data.kyc_applications || [];
            _kycPage = 1;
            _renderKycPage();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function _renderKycPage() {
        const list = document.getElementById("kycList");
        if (!list) return;
        if (!_kycItems.length) {
            list.innerHTML = `<div class="verifyEmpty">No ${kycStatusFilter.toLowerCase()} KYC applications.</div>`;
            _renderVerifyPagination("kycPagination", 0, _kycPage, null);
            return;
        }
        const totalPages = Math.ceil(_kycItems.length / KYC_PER_PAGE);
        const slice = _kycItems.slice((_kycPage - 1) * KYC_PER_PAGE, _kycPage * KYC_PER_PAGE);
        list.innerHTML = slice.map(u => kycCardHTML(u)).join("");
        bindVerifyActions(list, "kyc");
        if (window.lucide?.createIcons) lucide.createIcons();
        _renderVerifyPagination("kycPagination", totalPages, _kycPage, (p) => { _kycPage = p; _renderKycPage(); });
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
            _studentPage = 1;
            loadStudent();
        });
    });

    let _studentPage = 1;
    const STUDENT_PER_PAGE = 5;
    let _studentItems = [];

    async function loadStudent() {
        const list = document.getElementById("studentList");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/student?status=${studentStatusFilter}`);
            _studentItems = data.student_applications || [];
            _studentPage = 1;
            _renderStudentPage();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function _renderStudentPage() {
        const list = document.getElementById("studentList");
        if (!list) return;
        if (!_studentItems.length) {
            list.innerHTML = `<div class="verifyEmpty">No ${studentStatusFilter.toLowerCase()} student applications.</div>`;
            _renderVerifyPagination("studentPagination", 0, _studentPage, null);
            return;
        }
        const totalPages = Math.ceil(_studentItems.length / STUDENT_PER_PAGE);
        const slice = _studentItems.slice((_studentPage - 1) * STUDENT_PER_PAGE, _studentPage * STUDENT_PER_PAGE);
        list.innerHTML = slice.map(u => studentCardHTML(u)).join("");
        bindVerifyActions(list, "student");
        if (window.lucide?.createIcons) lucide.createIcons();
        _renderVerifyPagination("studentPagination", totalPages, _studentPage, (p) => { _studentPage = p; _renderStudentPage(); });
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

    // ══════════════════════════════════════════════════════════
    // RESIDENT VERIF VIEW
    // ══════════════════════════════════════════════════════════
    let residentStatusFilter = "PENDING";

    document.querySelectorAll("#residentFilterBar .filter-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#residentFilterBar .filter-pill").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            residentStatusFilter = btn.dataset.status;
            _residentPage = 1;
            loadResident();
        });
    });

    let _residentPage = 1;
    const RESIDENT_PER_PAGE = 5;
    let _residentItems = [];

    async function loadResident() {
        const list = document.getElementById("residentList");
        if (!list) return;
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/resident-kyc?status=${residentStatusFilter}`);
            _residentItems = data.resident_kyc || data.applications || [];
            _residentPage = 1;
            _renderResidentPage();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function _renderResidentPage() {
        const list = document.getElementById("residentList");
        if (!list) return;
        if (!_residentItems.length) {
            list.innerHTML = `<div class="verifyEmpty">No ${residentStatusFilter.toLowerCase()} resident verifications.</div>`;
            _renderVerifyPagination("residentPagination", 0, _residentPage, null);
            return;
        }
        const totalPages = Math.ceil(_residentItems.length / RESIDENT_PER_PAGE);
        const slice = _residentItems.slice((_residentPage - 1) * RESIDENT_PER_PAGE, _residentPage * RESIDENT_PER_PAGE);
        list.innerHTML = slice.map(u => residentCardHTML(u)).join("");
        bindVerifyActions(list, "resident");
        if (window.lucide?.createIcons) lucide.createIcons();
        _renderVerifyPagination("residentPagination", totalPages, _residentPage, (p) => { _residentPage = p; _renderResidentPage(); });
    }

    function residentCardHTML(u) {
        // Adjust these keys based on your actual backend JSON response
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
                <button class="btn verifyApprove" data-action="resident-approve" data-id="${u.id}">Approve</button>
                <button class="btn ghost verifyReject" data-action="resident-reject" data-id="${u.id}">Reject</button>
            </div>` : ""}
        </div>`;
    }

    // ── Shared approve/reject handler ───────────────────────
    // ── Shared approve/reject handler ───────────────────────
    function bindVerifyActions(container, type) {
        container.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;

                if (action.endsWith("-approve")) {
                    const approveTitle = type === "kyc" ? "Approve KYC Application" : type === "student" ? "Approve Student Verification" : "Approve Resident Verification";
                    openApproveModal(approveTitle, async () => {
                        let endpoint = `/admin/${type}/${id}/approve`;
                        if (type === "resident") endpoint = `/admin/resident-kyc/${id}/approve`; // ⚠️ Adjust to match backend route

                        try {
                            await apiFetch(endpoint, { method: "POST" });
                            if (type === "kyc") loadKyc();
                            else if (type === "student") loadStudent();
                            else loadResident();
                            refreshBadges();
                        } catch (err) { showError(err.message); }
                    });
                }

                if (action.endsWith("-reject")) {
                    const modalTitle = type === "kyc" ? "Reject KYC Application" : type === "student" ? "Reject Student Verification" : "Reject Resident Verification";
                    openRejectModal(modalTitle, async (reason) => {
                        let endpoint = `/admin/${type}/${id}/reject`;
                        if (type === "resident") endpoint = `/admin/resident-kyc/${id}/reject`; // ⚠️ Adjust to match backend route

                        try {
                            await apiFetch(endpoint, {
                                method: "POST",
                                body: JSON.stringify({ reason }),
                            });
                            if (type === "kyc") loadKyc();
                            else if (type === "student") loadStudent();
                            else loadResident();
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

    function openApproveModal(title, onConfirm, confirmLabel = "Confirm") {
        const overlay = document.getElementById("approveOverlay");
        const titleEl = document.getElementById("approveModalTitle");
        const confirmBtn = document.getElementById("approveModalConfirm");
        if (titleEl) titleEl.textContent = title || "Confirm";
        if (confirmBtn) confirmBtn.textContent = confirmLabel;
        if (overlay) { overlay.style.display = "flex"; overlay.style.alignItems = "center"; overlay.style.justifyContent = "center"; }
        document.body.style.overflow = "hidden";

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

    function handleListingAction(action, id) {
        const newStatus = action === "archive" ? "ARCHIVED" : "PUBLISHED";
        const label = action === "archive" ? "Archive" : "Restore";
        openApproveModal(`${label} this listing?`, async () => {
            try {
                await apiFetch(`/admin/listings/${id}/status`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: newStatus }),
                });
                loadListings();
            } catch (err) { showError("Failed: " + err.message); }
        }, label);
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
                addActivity(isBanned ? "banned" : "suspended", user);
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
    // Refresh "active now" count every 60s while overview is visible
    setInterval(() => {
        const ov = document.getElementById("viewOverview");
        if (ov && !ov.hidden) loadOverview();
    }, 60000);
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
                        · <span style="color:${r.is_active ? "#16a34a" : "#9ca3af"};font-weight:600;">${r.is_active ? "Verified" : "Hidden"}</span>
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
                            openApproveModal("Delete this amenity?", async () => {
                                try {
                                    await apiFetch(`/admin/amenities/${id}`, { method: "DELETE" });
                                    if (type === "amenity") loadSystemAmenities();
                                    else loadSystemHighlights();
                                } catch (err) { showError(err?.error || err?.message || "Failed."); }
                            });
                            btn.disabled = false;
                            return;


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
                if (tab === "resident") loadResident();
                if (tab === "history") { _activityPage = 1; loadActivityLog(); }
            });
        });

        document.getElementById("historyRoleFilter")?.addEventListener("change", loadActivityLog);
        document.getElementById("historyActionFilter")?.addEventListener("change", loadActivityLog);
    }

    // ══ Activity log (client-side — from loaded users) ═══════
    const ACTIVITY_LOG_KEY = "vista_activity_log";

    function _loadStoredLog() {
        try { return JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "[]"); }
        catch { return []; }
    }

    const _activityLog = _loadStoredLog();

    function addActivity(action, user) {
        _activityLog.unshift({
            action,
            userName: user.name || user.email,
            userRole: user.role,
            userId: user.id,
            timestamp: new Date().toISOString(),
        });
        if (_activityLog.length > 100) _activityLog.pop();
        try { localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(_activityLog)); }
        catch { /* storage full */ }
    }

    let _activityPage = 1;
    const ACTIVITY_PER_PAGE = 10;

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
            _renderActivityPagination(0);
            return;
        }

        const totalPages = Math.ceil(filtered.length / ACTIVITY_PER_PAGE);
        if (_activityPage > totalPages) _activityPage = 1;
        const pageSlice = filtered.slice((_activityPage - 1) * ACTIVITY_PER_PAGE, _activityPage * ACTIVITY_PER_PAGE);

        list.innerHTML = pageSlice.map(e => {
            const time = new Date(e.timestamp).toLocaleString("en-PH", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila"
            });
            const icons = { suspended: "ban", banned: "shield-off", uplifted: "check-circle-2", created: "user-plus", deleted: "trash-2" };
            const colors = { suspended: "#dc2626", banned: "#7f1d1d", uplifted: "#16a34a", created: "#123458", deleted: "#9ca3af" };
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
        _renderActivityPagination(totalPages);
    }

    function _renderVerifyPagination(elId, totalPages, currentPage, onPageChange) {
        let pagEl = document.getElementById(elId);
        if (!pagEl) {
            pagEl = document.createElement("div");
            pagEl.id = elId;
            pagEl.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;padding-bottom:8px;";
            // Insert after the relevant list's parent panel
            const listId = elId.replace("Pagination", "List").replace("kyc", "kyc").replace("student", "student").replace("resident", "resident");
            document.getElementById(listId)?.closest(".panel")?.appendChild(pagEl);
        }
        if (!onPageChange || totalPages <= 1) { pagEl.hidden = true; return; }
        pagEl.hidden = false;
        pagEl.innerHTML = `
        <button id="${elId}Prev" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${currentPage <= 1 ? "disabled" : ""}>&larr; Prev</button>
        <span style="font-size:13px;color:#6b7280;font-weight:500;">Page ${currentPage} of ${totalPages}</span>
        <button id="${elId}Next" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${currentPage >= totalPages ? "disabled" : ""}>Next &rarr;</button>`;
        document.getElementById(`${elId}Prev`)?.addEventListener("click", () => { if (currentPage > 1) onPageChange(currentPage - 1); });
        document.getElementById(`${elId}Next`)?.addEventListener("click", () => { if (currentPage < totalPages) onPageChange(currentPage + 1); });
    }

    function _renderActivityPagination(totalPages) {
        let pagEl = document.getElementById("activityPagination");
        if (!pagEl) {
            pagEl = document.createElement("div");
            pagEl.id = "activityPagination";
            pagEl.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;";
            document.getElementById("activityLogList")?.insertAdjacentElement("afterend", pagEl);
        }

        if (totalPages <= 1) { pagEl.hidden = true; return; }
        pagEl.hidden = false;
        pagEl.innerHTML = `
        <button id="actPagPrev" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${_activityPage <= 1 ? "disabled" : ""}>
            &larr; Prev
        </button>
        <span style="font-size:13px;color:#6b7280;font-weight:500;">Page ${_activityPage} of ${totalPages}</span>
        <button id="actPagNext" style="padding:6px 14px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;" ${_activityPage >= totalPages ? "disabled" : ""}>
            Next &rarr;
        </button>`;

        document.getElementById("actPagPrev")?.addEventListener("click", () => {
            if (_activityPage > 1) { _activityPage--; loadActivityLog(); }
        });
        document.getElementById("actPagNext")?.addEventListener("click", () => {
            if (_activityPage < totalPages) { _activityPage++; loadActivityLog(); }
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



    // ── Feedback panel ────────────────────────────────────────
    let _fbAll = [];

    async function fbLoad() {
        const listEl = document.getElementById("fbList");
        if (listEl) listEl.innerHTML = `<div class="queue-empty">Loading…</div>`;
        try {
            const data = await apiFetch("/feedback?limit=50");
            _fbAll = data.feedback || [];
        } catch { _fbAll = []; }
        fbRender(_fbAll);
    }

    // Normalize backend role values ("RESIDENT"/"OWNER"/"resident") → display strings
    function fbNormalizeRole(r) {
        const v = (r || "").toLowerCase();
        if (v.includes("owner")) return "Property Owner";
        if (v.includes("resident")) return "Resident";
        return r || "Unknown";
    }

    const FB_PAGE_SIZE = 5;
    let _fbPage = 1;
    let _fbFiltered = [];

    function fbRender(items) {
        // Normalize role on every item so filters + charts stay consistent
        items = items.map(f => ({ ...f, role: fbNormalizeRole(f.role) }));

        // Stats
        const total = items.length;
        const rated = items.filter(f => f.rating);
        const avg = rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : "—";
        const residents = items.filter(f => f.role === "Resident").length;
        const owners = items.filter(f => f.role === "Property Owner").length;

        setText("fbStatAvg", avg === "—" ? "—" : `${avg} ★`);
        setText("fbStatTotal", total);
        setText("fbStatResidents", residents);
        setText("fbStatOwners", owners);

        // Rating bars (1–5) — with hover tooltip
        const barsEl = document.getElementById("fbRatingBars");
        if (barsEl) {
            const counts = [5, 4, 3, 2, 1].map(star => ({
                star,
                count: items.filter(f => f.rating === star).length,
            }));
            const max = Math.max(...counts.map(c => c.count), 1);
            barsEl.innerHTML = counts.map(({ star, count }) => {
                const pct = total ? Math.round(count / total * 100) : 0;
                const tip = `${count} ${count === 1 ? "review" : "reviews"} · ${pct}% of total`;
                return `
                <div class="fb-bar-row" data-tip="${escHtml(tip)}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;position:relative;cursor:pointer;padding:4px 0;border-radius:6px;transition:background 150ms;">
                    <span style="font-size:12px;font-weight:700;width:16px;text-align:right;color:#6b7280;">${star}</span>
                    <i data-lucide="star" style="width:12px;height:12px;color:#f59e0b;flex-shrink:0;"></i>
                    <div style="flex:1;height:10px;background:#f3f4f6;border-radius:999px;overflow:hidden;">
                        <div style="height:100%;width:${Math.round(count / max * 100)}%;background:#f59e0b;border-radius:999px;transition:width 600ms ease;"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700;color:#374151;width:20px;">${count}</span>
                </div>`;
            }).join("");
            if (window.lucide?.createIcons) lucide.createIcons();
        }

        // Role chart — with hover tooltip
        const roleEl = document.getElementById("fbRoleChart");
        if (roleEl) {
            const roleCounts = {};
            items.forEach(f => {
                const r = f.role || "Unknown";
                roleCounts[r] = (roleCounts[r] || 0) + 1;
            });
            const maxR = Math.max(...Object.values(roleCounts), 1);
            const colors = { "Resident": "#3b82f6", "Property Owner": "#f59e0b", "Unknown": "#9ca3af" };
            roleEl.innerHTML = Object.entries(roleCounts).map(([role, count]) => {
                const pct = total ? Math.round(count / total * 100) : 0;
                const avgRole = (() => {
                    const rrated = items.filter(f => f.role === role && f.rating);
                    return rrated.length ? (rrated.reduce((s, f) => s + f.rating, 0) / rrated.length).toFixed(1) : "—";
                })();
                const tip = `${count} ${count === 1 ? "review" : "reviews"} · ${pct}% · avg ${avgRole}★`;
                return `
                <div class="fb-bar-row" data-tip="${escHtml(tip)}" style="position:relative;cursor:pointer;padding:4px 0;border-radius:6px;transition:background 150ms;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:4px;">
                        <span>${escHtml(role)}</span>
                        <span style="color:#6b7280;">${count}</span>
                    </div>
                    <div style="height:10px;background:#f3f4f6;border-radius:999px;overflow:hidden;">
                        <div style="height:100%;width:${Math.round(count / maxR * 100)}%;background:${colors[role] || "#9ca3af"};border-radius:999px;transition:width 600ms ease;"></div>
                    </div>
                </div>`;
            }).join("");
        }

        // Cache filtered set + reset pagination
        _fbFiltered = items;
        _fbPage = 1;
        fbRenderPage();

        // Attach hover tooltip (delegated, once)
        fbAttachChartTooltip();
    }

    function fbRenderPage() {
        const listEl = document.getElementById("fbList");
        const pagerEl = document.getElementById("fbPager");
        if (!listEl) return;

        if (!_fbFiltered.length) {
            listEl.innerHTML = `<div class="queue-empty">No feedback yet.</div>`;
            if (pagerEl) pagerEl.innerHTML = "";
            return;
        }

        const totalPages = Math.max(1, Math.ceil(_fbFiltered.length / FB_PAGE_SIZE));
        if (_fbPage > totalPages) _fbPage = totalPages;
        const start = (_fbPage - 1) * FB_PAGE_SIZE;
        const pageItems = _fbFiltered.slice(start, start + FB_PAGE_SIZE);

        // Grid cards (3 columns on wide, auto-fit on narrow)
        listEl.style.display = "grid";
        listEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
        listEl.style.gap = "14px";

        listEl.innerHTML = pageItems.map(f => {
            const stars = f.rating
                ? Array.from({ length: 5 }, (_, i) =>
                    `<i data-lucide="star" style="width:13px;height:13px;color:${i < f.rating ? "#f59e0b" : "#e5e7eb"};fill:${i < f.rating ? "#f59e0b" : "none"};"></i>`
                ).join("")
                : "";
            const date = f.created_at
                ? new Date(f.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                : "—";
            const ini = ((f.name || "?")[0]).toUpperCase();
            const avHtml = f.avatar_url
                ? `<img src="${escHtml(f.avatar_url)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
                : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1B3F6E,#C8872A);color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${escHtml(ini)}</div>`;
            const roleBadgeColor = (f.role || "").toLowerCase().includes("owner")
                ? "background:#fef3c7;color:#92400e;"
                : "background:#dbeafe;color:#1e40af;";
            return `
            <div style="position:relative;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid rgba(0,0,0,0.07);border-radius:14px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.04);min-height:180px;">
                <button type="button" data-fb-delete="${f.id}" title="Delete feedback"
                    style="position:absolute;top:10px;right:10px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#9ca3af;border-radius:6px;cursor:pointer;transition:all 150ms;"
                    onmouseover="this.style.background='#fee2e2';this.style.color='#dc2626';"
                    onmouseout="this.style.background='transparent';this.style.color='#9ca3af';">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
                <div style="display:flex;align-items:center;gap:12px;padding-right:32px;">
                    ${avHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(f.name || "Anonymous")}</div>
                        ${f.role ? `<div><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;${roleBadgeColor}">${escHtml(f.role)}</span></div>` : ""}
                    </div>
                    <span style="display:flex;gap:2px;align-items:center;flex-shrink:0;">${stars}</span>
                </div>
                <p style="font-size:13px;color:#374151;line-height:1.55;margin:0;flex:1;font-style:italic;">"${escHtml(f.message)}"</p>
                <div style="font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:8px;">${date}</div>
            </div>`;
        }).join("");

        // Pagination controls
        if (pagerEl) {
            if (totalPages <= 1) {
                pagerEl.innerHTML = "";
            } else {
                const btn = (label, page, disabled, active) => `
                    <button type="button" data-fb-page="${page}" ${disabled ? "disabled" : ""}
                        style="min-width:36px;height:36px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:${active ? "#1B3F6E" : "#fff"};color:${active ? "#fff" : "#374151"};font-size:13px;font-weight:600;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? "0.4" : "1"};transition:all 150ms;">${label}</button>`;
                const pages = [];
                for (let i = 1; i <= totalPages; i++) pages.push(btn(String(i), i, false, i === _fbPage));
                pagerEl.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap;">
                        <span style="font-size:12px;color:#6b7280;">
                            Showing ${start + 1}–${Math.min(start + FB_PAGE_SIZE, _fbFiltered.length)} of ${_fbFiltered.length}
                        </span>
                        <div style="display:flex;gap:6px;align-items:center;">
                            ${btn("‹", _fbPage - 1, _fbPage === 1, false)}
                            ${pages.join("")}
                            ${btn("›", _fbPage + 1, _fbPage === totalPages, false)}
                        </div>
                    </div>`;
            }
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // Pager click delegation (bound once)
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-fb-page]");
        if (!btn || btn.disabled) return;
        const p = parseInt(btn.dataset.fbPage);
        if (!isNaN(p)) { _fbPage = p; fbRenderPage(); }
    });

    // Delete feedback delegation
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-fb-delete]");
        if (!btn) return;
        const id = btn.dataset.fbDelete;
        const target = _fbAll.find(f => String(f.id) === String(id));
        if (!target) return;
        fbShowDeleteModal(target);
    });

    function fbShowDeleteModal(item) {
        let overlay = document.getElementById("fbDeleteOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "fbDeleteOverlay";
            overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;";
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:440px;box-shadow:0 24px 80px rgba(0,0,0,0.22);">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <i data-lucide="alert-triangle" style="color:#dc2626;width:22px;height:22px;"></i>
                        <h3 style="margin:0;font-size:17px;font-weight:700;">Delete this feedback?</h3>
                    </div>
                    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 14px;">
                        This will permanently remove the feedback from the database and the public landing page. This action cannot be undone.
                    </p>
                    <div id="fbDeletePreview" style="padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#374151;line-height:1.5;margin-bottom:16px;max-height:120px;overflow:auto;"></div>
                    <p id="fbDeleteErr" style="color:#dc2626;font-size:12px;margin:0 0 10px;display:none;"></p>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" id="fbDeleteCancel" style="padding:10px 18px;border:1px solid rgba(0,0,0,0.1);background:#fff;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">Cancel</button>
                        <button type="button" id="fbDeleteConfirm" style="padding:10px 18px;border:none;background:#dc2626;color:#fff;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">
                            <span class="btnLabel">Delete</span>
                            <span class="btnSpinner" hidden>…</span>
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) overlay.remove();
            });
        }

        const preview = overlay.querySelector("#fbDeletePreview");
        preview.innerHTML = `<strong>${escHtml(item.name || "Anonymous")}</strong>${item.role ? ` · ${escHtml(item.role)}` : ""}${item.rating ? ` · ${item.rating}★` : ""}<br>"${escHtml(item.message)}"`;

        const errEl = overlay.querySelector("#fbDeleteErr");
        errEl.style.display = "none";
        errEl.textContent = "";

        overlay.querySelector("#fbDeleteCancel").onclick = () => overlay.remove();

        const confirmBtn = overlay.querySelector("#fbDeleteConfirm");
        const label = confirmBtn.querySelector(".btnLabel");
        const spinner = confirmBtn.querySelector(".btnSpinner");
        confirmBtn.disabled = false;
        if (label) label.hidden = false;
        if (spinner) spinner.hidden = true;

        confirmBtn.onclick = async () => {
            confirmBtn.disabled = true;
            if (label) label.hidden = true;
            if (spinner) spinner.hidden = false;
            errEl.style.display = "none";
            try {
                await apiFetch(`/feedback/${item.id}`, { method: "DELETE" });
                _fbAll = _fbAll.filter(f => String(f.id) !== String(item.id));
                overlay.remove();
                fbApplyFilters();
            } catch (err) {
                errEl.textContent = err.message || "Failed to delete feedback.";
                errEl.style.display = "block";
                confirmBtn.disabled = false;
                if (label) label.hidden = false;
                if (spinner) spinner.hidden = true;
            }
        };

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // Chart hover tooltip — single floating bubble, delegated
    let _fbTooltipEl = null;
    function fbAttachChartTooltip() {
        if (!_fbTooltipEl) {
            _fbTooltipEl = document.createElement("div");
            _fbTooltipEl.style.cssText = "position:fixed;z-index:9999;padding:6px 10px;background:#1f2937;color:#fff;font-size:11px;font-weight:600;border-radius:6px;pointer-events:none;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transform:translate(-50%,-100%) translateY(-8px);transition:opacity 120ms;";
            document.body.appendChild(_fbTooltipEl);
        }
        document.querySelectorAll(".fb-bar-row").forEach(row => {
            row.onmouseenter = (e) => {
                _fbTooltipEl.textContent = row.dataset.tip || "";
                _fbTooltipEl.style.opacity = "1";
                row.style.background = "rgba(245,158,11,0.06)";
            };
            row.onmousemove = (e) => {
                _fbTooltipEl.style.left = e.clientX + "px";
                _fbTooltipEl.style.top = e.clientY + "px";
            };
            row.onmouseleave = () => {
                _fbTooltipEl.style.opacity = "0";
                row.style.background = "transparent";
            };
        });
    }

    // Filters
    document.getElementById("fbFilterRole")?.addEventListener("change", fbApplyFilters);
    document.getElementById("fbFilterStar")?.addEventListener("change", fbApplyFilters);

    function fbApplyFilters() {
        const role = document.getElementById("fbFilterRole")?.value || "";
        const star = parseInt(document.getElementById("fbFilterStar")?.value) || 0;
        let filtered = _fbAll;
        if (role) filtered = filtered.filter(f => fbNormalizeRole(f.role) === role);
        if (star) filtered = filtered.filter(f => f.rating === star);
        fbRender(filtered);
    }
});