/* ─────────────────────────────────────────────────────────────
   Property-Owner/dashboard/dashboard-today.js
   Self-contained Today tab module → window.DashToday
───────────────────────────────────────────────────────────── */

window.DashToday = (() => {
    const API = "/api";
    let _bookings = [], _listings = [], _bkStatus = "ALL", _chart = null;
    let _movedInTarget = null;    // booking id pending moved-in confirm
    let _ownerCancelTarget = null; // booking id pending owner cancel
    let _rejectTarget = null;       // booking id pending rejection

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
        _renderSmartNotifs();

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Alerts — uses showToast() from toast.js ─────────────
    // sessionStorage tracks which alerts were already shown this session
    // so they don't spam on every render() call
    function _getAlertKey() {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        // Include iat (issued-at) from token so key changes every login
        const iat = window.AuthGuard?.getSession?.()?.iat
            || u.iat
            || u.login_time
            || "";
        return `vista_shown_alerts_${u.id || "guest"}_${iat}`;
    }

    const _shownAlerts = new Set();

    function _markShown(id) {
        _shownAlerts.add(id);
        try { sessionStorage.setItem(_getAlertKey(), JSON.stringify([..._shownAlerts])); } catch { }
    }

    function _renderAlerts(ownerVerified) {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const emailOk = u.email_verified === true;
        const kycOk = ownerVerified || u.kyc_status === "APPROVED" || u.is_verified === true;

        // Email not verified — show once per login session
        if (!emailOk && !_shownAlerts.has("emailVerify")) {
            _markShown("emailVerify");
            if (window.showToast) {
                showToast(
                    "Verify your email to unlock publishing",
                    "info",
                    0,
                    "Verify →",
                    "/auth/account-settings.html#email"
                );
            }
        }

        // KYC not verified — show once per login session (only after email is verified)
        if (emailOk && !kycOk && !_shownAlerts.has("kycVerify")) {
            _markShown("kycVerify");
            if (window.showToast) {
                showToast(
                    "Identity pending — listings hidden until approved",
                    "warning",
                    0,
                    "Verify →",
                    "/auth/account-settings.html#verification"
                );
            }
        }
    }

    // ── Smart notifications — called after bookings load ─────
    // Shows a toast for recent pending bookings (once per session per booking)
    function _renderSmartNotifs() {
        if (!window.showToast) return;

        const pending = _bookings.filter(b => b.status === "PENDING");
        pending.forEach(b => {
            const key = `booking_pending_${b.id}`;
            if (_shownAlerts.has(key)) return;
            _markShown(key);
            const tenant = b.resident_name || b.resident_email || "Someone";
            const title = b.listing?.title || "your listing";
            showToast(`<span style="font-weight:700">${tenant}</span> requested to move in to <em>${title}</em>`, "info", 8000);
        });
    }

    // ── Owner card ───────────────────────────────────────────
    function _renderOwnerCard() {
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Owner";

        const avatarEl = el("sidebarAvatar");
        const avatarImg = el("sidebarAvatarImg");
        const nameEl = el("sidebarOwnerName");
        const badgesEl = el("sidebarBadges");

        // Always set initials text as fallback
        if (avatarEl) avatarEl.textContent = (name[0] || "O").toUpperCase();

        // Show photo if avatar_url is set, otherwise show initials
        if (u.avatar_url) {
            if (avatarImg) { avatarImg.src = u.avatar_url; avatarImg.hidden = false; }
            if (avatarEl) { avatarEl.hidden = true; }
        } else {
            if (avatarImg) { avatarImg.hidden = true; avatarImg.src = ""; }
            if (avatarEl) { avatarEl.hidden = false; }
        }
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

    const BK_PAGE_SIZE = 5;
    let _bkPage = 1;

    function _applyFilter() {
        const listEl = el("bookingsList");
        if (!listEl) return;

        // ALL tab excludes terminal statuses — show active pipeline only
        const filtered = _bkStatus === "ALL"
            ? _bookings.filter(b => !["CANCELLED", "REJECTED", "COMPLETED", "MOVED_OUT", "VIEWING_DECLINED"].includes(b.status))
            : _bookings.filter(b => b.status === _bkStatus);

        _bkPage = 1;
        _renderPage(filtered);
    }

    function _renderPage(filtered) {
        const listEl = el("bookingsList");
        if (!listEl) return;

        if (!filtered.length) {
            listEl.innerHTML = `
                <div class="td-empty td-empty--box">
                    <i data-lucide="calendar-x-2"></i>
                    <span>No requests yet.</span>
                </div>`;
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        const total = filtered.length;
        const pages = Math.ceil(total / BK_PAGE_SIZE);
        const start = (_bkPage - 1) * BK_PAGE_SIZE;
        const paged = filtered.slice(start, start + BK_PAGE_SIZE);

        const paginationHTML = pages > 1 ? `
            <div class="bk-pagination">
                <button class="bk-pg-btn" id="bkPgPrev" ${_bkPage === 1 ? "disabled" : ""}>
                    <i data-lucide="chevron-left"></i>
                </button>
                <span class="bk-pg-info">${_bkPage} / ${pages}</span>
                <button class="bk-pg-btn" id="bkPgNext" ${_bkPage === pages ? "disabled" : ""}>
                    <i data-lucide="chevron-right"></i>
                </button>
            </div>` : "";

        listEl.innerHTML = `<div class="bk-task-list">${paged.map(_taskRowHTML).join("")}</div>${paginationHTML}`;
        _bindActions(listEl);

        listEl.querySelector("#bkPgPrev")?.addEventListener("click", () => {
            if (_bkPage > 1) { _bkPage--; _renderPage(filtered); if (window.lucide?.createIcons) lucide.createIcons(); }
        });
        listEl.querySelector("#bkPgNext")?.addEventListener("click", () => {
            if (_bkPage < pages) { _bkPage++; _renderPage(filtered); if (window.lucide?.createIcons) lucide.createIcons(); }
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Automated Contract Generation ───────────────────────
    // ── Automated Contract Generation ───────────────────────
    function printContract(booking) {
        // Grab the currently logged-in Property Owner's details
        const u = window.AuthGuard?.getSession?.()?.user || {};
        const ownerName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "_____________________";

        const printWindow = window.open('', '_blank');
        const dateStr = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

        // Date handling
        const moveIn = booking.move_in_date ? new Date(booking.move_in_date).toLocaleDateString('en-PH') : 'TBD';
        const moveOut = booking.move_out_date ? new Date(booking.move_out_date).toLocaleDateString('en-PH') : 'Not specified / Open-ended';

        const rent = booking.listing?.price ? `₱${Number(booking.listing.price).toLocaleString()}` : 'TBD';
        const title = booking.listing?.title || 'TBD';
        const locationStr = [booking.listing?.barangay, booking.listing?.city].filter(Boolean).join(', ');
        const residentName = booking.resident_name || booking.resident_email || '_____________________';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Lease Contract - BK-${booking.id}</title>
            <style>
                body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #000; line-height: 1.6; }
                .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
                h1 { font-size: 24px; text-transform: uppercase; margin: 0; letter-spacing: 1px; }
                .ref { font-size: 12px; color: #555; margin-top: 5px; }
                .section { margin-bottom: 24px; text-align: justify; }
                h3 { font-size: 16px; margin-bottom: 8px; text-transform: uppercase; }
                .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
                .sig-line { border-top: 1px solid #000; width: 250px; text-align: center; padding-top: 5px; font-weight: bold; }
                .sig-name { text-align: center; margin-top: 5px; font-size: 14px; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Lease Agreement</h1>
                <div class="ref">System Reference: VISTA-HR-BK-${booking.id} | Generated: ${dateStr}</div>
            </div>

            <div class="section">
                <p>This Lease Agreement is made and entered into through the VISTA-HR platform on <strong>${dateStr}</strong>, by and between:</p>
                <p><strong>Property Owner:</strong> ${ownerName}</p>
                <p><strong>Resident (Lessee):</strong> ${residentName}</p>
            </div>

            <div class="section">
                <h3>1. The Property</h3>
                <p>The Property Owner agrees to lease the property officially listed as <strong>"${title}"</strong> located at <strong>${locationStr || '_____________________'}</strong> to the Resident.</p>
            </div>

            <div class="section">
                <h3>2. Term and Rent</h3>
                <p>The lease will officially commence on <strong>${moveIn}</strong> and is scheduled to conclude on <strong>${moveOut}</strong>. The agreed monthly rental rate is <strong>${rent}</strong>, payable as stipulated in the booking terms.</p>
            </div>

            <div class="section">
                <h3>3. Platform Acknowledgment</h3>
                <p>By signing below, both parties acknowledge that this booking was initiated and approved via VISTA-HR. Both parties agree to abide by the platform's standard terms of service, dispute resolution policies, and the house rules specified in the listing.</p>
            </div>

            <div class="signature-block">
                <div>
                    <br><br><br>
                    <div class="sig-line">Property Owner Signature</div>
                    <div class="sig-name">${ownerName}</div>
                </div>
                <div>
                    <br><br><br>
                    <div class="sig-line">Resident Signature</div>
                    <div class="sig-name">${residentName}</div>
                </div>
            </div>

            <script>
                window.onload = function() { setTimeout(() => { window.print(); }, 500); };
            </script>
        </body>
        </html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    }

    function _taskRowHTML(b) {
        const listing = b.listing || {};
        const tenant = esc(b.resident_name || b.resident_email || "Resident");
        const title = esc(listing.title || "Untitled listing");
        const dotCls = {
            PENDING: "dot--pending",
            APPROVED: "dot--approved",
            VIEWING_SCHEDULED: "dot--viewing",
            VIEWING_DECLINED: "dot--rejected",
            ACTIVE: "dot--active",
            COMPLETED: "dot--approved",
            MOVED_OUT: "dot--cancelled",
            REJECTED: "dot--rejected",
            CANCELLED: "dot--cancelled",
        }[b.status] || "";
        const label = {
            PENDING: "Pending",
            APPROVED: "Approved",
            VIEWING_SCHEDULED: "Viewing Scheduled",
            VIEWING_DECLINED: "Viewing Declined",
            ACTIVE: "Occupied",
            COMPLETED: "Moved Out",
            MOVED_OUT: "Moved Out (Early)",
            REJECTED: "Rejected",
            CANCELLED: "Cancelled",
        }[b.status] || b.status;

        const moveIn = b.move_in_date
            ? new Date(b.move_in_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
        const moveOut = b.move_out_date
            ? new Date(b.move_out_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";

        // PENDING: Approve + Reject only
        const approveBtn = b.status === "PENDING"
            ? `<button class="bk-action-btn bk-action-btn--approve" data-id="${b.id}" type="button">
                    <i data-lucide="check"></i> Approve
               </button>` : "";

        const rejectBtn = b.status === "PENDING"
            ? `<button class="bk-action-btn bk-action-btn--reject" data-id="${b.id}" type="button">
                    <i data-lucide="x"></i> Reject
               </button>` : "";

        // APPROVED: Schedule Viewing only
        const scheduleViewingBtn = b.status === "APPROVED"
            ? `<button class="bk-action-btn bk-action-btn--schedule" data-id="${b.id}" type="button">
                    <i data-lucide="eye"></i> Schedule Viewing
               </button>` : "";

        // VIEWING_SCHEDULED: show viewing date + Confirm Move-in (if payment verified)
        const viewingInfo = b.status === "VIEWING_SCHEDULED" && b.viewing_date
            ? `<div class="bk-viewing-info">
                    <i data-lucide="calendar-clock"></i>
                    ${new Date(b.viewing_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    ${b.viewing_notes ? `<span class="bk-viewing-notes">— ${esc(b.viewing_notes)}</span>` : ""}
               </div>` : "";

        const confirmMoveInBtn = b.status === "VIEWING_SCHEDULED"
            ? (b.payment_verified
                ? `<button class="bk-action-btn bk-action-btn--movedin" data-id="${b.id}" type="button">
                        <i data-lucide="door-open"></i> Confirm Move-in
                   </button>`
                : (b.payment_proof_url
                    ? `<span class="bk-awaiting-payment"><i data-lucide="clock"></i> Payment submitted — awaiting verification</span>
                       <button class="bk-action-btn bk-action-btn--verify-payment" data-id="${b.id}" type="button" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">
                           <i data-lucide="check-circle-2"></i> Verify Payment
                       </button>`
                    : `<span class="bk-awaiting-payment"><i data-lucide="clock"></i> Awaiting payment proof</span>`))
            : "";

        const TERMINAL = ["CANCELLED", "REJECTED", "VIEWING_DECLINED", "MOVED_OUT", "COMPLETED"];
        const deleteBtn = TERMINAL.includes(b.status)
            ? `<button class="bk-action-btn bk-action-btn--delete" data-id="${b.id}" type="button"
                   style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">
                   <i data-lucide="trash-2"></i> Delete
               </button>` : "";

        const RECEIPT_STATUSES = ["VIEWING_SCHEDULED", "ACTIVE", "COMPLETED", "MOVED_OUT"];
        const receiptBtn = RECEIPT_STATUSES.includes(b.status)
            ? `<button class="bk-action-btn bk-action-btn--receipt" data-receipt-id="${b.id}" type="button">
                    <i data-lucide="file-text"></i> Receipt
               </button>` : "";

        const printContractBtn = ["APPROVED", "ACTIVE"].includes(b.status)
            ? `<button class="bk-action-btn bk-action-btn--print" data-print-id="${b.id}" type="button">
                    <i data-lucide="printer"></i> Print Contract
               </button>` : "";


        const price = (listing.price || b.listing?.price)
            ? `₱${Number(listing.price || b.listing?.price).toLocaleString()}/mo` : "";
        const cover = listing.cover || b.listing?.cover || null;
        const thumbEl = cover
            ? `<img class="bk-card-thumb" src="${esc(cover)}" alt="">`
            : `<div class="bk-card-thumb bk-card-thumb--ph"><i data-lucide="home"></i></div>`;

        const hasActions = approveBtn || rejectBtn || scheduleViewingBtn || viewingInfo || confirmMoveInBtn || receiptBtn || deleteBtn || printContractBtn;

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
                ${viewingInfo}
                ${hasActions ? `<div class="bk-card-actions">
                    ${approveBtn}
                    ${rejectBtn}
                    ${scheduleViewingBtn}
                    ${confirmMoveInBtn}
                    ${printContractBtn} ${receiptBtn}
                    ${deleteBtn}
                </div>` : ""}
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
                    if (window.showToast) showToast("Booking approved!", "success");
                } catch (e) {
                    if (window.showToast) showToast(e?.error || "Failed.", "error");
                    btn.disabled = false;
                }
            });
        });
        container.querySelectorAll(".bk-action-btn--reject").forEach(btn => {
            btn.addEventListener("click", () => {
                _rejectTarget = Number(btn.dataset.id);
                _openRejectModal();
            });
        });

        // Receipt buttons
        container.querySelectorAll(".bk-action-btn--receipt").forEach(btn => {
            btn.addEventListener("click", () => _openReceipt(Number(btn.dataset.receiptId)));
        });

        container.querySelectorAll(".bk-action-btn--print").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = Number(btn.dataset.printId);
                const booking = _bookings.find(x => x.id === id);
                if (booking) printContract(booking);
            });
        });

        // Schedule Viewing buttons (APPROVED → VIEWING_SCHEDULED)
        container.querySelectorAll(".bk-action-btn--schedule").forEach(btn => {
            btn.addEventListener("click", () => {
                if (window.openScheduleViewingModal) {
                    openScheduleViewingModal(Number(btn.dataset.id));
                }
            });
        });

        // Confirm Move-in buttons (VIEWING_SCHEDULED → ACTIVE, payment_verified required)
        container.querySelectorAll(".bk-action-btn--movedin").forEach(btn => {
            btn.addEventListener("click", () => {
                _movedInTarget = Number(btn.dataset.id);
                _openMovedInModal();
            });
        });

        container.querySelectorAll(".bk-action-btn--verify-payment").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = Number(btn.dataset.id);
                const booking = _bookings.find(x => x.id === id);
                if (booking) _openPaymentProofModal(booking);
            });
        });

        // Delete terminal booking
        container.querySelectorAll(".bk-action-btn--delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = Number(btn.dataset.id);
                if (!window.DashModal?.open) return;
                window.DashModal.open({
                    title: "Delete this record?",
                    message: "This will remove it from your booking history.",
                    confirmText: "Delete",
                    cancelText: "Cancel",
                    danger: true,
                    onConfirm: async () => {
                        try {
                            await apiFetch(`/bookings/${id}/owner-delete`, { method: "DELETE" });
                            render();
                            if (window.showSuccess) showSuccess("Record deleted.");
                        } catch (e) {
                            if (window.showToast) showToast(e?.error || "Failed.", "error");
                        }
                    },
                });
            });
        });
    }

    // ── Reject confirm modal ────────────────────────────────
    function _openRejectModal() {
        const overlay = document.getElementById("rejectOverlay");
        if (!overlay) return;
        document.getElementById("rejectNote").value = "";
        overlay.hidden = false;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        document.getElementById("rejectNote")?.focus();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _closeRejectModal() {
        const overlay = document.getElementById("rejectOverlay");
        if (overlay) { overlay.classList.remove("open"); overlay.hidden = true; }
        document.body.style.overflow = "";
        _rejectTarget = null;
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("rejectDismissBtn")?.addEventListener("click", _closeRejectModal);
        document.getElementById("rejectOverlay")?.addEventListener("click", e => {
            if (e.target.id === "rejectOverlay") _closeRejectModal();
        });
        document.getElementById("rejectConfirmBtn")?.addEventListener("click", async () => {
            if (!_rejectTarget) return;
            const note = document.getElementById("rejectNote")?.value.trim() || null;
            const btn = document.getElementById("rejectConfirmBtn");
            const label = btn.querySelector(".btnLabel");
            const spinner = btn.querySelector(".btnSpinner");
            btn.disabled = true;
            if (label) label.hidden = true;
            if (spinner) spinner.hidden = false;
            try {
                await apiFetch(`/bookings/${_rejectTarget}/status`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "REJECTED", note }),
                });
                _closeRejectModal();
                render();
                if (window.showToast) showToast("Booking rejected.", "success");
            } catch (e) {
                _closeRejectModal();
                if (window.showToast) showToast(e?.error || "Failed to reject.", "error");
            } finally {
                btn.disabled = false;
                if (label) label.hidden = false;
                if (spinner) spinner.hidden = true;
            }
        });
    });

    // ── Owner Cancel confirm modal ──────────────────────────
    function _openOwnerCancelModal() {
        const overlay = document.getElementById("ownerCancelOverlay");
        if (!overlay) return;
        document.getElementById("ownerCancelNote").value = "";
        overlay.hidden = false;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        document.getElementById("ownerCancelNote")?.focus();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _closeOwnerCancelModal() {
        const overlay = document.getElementById("ownerCancelOverlay");
        if (overlay) { overlay.classList.remove("open"); overlay.hidden = true; }
        document.body.style.overflow = "";
        _ownerCancelTarget = null;
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("ownerCancelDismissBtn")?.addEventListener("click", _closeOwnerCancelModal);
        document.getElementById("ownerCancelOverlay")?.addEventListener("click", e => {
            if (e.target.id === "ownerCancelOverlay") _closeOwnerCancelModal();
        });
        document.getElementById("ownerCancelConfirmBtn")?.addEventListener("click", async () => {
            if (!_ownerCancelTarget) return;
            const note = document.getElementById("ownerCancelNote")?.value.trim() || null;
            const btn = document.getElementById("ownerCancelConfirmBtn");
            const label = btn.querySelector(".btnLabel");
            const spinner = btn.querySelector(".btnSpinner");
            btn.disabled = true;
            if (label) label.hidden = true;
            if (spinner) spinner.hidden = false;
            try {
                await apiFetch(`/bookings/${_ownerCancelTarget}/owner-cancel`, {
                    method: "POST",
                    body: JSON.stringify({ note }),
                });
                _closeOwnerCancelModal();
                render();
                if (window.showToast) showToast("Reservation cancelled.", "success");
            } catch (e) {
                _closeOwnerCancelModal();
                if (window.showToast) showToast(e?.error || "Failed to cancel.", "error");
            } finally {
                btn.disabled = false;
                if (label) label.hidden = false;
                if (spinner) spinner.hidden = true;
            }
        });
    });

    // ── Moved In confirm modal ───────────────────────────────
    function _openMovedInModal() {
        const overlay = document.getElementById("movedInOverlay");
        if (!overlay) return;
        overlay.hidden = false;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _closeMovedInModal() {
        const overlay = document.getElementById("movedInOverlay");
        if (overlay) { overlay.classList.remove("open"); overlay.hidden = true; }
        document.body.style.overflow = "";
        _movedInTarget = null;
    }

    // Bind movedIn modal buttons (early — safe on all tabs)
    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("movedInCancelBtn")?.addEventListener("click", _closeMovedInModal);
        document.getElementById("movedInOverlay")?.addEventListener("click", e => {
            if (e.target.id === "movedInOverlay") _closeMovedInModal();
        });
        document.getElementById("movedInConfirmBtn")?.addEventListener("click", async () => {
            if (!_movedInTarget) return;
            const btn = document.getElementById("movedInConfirmBtn");
            const label = btn.querySelector(".btnLabel");
            const spinner = btn.querySelector(".btnSpinner");
            btn.disabled = true;
            if (label) label.hidden = true;
            if (spinner) spinner.hidden = false;
            try {
                await apiFetch(`/bookings/${_movedInTarget}/status`, {
                    method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }),
                });
                _closeMovedInModal();
                render();
                if (window.showToast) showToast("Resident marked as moved in!", "success");
            } catch (e) {
                _closeMovedInModal();
                if (window.showToast) showToast(e?.error || "Failed to update status.", "error");
            } finally {
                btn.disabled = false;
                if (label) label.hidden = false;
                if (spinner) spinner.hidden = true;
            }
        });
    });

    // ── Receipt modal ────────────────────────────────────────
    async function _openReceipt(bookingId) {
        const overlay = document.getElementById("receiptOverlay");
        const content = document.getElementById("receiptContent");
        if (!overlay || !content) return;

        content.innerHTML = `<div class="receiptLoading">Loading receipt…</div>`;
        overlay.hidden = false;          // clear html hidden attr
        overlay.classList.add("open");   // CSS uses .open not hidden
        document.body.style.overflow = "hidden";

        try {
            const data = await apiFetch(`/bookings/${bookingId}/receipt`);
            const r = data.receipt;
            content.innerHTML = `
                <div class="rcpt-brand">
                    <div class="rcpt-brand-name">VISTA-HR</div>
                    <div class="rcpt-brand-sub">Reservation Receipt</div>
                </div>
                <div class="rcpt-ref">${esc(r.reference)}</div>
                <div class="rcpt-grid">
                    <div class="rcpt-full">
                        <div class="rcpt-field-label">Resident</div>
                        <div class="rcpt-field-value">${esc(r.resident_name)}</div>
                    </div>
                    <hr class="rcpt-divider">
                    <div class="rcpt-full">
                        <div class="rcpt-field-label">Listing</div>
                        <div class="rcpt-field-value">${esc(r.listing_title)}</div>
                    </div>
                    <div class="rcpt-full">
                        <div class="rcpt-field-label">Address</div>
                        <div class="rcpt-field-value">${esc(r.listing_address)}</div>
                    </div>
                    <div>
                        <div class="rcpt-field-label">Property Owner</div>
                        <div class="rcpt-field-value">${esc(r.owner_name)}</div>
                    </div>
                    <div>
                        <div class="rcpt-field-label">Status</div>
                        <div class="rcpt-field-value">${esc(r.status)}</div>
                    </div>
                    <hr class="rcpt-divider">
                    <div>
                        <div class="rcpt-field-label">Move-in Date</div>
                        <div class="rcpt-field-value">${r.move_in_date ? new Date(r.move_in_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
                    </div>
                    <div>
                        <div class="rcpt-field-label">Monthly Rent</div>
                        <div class="rcpt-field-value">${r.monthly_rent ? "₱" + Number(r.monthly_rent).toLocaleString() : "—"}</div>
                    </div>
                    <div>
                        <div class="rcpt-field-label">Date Approved</div>
                        <div class="rcpt-field-value">${r.approved_at ? new Date(r.approved_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
                    </div>
                    <div>
                        <div class="rcpt-field-label">Date Requested</div>
                        <div class="rcpt-field-value">${r.created_at ? new Date(r.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}</div>
                    </div>
                    <div class="rcpt-footer-note">
                        This receipt was generated by VISTA-HR. For concerns, contact the resident.
                    </div>
                </div>`;
        } catch (err) {
            content.innerHTML = `<div class="receiptLoading" style="color:#dc2626;">${esc(err?.error || err?.message || "Failed to load receipt.")}</div>`;
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _closeReceipt() {
        const overlay = document.getElementById("receiptOverlay");
        if (overlay) { overlay.classList.remove("open"); overlay.hidden = true; }
        document.body.style.overflow = "";
    }

    // ── Payment Proof modal ──────────────────────────────────
    let _paymentProofTarget = null;

    function _openPaymentProofModal(booking) {
        const overlay = document.getElementById("paymentProofOverlay");
        const img = document.getElementById("paymentProofImg");
        const noImg = document.getElementById("paymentProofNoImg");
        if (!overlay || !img || !noImg) return;

        _paymentProofTarget = booking.id;

        if (booking.payment_proof_url) {
            img.src = booking.payment_proof_url;
            img.style.display = "block";
            noImg.style.display = "none";
        } else {
            img.src = "";
            img.style.display = "none";
            noImg.style.display = "flex";
        }

        overlay.hidden = false;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function _closePaymentProofModal() {
        const overlay = document.getElementById("paymentProofOverlay");
        if (overlay) { overlay.classList.remove("open"); overlay.hidden = true; }
        document.body.style.overflow = "";
        _paymentProofTarget = null;
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("paymentProofDismissBtn")?.addEventListener("click", _closePaymentProofModal);
        document.getElementById("paymentProofOverlay")?.addEventListener("click", e => {
            if (e.target.id === "paymentProofOverlay") _closePaymentProofModal();
        });

        document.getElementById("paymentProofApproveBtn")?.addEventListener("click", async () => {
            if (!_paymentProofTarget) return;
            const btn = document.getElementById("paymentProofApproveBtn");
            btn.disabled = true;
            try {
                await apiFetch(`/bookings/${_paymentProofTarget}/verify-payment`, {
                    method: "PATCH",
                    body: JSON.stringify({ verified: true }),
                });
                _closePaymentProofModal();
                render();
                if (window.showSuccess) showSuccess("Payment verified! You can now confirm move-in.");
            } catch (e) {
                if (window.showToast) showToast(e?.error || "Failed to verify payment.", "error");
                btn.disabled = false;
            }
        });

        document.getElementById("paymentProofRejectBtn")?.addEventListener("click", async () => {
            if (!_paymentProofTarget) return;
            const btn = document.getElementById("paymentProofRejectBtn");
            btn.disabled = true;
            try {
                await apiFetch(`/bookings/${_paymentProofTarget}/verify-payment`, {
                    method: "PATCH",
                    body: JSON.stringify({ verified: false }),
                });
                _closePaymentProofModal();
                render();
                if (window.showToast) showToast("Payment marked as rejected. Resident notified.", "warning");
            } catch (e) {
                if (window.showToast) showToast(e?.error || "Failed.", "error");
                btn.disabled = false;
            }
        });
    });

    // Receipt modal event listeners (safe to bind early — elements may not exist yet on other tabs)
    document.addEventListener("click", (e) => {
        if (e.target.id === "receiptClose" || e.target.id === "receiptCloseBtn") _closeReceipt();
        if (e.target.id === "receiptPrintBtn") window.print();
        if (e.target.id === "receiptOverlay") _closeReceipt();
    });

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
                APPROVED: "Reserved", REJECTED: "Rejected", CANCELLED: "Cancelled",
                ACTIVE: "Occupied", COMPLETED: "Moved Out"
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

    // Expose schedule viewing modal globally so property-owner-dashboard.js can call it
    let _schedPika = null;

    window.openScheduleViewingModal = function (bookingId) {
        try {
            // Inject fields into modalExtra
            const extraEl = document.getElementById("modalExtra");
            if (extraEl) extraEl.innerHTML = `
            <div style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem">
                <label style="font-size:0.8rem;font-weight:600;color:#374151">Viewing Date</label>
                <input type="text" id="viewingDateDisplay" readonly placeholder="Pick a date"
                    style="padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;width:100%;box-sizing:border-box;cursor:pointer;background:#fff">
                <input type="hidden" id="viewingDateInput">
                <label style="font-size:0.8rem;font-weight:600;color:#374151">Time</label>
                <input type="time" id="viewingTimeInput" value="10:00"
                    style="padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;width:100%;box-sizing:border-box">
                <label style="font-size:0.8rem;font-weight:600;color:#374151">Notes <span style="font-weight:400;color:#9ca3af">(optional)</span></label>
                <input type="text" id="viewingNotesInput" placeholder="e.g. Bring valid ID"
                    style="padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;width:100%;box-sizing:border-box">
            </div>`;

            // Init Pikaday once after DOM is ready
            if (_schedPika) { _schedPika.destroy(); _schedPika = null; }
            const today = new Date(); today.setHours(0, 0, 0, 0);
            setTimeout(() => {
                const displayField = document.getElementById("viewingDateDisplay");
                if (!displayField || !window.Pikaday) return;
                _schedPika = new Pikaday({
                    field: displayField,
                    minDate: today,
                    toString: d => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
                    onSelect(d) {
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const day = String(d.getDate()).padStart(2, "0");
                        document.getElementById("viewingDateInput").value = `${y}-${m}-${day}`;
                    },
                });
            }, 50);

            const _callModal = window.DashModal?.open;
            if (!_callModal) {
                // Fallback: build a simple inline modal using the existing overlay elements
                const mOverlay = document.getElementById("modalOverlay");
                const mTitle = document.getElementById("modalTitle");
                const mMsg = document.getElementById("modalMessage");
                const mConfirm = document.getElementById("modalConfirm");
                const mCancel = document.getElementById("modalCancel");
                if (!mOverlay || !mConfirm) return;

                if (mTitle) mTitle.textContent = "Schedule Viewing";
                if (mMsg) mMsg.textContent = "Set a viewing date and time for the resident.";
                if (mConfirm) mConfirm.textContent = "Schedule";
                if (mCancel) mCancel.textContent = "Cancel";

                const cleanup = () => {
                    mOverlay.classList.remove("open");
                    mOverlay.setAttribute("aria-hidden", "true");
                    mConfirm.onclick = null;
                    mCancel.onclick = null;
                };
                mConfirm.onclick = async () => {
                    cleanup();
                    const dateVal = document.getElementById("viewingDateInput")?.value;
                    const timeVal = document.getElementById("viewingTimeInput")?.value || "10:00";
                    const notesVal = (document.getElementById("viewingNotesInput")?.value || "").trim() || null;
                    if (!dateVal) { if (window.showError) showError("Please pick a date."); return; }
                    const viewingDatetime = `${dateVal}T${timeVal}`;
                    try {
                        await apiFetch(`/bookings/${bookingId}/status`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "VIEWING_SCHEDULED", viewing_date: viewingDatetime, viewing_notes: notesVal }),
                        });
                        if (window.showSuccess) showSuccess("Viewing scheduled! Resident has been notified.");
                        render();
                    } catch (e) {
                        if (window.showError) showError(e?.error || "Failed to schedule viewing.");
                    }
                };
                mCancel.onclick = cleanup;
                mOverlay.classList.add("open");
                mOverlay.setAttribute("aria-hidden", "false");
                return;
            }

            _callModal({
                title: "Schedule Viewing",
                message: "Set a viewing date and time for the resident.",
                confirmText: "Schedule",
                cancelText: "Cancel",
                onConfirm: async () => {
                    const dateVal = document.getElementById("viewingDateInput")?.value;
                    const timeVal = document.getElementById("viewingTimeInput")?.value || "10:00";
                    const notesVal = (document.getElementById("viewingNotesInput")?.value || "").trim() || null;
                    if (!dateVal) { if (window.showError) showError("Please pick a date."); return; }
                    const viewingDatetime = `${dateVal}T${timeVal}`;
                    try {
                        await apiFetch(`/bookings/${bookingId}/status`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "VIEWING_SCHEDULED", viewing_date: viewingDatetime, viewing_notes: notesVal }),
                        });
                        if (window.showSuccess) showSuccess("Viewing scheduled! Resident has been notified.");
                        render();
                    } catch (e) {
                        if (window.showError) showError(e?.error || "Failed to schedule viewing.");
                    }
                },
            });
        } catch (err) { console.error("[openScheduleViewingModal]", err); }
    };

    return { render, bindFilterBar };
})();