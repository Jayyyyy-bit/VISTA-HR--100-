/* ─────────────────────────────────────────────────────────────
   Property-Owner/dashboard/dashboard-today.js
   Self-contained Today tab module → window.DashToday
───────────────────────────────────────────────────────────── */

window.DashToday = (() => {
    const API = "http://127.0.0.1:5000/api";
    let _bookings = [], _listings = [], _bkStatus = "ALL", _chart = null;

    // ── Utilities ────────────────────────────────────────────
    async function apiFetch(path, opts = {}) {
        const res = await fetch(`${API}${path}`, {
            credentials: "include",
            headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
            ...opts,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw data;
        return data;
    }

    const esc = s => String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    function relTime(iso) {
        if (!iso) return "";
        // Force UTC parse if no timezone info present
        const normalized = iso && !iso.includes('+') && !iso.endsWith('Z') ? iso + 'Z' : iso;
        const m = Math.floor((Date.now() - new Date(normalized)) / 60000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    const el = id => document.getElementById(id);

    // ── Main render ──────────────────────────────────────────
    async function render() {
        // Fetch fresh session so verification status is always up-to-date
        try {
            const me = await fetch("/api/auth/me", { credentials: "include" });
            const md = await me.json().catch(() => ({}));
            if (me.ok && md.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession(md);
            }
        } catch (e) { /* silent */ }

        let ownerVerified = true;
        try {
            // Run independently — don't let one 500 block the other
            const [bRes, lRes] = await Promise.allSettled([
                apiFetch("/bookings/for-owner"),
                apiFetch("/listings/mine"),
            ]);
            if (bRes.status === "fulfilled") _bookings = bRes.value.bookings || [];
            else console.warn("[DashToday] bookings load failed", bRes.reason);
            if (lRes.status === "fulfilled") {
                _listings = lRes.value.listings || [];
                ownerVerified = lRes.value.owner_verified !== false;
            } else {
                console.warn("[DashToday] listings load failed", lRes.reason);
                // Fall back to session data for verified status
                const u = window.AuthGuard?.getSession?.()?.user || {};
                ownerVerified = u.kyc_status === "APPROVED" || u.is_verified === true;
            }
        } catch (e) {
            console.error("[DashToday] load failed", e);
        }

        _renderAlerts(ownerVerified);
        _renderOwnerCard();
        _renderGreetingAndDate();
        _renderStats();
        _renderChart();
        _renderMoveIns();
        _renderBookings();
        _renderActivity();

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Alerts ───────────────────────────────────────────────
    // Track which toasts have been dismissed this session
    const _dismissed = new Set(JSON.parse(sessionStorage.getItem("vista_dismissed_toasts") || "[]"));

    function _saveDismissed() {
        try { sessionStorage.setItem("vista_dismissed_toasts", JSON.stringify([..._dismissed])); } catch { }
    }

    function _renderAlerts(ownerVerified) {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const emailOk = u.email_verified === true;
        const kycOk = ownerVerified || u.kyc_status === "APPROVED" || u.is_verified === true;

        const showEmail = !emailOk && !_dismissed.has("emailVerifyBanner");
        const showKyc = emailOk && !kycOk && !_dismissed.has("verifyBanner");

        const emailBanner = el("emailVerifyBanner");
        if (emailBanner) {
            emailBanner.hidden = !showEmail;
            if (showEmail) {
                const btn = el("emailVerifyBtn");
                if (btn) btn.href = `/auth/verify-email.html?email=${encodeURIComponent(u.email || "")}&role=OWNER`;
            }
        }

        const kycBanner = el("verifyBanner");
        if (kycBanner) kycBanner.hidden = !showKyc;

        const wrap = el("tdAlertsWrap");
        if (wrap) wrap.hidden = !showEmail && !showKyc;

        // Wire dismiss buttons (safe to call multiple times)
        document.querySelectorAll(".td-toast-close[data-dismiss]").forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.dismiss;
                _dismissed.add(id);
                _saveDismissed();
                const toast = el(id);
                if (toast) toast.hidden = true;
                // Hide wrapper if no toasts visible
                const anyVisible = [...document.querySelectorAll(".td-toast")].some(t => !t.hidden);
                const wrap = el("tdAlertsWrap");
                if (wrap) wrap.hidden = !anyVisible;
            };
        });
    }

    // ── Owner card ───────────────────────────────────────────
    function _renderOwnerCard() {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Owner";

        const avatarEl = el("sidebarAvatar");
        const nameEl = el("sidebarOwnerName");
        const badgesEl = el("sidebarBadges");

        if (avatarEl) avatarEl.textContent = (name[0] || "O").toUpperCase();
        if (nameEl) nameEl.textContent = name;

        if (badgesEl) {
            const emailOk = u.email_verified;
            const kycOk = u.kyc_status === "APPROVED" || u.is_verified;
            badgesEl.innerHTML = [
                emailOk
                    ? `<span class="td-badge-pill td-badge-pill--ok"><i data-lucide="mail-check"></i>Email verified</span>`
                    : `<span class="td-badge-pill td-badge-pill--warn"><i data-lucide="mail-warning"></i>Email unverified</span>`,
                kycOk
                    ? `<span class="td-badge-pill td-badge-pill--ok"><i data-lucide="shield-check"></i>KYC verified</span>`
                    : `<span class="td-badge-pill td-badge-pill--warn"><i data-lucide="shield-alert"></i>KYC pending</span>`,
            ].join("");
        }
    }

    // ── Greeting + date (same row) ───────────────────────────
    function _renderGreetingAndDate() {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const firstName = u.first_name || "";
        const hour = new Date().getHours();
        const tod = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

        const greetEl = el("todayGreeting");
        if (greetEl) greetEl.textContent = firstName ? `${tod}, ${firstName}` : tod;

        const dateEl = el("todayDateLabel");
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-PH", {
            weekday: "long", month: "long", day: "numeric",
        });

        const dateEl2 = el("todayDateLabel2");
        if (dateEl2) dateEl2.textContent = new Date().toLocaleDateString("en-PH", {
            month: "short", day: "numeric",
        });
    }

    // ── Inline stats bar ─────────────────────────────────────
    function _renderStats() {
        const pending = _bookings.filter(b => b.status === "PENDING").length;
        const approved = _bookings.filter(b => b.status === "APPROVED").length;
        const active = _listings.filter(l => ["DRAFT", "READY", "PUBLISHED"].includes(l.status)).length;
        const occ = active > 0 ? Math.min(100, Math.round((approved / active) * 100)) : null;

        const set = (id, val) => { const e = el(id); if (e) e.textContent = val; };
        set("statPending", pending);
        set("statApproved", approved);
        set("statListings", active);
        set("statOccupancy", occ !== null ? `${occ}%` : "—");

        // Subtle delta labels — compare to "yesterday" approximation
        // We don't have historical data per-day from backend, so we
        // show contextual sub-labels instead of fake deltas
        const pendingSubEl = el("statPendingSub");
        if (pendingSubEl) pendingSubEl.textContent = pending === 0
            ? "all clear" : `need${pending === 1 ? "s" : ""} review`;

        // badge removed from UI
        const countEl = el("bkCountPending");
        if (countEl) { countEl.textContent = pending || ""; countEl.style.display = pending ? "" : "none"; }
    }

    // ── 7-day chart ──────────────────────────────────────────
    function _renderChart() {
        const canvas = el("todayChartCanvas");
        if (!canvas || !window.Chart) return;

        // Build 7-day date labels
        const days = [];
        const labels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().slice(0, 10));
            labels.push(d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }));
        }

        // Booking activity per day (all statuses = "bookings made that day")
        const bkPerDay = days.map(day =>
            _bookings.filter(b => (b.created_at || "").slice(0, 10) === day).length
        );

        // Occupancy per day — approved bookings whose stay covers that day
        const occPerDay = days.map(day => {
            const active = _listings.filter(l => ["DRAFT", "READY", "PUBLISHED"].includes(l.status)).length;
            if (!active) return 0;
            const covering = _bookings.filter(b => {
                if (!["APPROVED", "ACTIVE"].includes(b.status)) return false;
                const from = b.move_in_date ? String(b.move_in_date).slice(0, 10) : null;
                const to = b.move_out_date ? String(b.move_out_date).slice(0, 10) : null;
                if (!from) return false;
                return day >= from && (!to || day <= to);
            }).length;
            return Math.min(100, Math.round((covering / active) * 100));
        });

        // Destroy existing chart if re-rendering
        if (_chart) { _chart.destroy(); _chart = null; }

        const ctx = canvas.getContext("2d");

        // Gradient fills
        const gradBlue = ctx.createLinearGradient(0, 0, 0, 180);
        gradBlue.addColorStop(0, "rgba(18,52,88,0.15)");
        gradBlue.addColorStop(1, "rgba(18,52,88,0)");

        const gradGreen = ctx.createLinearGradient(0, 0, 0, 180);
        gradGreen.addColorStop(0, "rgba(21,128,61,0.12)");
        gradGreen.addColorStop(1, "rgba(21,128,61,0)");

        _chart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Booking activity",
                        data: bkPerDay,
                        borderColor: "#123458",
                        backgroundColor: gradBlue,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: "#123458",
                        pointBorderColor: "#fff",
                        pointBorderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        yAxisID: "yLeft",
                    },
                    {
                        label: "Occupancy %",
                        data: occPerDay,
                        borderColor: "#15803d",
                        backgroundColor: gradGreen,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: "#15803d",
                        pointBorderColor: "#fff",
                        pointBorderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        yAxisID: "yRight",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        position: "top",
                        align: "end",
                        labels: {
                            boxWidth: 10, boxHeight: 10,
                            borderRadius: 3,
                            useBorderRadius: true,
                            font: { family: "'DM Sans', sans-serif", size: 11, weight: "600" },
                            color: "#6b7280",
                            padding: 16,
                        },
                    },
                    tooltip: {
                        backgroundColor: "#0f172a",
                        titleColor: "#fff",
                        bodyColor: "rgba(255,255,255,0.75)",
                        padding: 12,
                        cornerRadius: 10,
                        titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: "700" },
                        bodyFont: { family: "'DM Sans', sans-serif", size: 12 },
                        callbacks: {
                            label: ctx => {
                                const v = ctx.parsed.y;
                                return ctx.dataset.yAxisID === "yRight"
                                    ? ` Occupancy: ${v}%`
                                    : ` Bookings: ${v}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            color: "#9ca3af",
                        },
                    },
                    yLeft: {
                        type: "linear", position: "left",
                        min: 0,
                        grid: { color: "rgba(0,0,0,0.05)", drawBorder: false },
                        border: { display: false },
                        ticks: {
                            stepSize: 1,
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            color: "#9ca3af",
                        },
                    },
                    yRight: {
                        type: "linear", position: "right",
                        min: 0, max: 100,
                        grid: { drawOnChartArea: false },
                        border: { display: false },
                        ticks: {
                            callback: v => `${v}%`,
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            color: "#9ca3af",
                        },
                    },
                },
            },
        });
    }

    // ── Today's move-ins ─────────────────────────────────────
    function _renderMoveIns() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const moveIns = _bookings.filter(b =>
            b.status === "APPROVED" &&
            b.move_in_date &&
            String(b.move_in_date).slice(0, 10) === todayStr
        );

        const listEl = el("todayEventsList");
        if (!listEl) return;

        listEl.innerHTML = !moveIns.length
            ? `<div class="td-empty"><i data-lucide="calendar-check-2"></i><span>No move-ins today.</span></div>`
            : moveIns.map(b => {
                const tenant = esc(b.resident_name || b.resident_email || "Resident");
                const title = esc(b.listing?.title || "Untitled listing");
                return `
                    <div class="td-event-row">
                        <div class="td-event-icon"><i data-lucide="log-in"></i></div>
                        <div class="td-event-body">
                            <div class="td-event-name">${tenant}</div>
                            <div class="td-event-listing">${title}</div>
                        </div>
                        <span class="td-pill td-pill--in">Move-in</span>
                    </div>`;
            }).join("");
    }

    // ── Bookings (compact task rows) ─────────────────────────
    function _renderBookings() {
        const pending = _bookings.filter(b => b.status === "PENDING").length;
        const countEl = el("bkCountPending");
        if (countEl) { countEl.textContent = pending || ""; countEl.style.display = pending ? "" : "none"; }
        _applyFilter();
    }

    function _applyFilter() {
        const listEl = el("bookingsList");
        if (!listEl) return;

        const filtered = _bkStatus === "ALL"
            ? _bookings
            : _bookings.filter(b => b.status === _bkStatus);

        if (!filtered.length) {
            listEl.innerHTML = `
                <div class="td-empty td-empty--box">
                    <i data-lucide="calendar-x-2"></i>
                    <span>No move-in requests${_bkStatus !== "ALL" ? ` · ${_bkStatus.toLowerCase()}` : ""} yet.</span>
                </div>`;
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        listEl.innerHTML = `<div class="bk-task-list">${filtered.map(_taskRowHTML).join("")}</div>`;
        _bindActions(listEl);
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _taskRowHTML(b) {
        const listing = b.listing || {};
        const tenant = esc(b.resident_name || b.resident_email || "Resident");
        const title = esc(listing.title || "Untitled listing");
        const dotCls = {
            PENDING: "dot--pending", APPROVED: "dot--approved", ACTIVE: "dot--approved",
            COMPLETED: "dot--approved", REJECTED: "dot--rejected", CANCELLED: "dot--cancelled"
        }[b.status] || "";
        const label = {
            PENDING: "Pending", APPROVED: "Approved", ACTIVE: "Active",
            COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled"
        }[b.status] || b.status;

        const moveIn = b.move_in_date
            ? new Date(b.move_in_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
        const moveOut = b.move_out_date
            ? new Date(b.move_out_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";

        const actions = b.status === "PENDING" ? `
            <div class="bk-task-actions">
                <button class="bk-action-btn bk-action-btn--approve" data-id="${b.id}" type="button">
                    <i data-lucide="check"></i> Approve
                </button>
                <button class="bk-action-btn bk-action-btn--reject" data-id="${b.id}" type="button">
                    <i data-lucide="x"></i> Reject
                </button>
            </div>` : "";



        const price = (listing.price || b.listing?.price)
            ? `₱${Number(listing.price || b.listing?.price).toLocaleString()}/mo` : "";
        const cover = listing.cover || b.listing?.cover || null;
        const thumbEl = cover
            ? `<img class="bk-card-thumb" src="${esc(cover)}" alt="">`
            : `<div class="bk-card-thumb bk-card-thumb--ph"><i data-lucide="home"></i></div>`;

        return `
            <div class="bk-card" data-id="${b.id}">
                <div class="bk-card-main">
                    ${thumbEl}
                    <div class="bk-card-body">
                        <div class="bk-card-top">
                            <div class="bk-card-title">${title}</div>
                            <span class="bk-card-badge bk-badge--${dotCls.replace('dot--', '')}">${label}</span>
                        </div>
                        <div class="bk-card-tenant">
                            <i data-lucide="user"></i>
                            <span>${tenant}</span>
                        </div>
                        <div class="bk-card-meta">
                            <span class="bk-card-meta-item">
                                <i data-lucide="calendar"></i>${moveIn}${moveOut !== "—" ? ` → ${moveOut}` : ""}
                            </span>
                            ${price ? `<span class="bk-card-meta-item"><i data-lucide="banknote"></i>${price}</span>` : ""}
                        </div>
                    </div>
                </div>
                ${actions ? `<div class="bk-card-actions">${actions.replace('<div class="bk-task-actions">', '').replace('</div>', '')}</div>` : ""}
            </div>`;
    }

    function _bindActions(container) {

        container.querySelectorAll(".bk-action-btn--approve").forEach(btn => {
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                try {
                    await apiFetch(`/bookings/${btn.dataset.id}/status`, {
                        method: "PATCH", body: JSON.stringify({ status: "APPROVED" }),
                    });
                    render();
                } catch (e) { alert(e?.error || "Failed."); btn.disabled = false; }
            });
        });
        container.querySelectorAll(".bk-action-btn--reject").forEach(btn => {
            btn.addEventListener("click", async () => {
                const note = window.prompt("Reason for rejection (optional):", "") ?? "";
                btn.disabled = true;
                try {
                    await apiFetch(`/bookings/${btn.dataset.id}/status`, {
                        method: "PATCH", body: JSON.stringify({ status: "REJECTED", note }),
                    });
                    render();
                } catch (e) { alert(e?.error || "Failed."); btn.disabled = false; }
            });
        });
    }

    // ── Recent activity (timeline) ───────────────────────────
    function _renderActivity() {
        const listEl = el("todayActivityList");
        if (!listEl) return;

        const recent = [..._bookings]
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .filter(b => b.status !== "PENDING")
            .slice(0, 8);

        if (!recent.length) {
            listEl.innerHTML = `<div class="td-empty"><i data-lucide="activity"></i><span>No recent activity.</span></div>`;
            return;
        }

        const iMap = {
            APPROVED: { icon: "check-circle-2", cls: "approved" },
            REJECTED: { icon: "x-circle", cls: "rejected" },
            CANCELLED: { icon: "ban", cls: "cancelled" },
            ACTIVE: { icon: "home", cls: "approved" },
            COMPLETED: { icon: "flag", cls: "approved" },
        };

        listEl.innerHTML = recent.map(b => {
            const { icon, cls } = iMap[b.status] || { icon: "circle", cls: "cancelled" };
            const tenant = esc(b.resident_name || b.resident_email || "Resident");
            const listing = esc(b.listing?.title || "Untitled");
            // Use approved_at for real-time approval timestamp when available
            const timeStamp = (b.status === 'APPROVED' || b.status === 'REJECTED')
                ? (b.approved_at || b.updated_at || b.created_at)
                : (b.updated_at || b.created_at);
            const time = relTime(timeStamp);
            const label = {
                APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled",
                ACTIVE: "Moved in", COMPLETED: "Completed"
            }[b.status] || b.status;
            return `
                <div class="td-act-row">
                    <div class="td-act-icon td-act-icon--${cls}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="td-act-body">
                        <div class="td-act-main">
                            <span class="td-act-name">${tenant}</span>
                            <span class="td-act-verb">${label}</span>
                        </div>
                        <div class="td-act-meta">${listing} · ${time}</div>
                    </div>
                </div>`;
        }).join("");
    }

    // ── Filter bar ────────────────────────────────────────────
    function bindFilterBar() {
        document.querySelectorAll(".bkFilterBtn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".bkFilterBtn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                _bkStatus = btn.dataset.status || "ALL";
                _applyFilter();
                if (window.lucide?.createIcons) lucide.createIcons();
            });
        });
    }

    return { render, bindFilterBar };
})();