/* Resident/my-bookings.js */
(() => {
    const API = "/api";

    let _all = [];
    let _status = "ALL";
    let _cancelTarget = null;
    let _page = 1;
    const PAGE_SIZE = 5;

    const STATUS_MAP = {
        PENDING: { label: "Pending", cls: "bc-status--pending" },
        APPROVED: { label: "Approved", cls: "bc-status--approved" },
        VIEWING_SCHEDULED: { label: "Viewing Scheduled", cls: "bc-status--viewing" },
        VIEWING_DECLINED: { label: "Viewing Declined", cls: "bc-status--cancelled" },
        ACTIVE: { label: "Occupied", cls: "bc-status--active" },
        COMPLETED: { label: "Moved Out", cls: "bc-status--completed" },
        MOVED_OUT: { label: "Moved Out (Early)", cls: "bc-status--moved-out" },
        REJECTED: { label: "Rejected", cls: "bc-status--rejected" },
        CANCELLED: { label: "Cancelled", cls: "bc-status--cancelled" },
    };

    const STATUS_TOASTS = {
        APPROVED: { msg: "Your booking was approved!", type: "success" },
        VIEWING_SCHEDULED: { msg: "Your viewing has been scheduled. Check your booking for details.", type: "info" },
        VIEWING_DECLINED: { msg: "You declined the viewing. You may rebook after 1 day.", type: "warning" },
        REJECTED: { msg: "Your booking request was rejected.", type: "error" },
        ACTIVE: { msg: "You've been moved in. Welcome home!", type: "success" },
        COMPLETED: { msg: "Your stay has ended. Thanks for using VISTA-HR!", type: "info" },
        MOVED_OUT: { msg: "Move-out recorded successfully.", type: "info" },
        CANCELLED: { msg: "Your booking was cancelled.", type: "warning" },
    };

    let _prevStatuses = {};
    const _reviewedBookings = new Set(
        JSON.parse(sessionStorage.getItem("_vhReviewed") || "[]")
    );

    // ── Boot ─────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", async () => {
        if (!window.AuthGuard) { location.href = "/auth/login.html"; return; }
        const me = await window.AuthGuard.fetchMe();
        if (!me.ok || me.data?.user?.role !== "RESIDENT") {
            location.href = "/auth/login.html"; return;
        }

        setupFilterTabs();
        setupModal();
        setupReviewModal();
        await loadBookings();
        setInterval(pollStatusChanges, 30000);
    });

    // ── Load bookings ─────────────────────────────────────────
    async function loadBookings() {
        showSkeleton();
        try {
            const res = await fetch(`${API}/bookings/mine`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to load bookings.");
            _all = data.bookings || [];
            // seed prev statuses on first load
            _all.forEach(b => { _prevStatuses[b.id] = b.status; });
        } catch (err) {
            showError(err.message);
            return;
        }
        updatePageSub();
        updatePendingBadge();
        renderList();
        // Update count on initial load
        const countEl = document.getElementById("statusFilterCount");
        if (countEl) countEl.textContent = `${_all.length} result${_all.length !== 1 ? "s" : ""}`;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function updatePageSub() {
        const el = document.getElementById("pageSub");
        if (!el) return;
        const total = _all.length;
        const pending = _all.filter(b => b.status === "PENDING").length;
        if (!total) { el.textContent = "No reservations yet."; return; }
        el.textContent = `${total} reservation${total !== 1 ? "s" : ""}${pending ? ` · ${pending} pending` : ""}`;
    }

    function updatePendingBadge() {
        const count = _all.filter(b => b.status === "PENDING").length;
        const badge = document.getElementById("countPending");
        if (!badge) return;
        badge.textContent = count;
        badge.hidden = count === 0;
    }

    // ── Filter tabs ───────────────────────────────────────────
    // ── Primary toggle (Bookings | Transactions) ──────────────
    let _activeView = "bookings";

    function setupFilterTabs() {
        // Primary toggle
        document.querySelectorAll(".toggleBtn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".toggleBtn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                _activeView = btn.dataset.view;
                _page = 1;

                const bookingsControls = document.getElementById("bookingsControls");
                const bookingList = document.getElementById("bookingList");
                const txList = document.getElementById("transactionList");

                if (_activeView === "bookings") {
                    bookingsControls.hidden = false;
                    bookingList.hidden = false;
                    txList.hidden = true;
                    renderList();
                } else {
                    bookingsControls.hidden = true;
                    bookingList.hidden = true;
                    txList.hidden = false;
                    renderTransactions();
                }
            });
        });

        // Status dropdown
        document.getElementById("statusSelect")?.addEventListener("change", e => {
            _status = e.target.value;
            _page = 1;
            renderList();
        });
    }

    // ── Transactions view ─────────────────────────────────────
    function renderTransactions() {
        const list = document.getElementById("transactionList");
        if (!list) return;

        // Filter bookings that have payment proof or are in payment-relevant statuses
        const txBookings = _all.filter(b =>
            b.payment_proof_url ||
            ["VIEWING_SCHEDULED", "ACTIVE", "COMPLETED", "MOVED_OUT"].includes(b.status)
        );

        if (!txBookings.length) {
            list.innerHTML = `<div class="tx-empty">
                <i data-lucide="receipt" style="width:36px;height:36px;opacity:.3;display:block;margin:0 auto 10px;"></i>
                No payment transactions yet.
            </div>`;
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        list.innerHTML = txBookings.map(b => {
            const listing = b.listing || {};
            const price = listing.price
                ? `₱${Number(listing.price).toLocaleString()}/mo`
                : "—";
            const area = [listing.barangay, listing.city].filter(Boolean).join(", ") || "—";
            const date = b.move_in_date
                ? new Date(b.move_in_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                : b.created_at
                    ? new Date(b.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                    : "—";

            let iconCls, statusCls, statusLabel, iconName;
            if (b.payment_verified) {
                iconCls = "tx-icon--verified"; statusCls = "tx-status--verified";
                statusLabel = "Payment verified"; iconName = "check-circle-2";
            } else if (b.payment_proof_url) {
                iconCls = "tx-icon--pending"; statusCls = "tx-status--pending";
                statusLabel = "Awaiting verification"; iconName = "clock";
            } else if (["CANCELLED", "REJECTED"].includes(b.status)) {
                iconCls = "tx-icon--rejected"; statusCls = "tx-status--rejected";
                statusLabel = "No payment"; iconName = "x-circle";
            } else {
                iconCls = "tx-icon--none"; statusCls = "tx-status--none";
                statusLabel = "Pending payment"; iconName = "upload-cloud";
            }

            const canViewReceipt = ["VIEWING_SCHEDULED", "ACTIVE", "COMPLETED", "MOVED_OUT"].includes(b.status);

            return `<div class="tx-card">
                <div class="tx-icon ${iconCls}">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="tx-body">
                    <div class="tx-title">${esc(listing.title || "Untitled listing")}</div>
                    <div class="tx-meta">${esc(area)} · ${date}</div>
                </div>
                <div class="tx-right">
                    <div class="tx-amount">${price}</div>
                    <span class="tx-status ${statusCls}">${statusLabel}</span>
                </div>
                ${canViewReceipt ? `
                <button class="tx-view-btn" data-receipt-id="${b.id}" style="
                    display:inline-flex;align-items:center;gap:5px;
                    padding:6px 14px;border-radius:8px;border:1px solid #e5e7eb;
                    background:#fff;font-size:12px;font-weight:600;color:#374151;
                    cursor:pointer;white-space:nowrap;flex-shrink:0;
                    font-family:inherit;transition:background 120ms;">
                    <i data-lucide="file-text" style="width:13px;height:13px;"></i> View
                </button>` : ""}
            </div>`;
        }).join("");

        list.querySelectorAll(".tx-view-btn").forEach(btn => {
            btn.addEventListener("click", () => openReceipt(Number(btn.dataset.receiptId)));
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Render list ───────────────────────────────────────────
    function renderList() {
        const list = document.getElementById("bookingList");
        if (!list) return;

        const filtered = _status === "ALL"
            ? _all
            : _all.filter(b => b.status === _status);

        if (!filtered.length) {
            list.innerHTML = emptyStateHTML(_status);
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        const total = filtered.length;
        const pages = Math.ceil(total / PAGE_SIZE);
        _page = Math.min(_page, pages);
        const start = (_page - 1) * PAGE_SIZE;
        const paged = filtered.slice(start, start + PAGE_SIZE);

        const paginationHTML = pages > 1 ? `
            <div class="bk-pagination" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:16px 0 4px">
                <button class="bk-pg-btn" id="mbPgPrev" ${_page === 1 ? "disabled" : ""} style="width:32px;height:32px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                    <i data-lucide="chevron-left"></i>
                </button>
                <span style="font-size:13px;font-weight:600;color:#6b7280">${_page} / ${pages}</span>
                <button class="bk-pg-btn" id="mbPgNext" ${_page === pages ? "disabled" : ""} style="width:32px;height:32px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                    <i data-lucide="chevron-right"></i>
                </button>
            </div>` : "";

        list.innerHTML = paged.map((b, i) => bookingCardHTML(b, i)).join("") + paginationHTML;
        // Update count label
        const countEl = document.getElementById("statusFilterCount");
        if (countEl) countEl.textContent = `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`;

        list.querySelector("#mbPgPrev")?.addEventListener("click", () => { _page--; renderList(); });
        list.querySelector("#mbPgNext")?.addEventListener("click", () => { _page++; renderList(); });

        list.querySelectorAll("[data-cancel-id]").forEach(btn => {
            btn.addEventListener("click", () => openCancelModal(Number(btn.dataset.cancelId), btn.dataset.cancelTitle));
        });
        list.querySelectorAll("[data-receipt-id]").forEach(btn => {
            btn.addEventListener("click", () => openReceipt(Number(btn.dataset.receiptId)));
        });
        list.querySelectorAll("[data-moveout-id]").forEach(btn => {
            btn.addEventListener("click", () => openMoveOutModal(Number(btn.dataset.moveoutId), btn.dataset.moveoutTitle));
        });
        list.querySelectorAll(".bc-proof-upload-btn").forEach(btn => {
            btn.addEventListener("click", () => openProofModal(Number(btn.dataset.proofId)));
        });
        list.querySelectorAll(".bc-review-btn").forEach(btn => {
            btn.addEventListener("click", () => openReviewModal(Number(btn.dataset.bookingId), btn.dataset.trigger));
        });
        list.querySelectorAll(".bc-view-confirm-btn").forEach(btn => {
            btn.addEventListener("click", () => confirmViewing(Number(btn.dataset.bookingId)));
        });
        list.querySelectorAll("[data-delete-id]").forEach(btn => {
            btn.addEventListener("click", () => openDeleteBookingModal(Number(btn.dataset.deleteId)));
        });
        list.querySelectorAll(".bc-view-decline-btn").forEach(btn => {
            btn.addEventListener("click", () => openDeclineViewingModal(Number(btn.dataset.bookingId)));
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Booking status timeline ───────────────────────────────
    function bookingTimelineHTML(status) {
        const steps = ["PENDING", "APPROVED", "VIEWING_SCHEDULED", "ACTIVE", "COMPLETED"];
        const labels = ["Requested", "Approved", "Viewing", "Moved In", "Moved Out"];
        const terminal = ["CANCELLED", "REJECTED"].includes(status);
        const earlyOut = status === "MOVED_OUT";

        if (terminal) {
            const icon = status === "REJECTED" ? "x-circle" : "ban";
            const label = status === "REJECTED" ? "Rejected" : "Cancelled";
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="${icon}" class="bc-tl-fail-icon"></i>
                <span class="bc-tl-fail-label">${label}</span>
            </div>`;
        }

        if (earlyOut) {
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="log-out" class="bc-tl-fail-icon" style="color:#ea580c"></i>
                <span class="bc-tl-fail-label" style="color:#ea580c">Moved Out (Early)</span>
            </div>`;
        }

        if (status === "VIEWING_DECLINED") {
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="x-circle" class="bc-tl-fail-icon" style="color:#dc2626"></i>
                <span class="bc-tl-fail-label" style="color:#dc2626">Viewing Declined</span>
            </div>`;
        }

        const curIdx = steps.indexOf(status);
        const html = steps.map((s, i) => {
            const cls = i < curIdx ? "done" : i === curIdx ? "current" : "future";
            return `<div class="bc-tl-step bc-tl-step--${cls}">
                        <div class="bc-tl-dot"></div>
                        <div class="bc-tl-label">${labels[i]}</div>
                    </div>${i < steps.length - 1 ? '<div class="bc-tl-bar"></div>' : ""}`;
        }).join("");

        return `<div class="bc-timeline">${html}</div>`;
    } function bookingTimelineHTML(status) {
        const steps = ["PENDING", "APPROVED", "VIEWING_SCHEDULED", "ACTIVE", "COMPLETED"];
        const labels = ["Requested", "Approved", "Viewing", "Moved In", "Moved Out"];
        const terminal = ["CANCELLED", "REJECTED"].includes(status);
        const earlyOut = status === "MOVED_OUT";

        if (terminal) {
            const icon = status === "REJECTED" ? "x-circle" : "ban";
            const label = status === "REJECTED" ? "Rejected" : "Cancelled";
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="${icon}" class="bc-tl-fail-icon"></i>
                <span class="bc-tl-fail-label">${label}</span>
            </div>`;
        }

        if (earlyOut) {
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="log-out" class="bc-tl-fail-icon" style="color:#ea580c"></i>
                <span class="bc-tl-fail-label" style="color:#ea580c">Moved Out (Early)</span>
            </div>`;
        }

        const curIdx = steps.indexOf(status);
        const html = steps.map((s, i) => {
            const cls = i < curIdx ? "done" : i === curIdx ? "current" : "future";
            return `<div class="bc-tl-step bc-tl-step--${cls}">
                        <div class="bc-tl-dot"></div>
                        <div class="bc-tl-label">${labels[i]}</div>
                    </div>${i < steps.length - 1 ? '<div class="bc-tl-bar"></div>' : ""}`;
        }).join("");

        return `<div class="bc-timeline">${html}</div>`;
    } function bookingTimelineHTML(status) {
        const steps = ["PENDING", "APPROVED", "VIEWING_SCHEDULED", "ACTIVE", "COMPLETED"];
        const labels = ["Requested", "Approved", "Viewing", "Moved In", "Moved Out"];
        const terminal = ["CANCELLED", "REJECTED"].includes(status);
        const earlyOut = status === "MOVED_OUT";

        if (terminal) {
            const icon = status === "REJECTED" ? "x-circle" : "ban";
            const label = status === "REJECTED" ? "Rejected" : "Cancelled";
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="${icon}" class="bc-tl-fail-icon"></i>
                <span class="bc-tl-fail-label">${label}</span>
            </div>`;
        }

        if (earlyOut) {
            return `<div class="bc-timeline bc-timeline--fail">
                <i data-lucide="log-out" class="bc-tl-fail-icon" style="color:#ea580c"></i>
                <span class="bc-tl-fail-label" style="color:#ea580c">Moved Out (Early)</span>
            </div>`;
        }

        const curIdx = steps.indexOf(status);
        const html = steps.map((s, i) => {
            const cls = i < curIdx ? "done" : i === curIdx ? "current" : "future";
            return `<div class="bc-tl-step bc-tl-step--${cls}">
                        <div class="bc-tl-dot"></div>
                        <div class="bc-tl-label">${labels[i]}</div>
                    </div>${i < steps.length - 1 ? '<div class="bc-tl-bar"></div>' : ""}`;
        }).join("");

        return `<div class="bc-timeline">${html}</div>`;
    }

    // ── Review button helper ──────────────────────────────────
    function reviewBtnHTML(b) {
        const status = b.status;
        const showOnActive = status === "ACTIVE";
        const showOnMoveOut = ["COMPLETED", "CANCELLED"].includes(status) && b.move_out_date;
        if (!showOnActive && !showOnMoveOut) return "";

        const trigger = showOnActive ? "move_in" : "move_out";
        const key = `${b.id}-${trigger}`;
        if (_reviewedBookings.has(key)) return "";

        return `<button class="bc-review-btn" data-booking-id="${b.id}" data-trigger="${trigger}">
            <i data-lucide="star"></i> Review
        </button>`;
    }

    // ── Card HTML ─────────────────────────────────────────────
    function bookingCardHTML(b, idx) {
        const listing = b.listing || {};
        const status = b.status || "PENDING";
        const { label, cls } = STATUS_MAP[status] || STATUS_MAP.PENDING;
        const isCancellable = ["PENDING", "APPROVED", "VIEWING_SCHEDULED"].includes(status);
        const isDeletable = ["CANCELLED", "REJECTED", "VIEWING_DECLINED", "MOVED_OUT", "COMPLETED"].includes(status);
        const isActive = status === "ACTIVE";
        const isApproved = status === "VIEWING_SCHEDULED";
        const isViewingScheduled = status === "VIEWING_SCHEDULED";

        const thumbEl = listing.cover
            ? `<img class="bc-thumb" src="${esc(listing.cover)}" alt="${esc(listing.title || "Listing")}">`
            : `<div class="bc-thumb-placeholder"><i data-lucide="home"></i></div>`;

        const loc = [listing.barangay, listing.city].filter(Boolean).join(", ") || "—";
        const price = listing.price
            ? `<div class="bc-price">₱${Number(listing.price).toLocaleString()}<span>/mo</span></div>`
            : "";

        const moveIn = b.move_in_date
            ? `<span class="bc-meta-item"><i data-lucide="calendar"></i>${fmtDate(b.move_in_date)}</span>`
            : "";

        const contractEnd = b.contract_end_date
            ? `<span class="bc-meta-item"><i data-lucide="calendar-x"></i>Until ${fmtDate(b.contract_end_date)}</span>`
            : "";

        const viewingBlock = ""; // replaced by viewingResponseBlock

        // Viewing response block
        const viewingResponseBlock = isViewingScheduled && b.viewing_date && !b._viewingConfirmed ? `
            <div class="bc-viewing-block">
                <i data-lucide="eye"></i>
                <div style="flex:1">
                    <div class="bc-viewing-label">Viewing scheduled</div>
                    <div class="bc-viewing-date">${fmtDate(b.viewing_date)}</div>
                    ${b.viewing_notes ? `<div class="bc-viewing-notes">${esc(b.viewing_notes)}</div>` : ""}
                    <div class="bc-viewing-actions">
                        <button class="bc-view-confirm-btn" data-booking-id="${b.id}">
                            <i data-lucide="check"></i> Confirm viewing
                        </button>
                        <button class="bc-view-decline-btn" data-booking-id="${b.id}">
                            <i data-lucide="x"></i> Decline
                        </button>
                        <a class="bc-view-msg-btn" href="/Resident/resident_messages.html?listing=${b.listing_id}&owner=${b.listing?.owner_id || ''}">
                            <i data-lucide="message-circle"></i> Message owner
                        </a>
                    </div>
                </div>
            </div>` : "";

        // Viewing declined block
        const viewingDeclinedBlock = status === "VIEWING_DECLINED" ? `
            <div class="bc-owner-note" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
                <i data-lucide="x-circle"></i>
                <span>You declined the viewing${b.viewing_decline_reason ? `: "${esc(b.viewing_decline_reason)}"` : ""}. You may rebook after 1 day.</span>
            </div>` : "";

        const daysEarlyBlock = status === "MOVED_OUT" && b.days_early != null
            ? `<div class="bc-owner-note"><i data-lucide="info"></i><span>Moved out <strong>${b.days_early} day${b.days_early !== 1 ? "s" : ""}</strong> before contract end.</span></div>`
            : "";

        const messageBlock = b.message
            ? `<div class="bc-message">"${esc(b.message)}"</div>`
            : "";

        let noteBlock = "";
        if (b.owner_note) {
            const isRejected = status === "REJECTED";
            noteBlock = `<div class="bc-owner-note ${isRejected ? "rejected" : ""}">
                <i data-lucide="${isRejected ? "x-circle" : "message-square"}"></i>
                <span><strong>Owner:</strong> ${esc(b.owner_note)}</span>
            </div>`;
        }

        const cancelBtn = isCancellable
            ? `<button class="bc-cancel-btn" data-cancel-id="${b.id}" data-cancel-title="${esc(listing.title || "this listing")}">
                <i data-lucide="x"></i> Cancel
               </button>`
            : "";

        const receiptBtn = ["APPROVED", "ACTIVE", "COMPLETED"].includes(status)
            ? `<button class="bc-receipt-btn" data-receipt-id="${b.id}">
                <i data-lucide="file-text"></i> Receipt
               </button>`
            : "";

        const moveOutBtn = isActive
            ? `<button class="bc-moveout-btn" data-moveout-id="${b.id}" data-moveout-title="${esc(listing.title || "this listing")}">
                <i data-lucide="log-out"></i> Move Out
               </button>`
            : "";

        const proofVerifiedHtml = b.payment_verified
            ? `<strong style="color:#16a34a">Verified</strong>`
            : `Awaiting verification`;
        const paymentProofBlock = isApproved
            ? (b.payment_proof_url
                ? `<div class="bc-proof-row">
                    <i data-lucide="${b.payment_verified ? "check-circle-2" : "clock"}"></i>
                    <span>Payment proof — ${proofVerifiedHtml}</span>
                    <button class="bc-proof-upload-btn" data-proof-id="${b.id}"><i data-lucide="upload"></i> Replace</button>
                   </div>`
                : `<div class="bc-proof-row bc-proof-prompt">
                    <i data-lucide="upload-cloud"></i>
                    <span>Upload proof of payment for owner to verify</span>
                    <button class="bc-proof-upload-btn" data-proof-id="${b.id}"><i data-lucide="upload"></i> Upload</button>
                   </div>`)
            : "";

        return `
        <div class="booking-card" style="animation-delay:${idx * 40}ms">
            <div class="bc-main">
                ${thumbEl}
                <div class="bc-body">
                    <div class="bc-top">
                        <div class="bc-title">${esc(listing.title || "Untitled listing")}</div>
                        <span class="bc-status ${cls}">${label}</span>
                    </div>
                    <div class="bc-loc">
                        <i data-lucide="map-pin"></i>
                        ${esc(listing.place_type || "Room")} · ${esc(loc)}
                    </div>
                    <div class="bc-meta">
                        ${moveIn}
                        ${contractEnd}
                        <span class="bc-meta-item"><i data-lucide="clock-3"></i>${relTime(b.created_at)}</span>
                    </div>
                </div>
                ${price}
            </div>
            ${b.message ? `<div class="bc-message"><i data-lucide="quote" style="width:12px;height:12px;opacity:0.4;flex-shrink:0;"></i>${esc(b.message)}</div>` : ""}
            ${noteBlock}
            ${viewingResponseBlock}
            ${viewingDeclinedBlock}
            ${daysEarlyBlock}
            ${paymentProofBlock}
            <div class="bc-timeline-wrap">
                ${bookingTimelineHTML(status)}
            </div>
            <div class="bc-actions">
                <span class="bc-timestamp">Requested ${fmtDate(b.created_at)}</span>
                <div class="bc-actions-right">
                    ${receiptBtn}
                    ${moveOutBtn}
                    ${cancelBtn}
                    ${isDeletable ? `<button class="bc-delete-btn" data-delete-id="${b.id}"><i data-lucide="trash-2"></i> Delete</button>` : ""}
                    ${reviewBtnHTML(b)}
                </div>
            </div>
        </div>`;
    }

    // ── Empty states ──────────────────────────────────────────
    function emptyStateHTML(status) {
        const msgs = {
            ALL: { icon: "calendar-x-2", color: "#EEEDFE", stroke: "#534AB7", title: "No reservations yet", sub: "Browse listings and send your first booking request.", cta: true },
            PENDING: { icon: "clock", color: "#FEF9C3", stroke: "#A16207", title: "No pending requests", sub: "Booking requests waiting for owner approval will show here." },
            APPROVED: { icon: "check-circle-2", color: "#E1F5EE", stroke: "#0F6E56", title: "No reserved listings", sub: "Approved bookings will appear here." },
            ACTIVE: { icon: "home", color: "#E6F1FB", stroke: "#185FA5", title: "No active stays", sub: "Listings you've moved into will show here." },
            COMPLETED: { icon: "badge-check", color: "#E1F5EE", stroke: "#0F6E56", title: "No completed stays", sub: "Past stays you've moved out of will appear here." },
            REJECTED: { icon: "x-circle", color: "#FCEBEB", stroke: "#A32D2D", title: "No rejected requests", sub: "Rejected booking requests will appear here." },
            CANCELLED: { icon: "ban", color: "#F1EFE8", stroke: "#5F5E5A", title: "No cancelled bookings", sub: "Cancelled bookings will appear here." },
        };
        const m = msgs[status] || msgs.ALL;
        const cta = m.cta
            ? `<a class="es-cta" href="/Resident/resident_home.html"><i data-lucide="search"></i> Browse listings</a>`
            : "";
        return `
        <div class="empty-state">
            <div class="es-icon-wrap" style="background:${m.color}">
                <i data-lucide="${m.icon}" style="color:${m.stroke}"></i>
            </div>
            <div class="empty-title">${m.title}</div>
            ${m.sub ? `<p class="empty-sub">${m.sub}</p>` : ""}
            ${cta}
        </div>`;
    }

    // ── Poll for status changes ───────────────────────────────
    async function pollStatusChanges() {
        try {
            const res = await fetch(`${API}/bookings/mine`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;

            const fresh = data.bookings || [];
            let changed = false;

            fresh.forEach(b => {
                const prev = _prevStatuses[b.id];
                if (prev && prev !== b.status) {
                    const t = STATUS_TOASTS[b.status];
                    if (t) {
                        if (t.type === "success" && window.showSuccess) showSuccess(t.msg);
                        else if (t.type === "error" && window.showError) window.showError(t.msg);
                        else if (window.showToast) showToast(t.msg, t.type);
                    }
                    changed = true;
                    // Trigger review modal on move-in
                    if (b.status === "ACTIVE" && !_reviewedBookings.has(`${b.id}-move_in`)) {
                        setTimeout(() => openReviewModal(b.id, "move_in"), 1800);
                    }
                }
                _prevStatuses[b.id] = b.status;
            });

            if (changed) {
                _all = fresh;
                updatePageSub();
                updatePendingBadge();
                renderList();
            }
        } catch { }
    }

    // ── Cancel modal ──────────────────────────────────────────
    function setupModal() {
        document.getElementById("modalCancel")?.addEventListener("click", closeModal);
        document.getElementById("modalConfirm")?.addEventListener("click", confirmCancel);
        document.getElementById("modalOverlay")?.addEventListener("click", e => {
            if (e.target === e.currentTarget) closeModal();
        });
        document.getElementById("moveOutCancel")?.addEventListener("click", closeMoveOutModal);
        document.getElementById("moveOutConfirm")?.addEventListener("click", confirmMoveOut);
        document.getElementById("moveOutOverlay")?.addEventListener("click", e => {
            if (e.target === e.currentTarget) closeMoveOutModal();
        });
        document.getElementById("proofCancel")?.addEventListener("click", closeProofModal);
        document.getElementById("proofSubmit")?.addEventListener("click", submitProof);
        document.getElementById("proofOverlay")?.addEventListener("click", e => {
            if (e.target === e.currentTarget) closeProofModal();
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") { closeModal(); closeMoveOutModal(); closeProofModal(); closeReviewModal(); }
        });
    }

    function openCancelModal(id, title) {
        _cancelTarget = id;
        const sub = document.getElementById("modalSub");
        if (sub) sub.textContent = `Cancel your reservation for "${title}"?`;
        document.getElementById("modalOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeModal() {
        _cancelTarget = null;
        document.getElementById("modalOverlay").hidden = true;
    }

    async function confirmCancel() {
        if (!_cancelTarget) return;
        const btn = document.getElementById("modalConfirm");
        btn.textContent = "Cancelling…";
        btn.disabled = true;
        try {
            const reason = (document.getElementById("cancelReasonInput")?.value || "").trim() || null;
            const res = await fetch(`${API}/bookings/${_cancelTarget}/cancel`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cancel_reason: reason }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Cancel failed.");
            const idx = _all.findIndex(b => b.id === _cancelTarget);
            if (idx !== -1) _all[idx].status = "CANCELLED";
            closeModal();
            updatePageSub();
            updatePendingBadge();
            renderList();
        } catch (err) {
            showError(err.message);
        } finally {
            btn.textContent = "Yes, cancel";
            btn.disabled = false;
        }
    }

    // ── Skeleton ──────────────────────────────────────────────
    function showSkeleton() {
        const list = document.getElementById("bookingList");
        if (!list) return;
        list.innerHTML = `<div class="skeleton-list">${Array(3).fill(`
            <div class="skeleton-card">
                <div class="sk-img"></div>
                <div class="sk-body">
                    <div class="sk-line w60"></div>
                    <div class="sk-line w40"></div>
                    <div class="sk-line w30"></div>
                </div>
            </div>`).join("")}</div>`;
    }

    function showError(msg) {
        const list = document.getElementById("bookingList");
        if (list) list.innerHTML = `
            <div class="empty-state">
                <div class="es-icon-wrap" style="background:#FCEBEB">
                    <i data-lucide="wifi-off" style="color:#A32D2D"></i>
                </div>
                <div class="empty-title">Could not load reservations</div>
                <p class="empty-sub">${esc(msg)}</p>
            </div>`;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Utils ─────────────────────────────────────────────────
    function esc(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function fmtDate(dt) {
        if (!dt) return "—";
        try { return new Date(dt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
        catch { return "—"; }
    }
    function relTime(dt) {
        if (!dt) return "—";
        try {
            const diff = Date.now() - new Date(dt).getTime();
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);
            if (mins < 1) return "just now";
            if (mins < 60) return `${mins}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return fmtDate(dt);
        } catch { return "—"; }
    }

    // ── Receipt modal ─────────────────────────────────────────
    async function openReceipt(bookingId) {
        const overlay = document.getElementById("receiptOverlay");
        const content = document.getElementById("receiptContent");
        if (!overlay || !content) return;
        content.innerHTML = `<div class="receiptLoading">Loading receipt…</div>`;
        overlay.hidden = false;
        document.body.style.overflow = "hidden";
        try {
            const res = await fetch(`${API}/bookings/${bookingId}/receipt`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to load receipt.");
            const r = data.receipt;
            content.innerHTML = `
                <div class="rcpt-brand">
                    <div class="rcpt-brand-name">VISTA-HR</div>
                    <div class="rcpt-brand-sub">Reservation Receipt</div>
                </div>
                <div class="rcpt-ref">${esc(r.reference)}</div>
                <div class="rcpt-grid">
                    <div class="rcpt-full"><div class="rcpt-field-label">Resident</div><div class="rcpt-field-value">${esc(r.resident_name)}</div></div>
                    <hr class="rcpt-divider">
                    <div class="rcpt-full"><div class="rcpt-field-label">Listing</div><div class="rcpt-field-value">${esc(r.listing_title)}</div></div>
                    <div class="rcpt-full"><div class="rcpt-field-label">Address</div><div class="rcpt-field-value">${esc(r.listing_address)}</div></div>
                    <div><div class="rcpt-field-label">Property Owner</div><div class="rcpt-field-value">${esc(r.owner_name)}</div></div>
                    <div><div class="rcpt-field-label">Status</div><div class="rcpt-field-value">${esc(r.status)}</div></div>
                    <hr class="rcpt-divider">
                    <div><div class="rcpt-field-label">Move-in Date</div><div class="rcpt-field-value">${r.move_in_date ? fmtDate(r.move_in_date) : "—"}</div></div>
                    <div><div class="rcpt-field-label">Monthly Rent</div><div class="rcpt-field-value">${r.monthly_rent ? "₱" + Number(r.monthly_rent).toLocaleString() : "—"}</div></div>
                    <div><div class="rcpt-field-label">Date Approved</div><div class="rcpt-field-value">${r.approved_at ? fmtDate(r.approved_at) : "—"}</div></div>
                    <div><div class="rcpt-field-label">Date Requested</div><div class="rcpt-field-value">${r.created_at ? fmtDate(r.created_at) : "—"}</div></div>
                    <div class="rcpt-footer-note">This receipt was generated by VISTA-HR. For concerns, contact your property owner.</div>
                </div>`;
        } catch (err) {
            content.innerHTML = `<div class="receiptLoading" style="color:#dc2626;">${esc(err.message)}</div>`;
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeReceipt() {
        const overlay = document.getElementById("receiptOverlay");
        if (overlay) overlay.hidden = true;
        document.body.style.overflow = "";
    }

    document.getElementById("receiptClose")?.addEventListener("click", closeReceipt);
    document.getElementById("receiptCloseBtn")?.addEventListener("click", closeReceipt);
    document.getElementById("receiptOverlay")?.addEventListener("click", e => {
        if (e.target === e.currentTarget) closeReceipt();
    });
    document.getElementById("receiptPrintBtn")?.addEventListener("click", () => window.print());

    // ── Move-out modal ────────────────────────────────────────
    let _moveOutTarget = null;

    function openMoveOutModal(id, title) {
        _moveOutTarget = id;
        const sub = document.getElementById("moveOutSub");
        if (sub) sub.textContent = `Move out of "${title}"? This will end your active booking.`;
        document.getElementById("moveOutOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeMoveOutModal() {
        _moveOutTarget = null;
        document.getElementById("moveOutOverlay").hidden = true;
    }

    async function confirmMoveOut() {
        if (!_moveOutTarget) return;
        const btn = document.getElementById("moveOutConfirm");
        btn.textContent = "Processing…";
        btn.disabled = true;
        try {
            const res = await fetch(`${API}/bookings/${_moveOutTarget}/move-out`, {
                method: "PATCH", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Move-out failed.");

            const idx = _all.findIndex(b => b.id === _moveOutTarget);
            if (idx !== -1) {
                _all[idx].status = "MOVED_OUT";
                _all[idx].move_out_date = data.booking?.move_out_date || new Date().toISOString();
                _all[idx].days_early = data.booking?.days_early ?? null;
            }
            const movedId = _moveOutTarget;
            closeMoveOutModal();
            updatePageSub();
            updatePendingBadge();
            renderList();
            if (window.showSuccess) showSuccess("Move-out recorded successfully.");

            // Trigger review modal after move-out
            if (!_reviewedBookings.has(`${movedId}-move_out`)) {
                setTimeout(() => openReviewModal(movedId, "move_out"), 800);
            }
        } catch (err) {
            if (window.showError) window.showError(err.message);
            else alert(err.message);
        } finally {
            btn.textContent = "Yes, move out";
            btn.disabled = false;
        }
    }

    // ── Payment proof modal ───────────────────────────────────
    let _proofTarget = null;

    function openProofModal(bookingId) {
        _proofTarget = bookingId;
        const fileInp = document.getElementById("proofFileInput");
        const preview = document.getElementById("proofPreview");
        const err = document.getElementById("proofErr");
        if (fileInp) fileInp.value = "";
        if (preview) { preview.src = ""; preview.hidden = true; }
        if (err) err.hidden = true;
        document.getElementById("proofSubmit").disabled = true;
        document.getElementById("proofOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeProofModal() {
        _proofTarget = null;
        document.getElementById("proofOverlay").hidden = true;
    }

    document.getElementById("proofFileInput")?.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        const preview = document.getElementById("proofPreview");
        const err = document.getElementById("proofErr");
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
        if (!validTypes.includes(file.type)) {
            if (err) { err.textContent = "Only images or PDF allowed."; err.hidden = false; }
            e.target.value = ""; return;
        }
        if (file.size > 10 * 1024 * 1024) {
            if (err) { err.textContent = "File must be under 10MB."; err.hidden = false; }
            e.target.value = ""; return;
        }
        if (err) err.hidden = true;
        if (preview && file.type.startsWith("image/")) {
            preview.src = URL.createObjectURL(file);
            preview.hidden = false;
        }
        document.getElementById("proofSubmit").disabled = false;
    });

    async function submitProof() {
        if (!_proofTarget) return;
        const fileInp = document.getElementById("proofFileInput");
        const file = fileInp?.files[0];
        if (!file) return;
        const btn = document.getElementById("proofSubmit");
        const err = document.getElementById("proofErr");
        btn.disabled = true;
        btn.textContent = "Uploading…";
        if (err) err.hidden = true;
        try {
            const sigRes = await fetch(`${API}/uploads/sign`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: "vista_hr/payment_proofs" }),
            });
            const sigData = await sigRes.json();
            if (!sigRes.ok) throw new Error(sigData.error || "Failed to get upload signature.");

            const formData = new FormData();
            formData.append("file", file);
            formData.append("api_key", sigData.apiKey);
            formData.append("timestamp", sigData.timestamp);
            formData.append("signature", sigData.signature);
            formData.append("folder", sigData.folder);

            const upRes = await fetch(`https://api.cloudinary.com/v1_1/${sigData.cloudName}/auto/upload`, {
                method: "POST", body: formData,
            });
            const upData = await upRes.json();
            if (!upRes.ok) throw new Error(upData.error?.message || "Cloudinary upload failed.");

            const patchRes = await fetch(`${API}/bookings/${_proofTarget}/payment-proof`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payment_proof_url: upData.secure_url }),
            });
            const patchData = await patchRes.json();
            if (!patchRes.ok) throw new Error(patchData.error || "Failed to save proof.");

            const idx = _all.findIndex(b => b.id === _proofTarget);
            if (idx !== -1) { _all[idx].payment_proof_url = upData.secure_url; _all[idx].payment_verified = false; }

            closeProofModal();
            renderList();
            if (window.showSuccess) showSuccess("Payment proof uploaded! Owner will verify shortly.");
        } catch (e) {
            if (err) { err.textContent = e.message; err.hidden = false; }
        } finally {
            btn.disabled = false;
            btn.textContent = "Upload";
        }
    }

    // ── Review modal ──────────────────────────────────────────
    let _rv = { bookingId: null, trigger: null, step: 0, pending: [] };

    function setupReviewModal() {
        document.getElementById("rvClose")?.addEventListener("click", closeReviewModal);
        document.getElementById("rvOverlay")?.addEventListener("click", e => {
            if (e.target === e.currentTarget) closeReviewModal();
        });
        document.getElementById("rvSkip")?.addEventListener("click", advanceReview);
        document.getElementById("rvSubmit")?.addEventListener("click", submitReview);
        document.getElementById("rvDone")?.addEventListener("click", closeReviewModal);

        document.getElementById("rvStars")?.addEventListener("click", e => {
            const star = e.target.closest("[data-star]");
            if (!star) return;
            const val = parseInt(star.dataset.star);
            document.querySelectorAll("#rvStars [data-star]").forEach(s => {
                s.classList.toggle("filled", parseInt(s.dataset.star) <= val);
            });
            document.getElementById("rvStars").dataset.rating = val;
            document.getElementById("rvSubmit").disabled = false;
        });
    }

    async function openReviewModal(bookingId, trigger) {
        try {
            const res = await fetch(`${API}/reviews/eligibility/${bookingId}`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.pending?.length) return;

            _rv = { bookingId, trigger, step: 0, pending: data.pending };
            renderReviewStep();
            document.getElementById("rvOverlay").hidden = false;
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch { }
    }

    function renderReviewStep() {
        const { pending, step } = _rv;
        if (step >= pending.length) {
            document.getElementById("rvForm").hidden = true;
            document.getElementById("rvCongrats").hidden = false;
            // Auto-close after 2.5s
            setTimeout(() => closeReviewModal(), 2500);
            return;
        }

        const type = pending[step];
        const COPY = {
            OWNER: { title: "Rate your property owner", sub: "How was your experience with this landlord?" },
            SYSTEM: { title: "How was your VISTA-HR experience?", sub: "Help us improve the platform for everyone." },
            LISTING: { title: "Rate the property", sub: "How was the unit overall?" },
            RESIDENT: { title: "Rate this resident", sub: "How was this tenant during their stay?" },
        };
        const copy = COPY[type] || { title: "Leave a review", sub: "" };

        document.getElementById("rvForm").hidden = false;
        document.getElementById("rvCongrats").hidden = true;
        document.getElementById("rvTitle").textContent = copy.title;
        document.getElementById("rvSub").textContent = copy.sub;
        document.getElementById("rvComment").value = "";
        document.getElementById("rvSubmit").disabled = true;

        const stepEl = document.getElementById("rvStepIndicator");
        if (stepEl) stepEl.textContent = pending.length > 1 ? `${step + 1} of ${pending.length}` : "";

        // Reset stars
        document.querySelectorAll("#rvStars [data-star]").forEach(s => s.classList.remove("filled"));
        if (document.getElementById("rvStars")) document.getElementById("rvStars").dataset.rating = "0";

        // Show skip only when more steps remain
        const skipBtn = document.getElementById("rvSkip");
        if (skipBtn) skipBtn.hidden = (step === pending.length - 1);
    }

    async function submitReview() {
        const { bookingId, trigger, pending, step } = _rv;
        const type = pending[step];
        const rating = parseInt(document.getElementById("rvStars")?.dataset.rating || "0");
        const comment = document.getElementById("rvComment")?.value.trim() || null;
        if (!rating) return;

        const btn = document.getElementById("rvSubmit");
        btn.disabled = true;
        btn.textContent = "Submitting…";

        try {
            let res;
            if (type === "LISTING") {
                // LISTING reviews go to a different endpoint (backend separates them)
                const booking = _all.find(b => b.id === bookingId);
                const listingId = booking?.listing_id || booking?.listing?.id;
                if (!listingId) throw new Error("Listing not found for this booking.");
                res = await fetch(`${API}/listings/${listingId}/reviews`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rating, comment }),
                });
            } else {
                // OWNER / SYSTEM / RESIDENT go through /reviews/submit
                res = await fetch(`${API}/reviews/submit`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ booking_id: bookingId, review_type: type, rating, comment }),
                });
            }
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || "Submission failed.");
            }
            // Mark session so button hides after close
            _reviewedBookings.add(`${bookingId}-${trigger}`);
            sessionStorage.setItem("_vhReviewed", JSON.stringify([..._reviewedBookings]));
            advanceReview();
        } catch (err) {
            if (window.showError) window.showError(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = "Submit";
        }
    }

    function advanceReview() {
        _rv.step++;
        renderReviewStep();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeReviewModal() {
        document.getElementById("rvOverlay").hidden = true;
        _rv = { bookingId: null, trigger: null, step: 0, pending: [] };
        renderList();
    }


    // ── Viewing confirm ───────────────────────────────────────
    async function confirmViewing(bookingId) {
        try {
            const res = await fetch(`${API}/bookings/${bookingId}/viewing-response`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "CONFIRM" }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed.");
            // Mark confirmed locally so buttons disappear
            const idx = _all.findIndex(b => b.id === bookingId);
            if (idx !== -1) _all[idx]._viewingConfirmed = true;
            renderList();
            if (window.showSuccess) showSuccess("Viewing confirmed! The owner has been notified.");
        } catch (err) {
            if (window.showError) showError(err.message);
        }
    }

    // ── Decline viewing modal ─────────────────────────────────
    let _declineTarget = null;

    function openDeclineViewingModal(bookingId) {
        _declineTarget = bookingId;
        const inp = document.getElementById("declineReasonInput");
        if (inp) inp.value = "";
        const err = document.getElementById("declineErr");
        if (err) err.hidden = true;
        document.getElementById("declineViewingOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeDeclineViewingModal() {
        _declineTarget = null;
        document.getElementById("declineViewingOverlay").hidden = true;
    }

    document.getElementById("declineViewingCancel")?.addEventListener("click", closeDeclineViewingModal);
    document.getElementById("declineViewingOverlay")?.addEventListener("click", e => {
        if (e.target === e.currentTarget) closeDeclineViewingModal();
    });
    document.getElementById("declineViewingConfirm")?.addEventListener("click", async () => {
        if (!_declineTarget) return;
        const reason = (document.getElementById("declineReasonInput")?.value || "").trim();
        const err = document.getElementById("declineErr");
        if (!reason) {
            if (err) { err.textContent = "Please provide a reason."; err.hidden = false; }
            return;
        }
        const btn = document.getElementById("declineViewingConfirm");
        btn.disabled = true; btn.textContent = "Submitting…";
        try {
            const res = await fetch(`${API}/bookings/${_declineTarget}/viewing-response`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DECLINE", reason }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed.");
            const idx = _all.findIndex(b => b.id === _declineTarget);
            if (idx !== -1) {
                _all[idx].status = "VIEWING_DECLINED";
                _all[idx].viewing_decline_reason = reason;
            }
            closeDeclineViewingModal();
            renderList();
            if (window.showToast) showToast("Viewing declined. You may rebook after 1 day.", "warning");
        } catch (err2) {
            if (err) { err.textContent = err2.message; err.hidden = false; }
        } finally {
            btn.disabled = false; btn.textContent = "Decline viewing";
        }
    });

    // ── Delete booking (terminal statuses only) ───────────────
    let _deleteTarget = null;

    function openDeleteBookingModal(id) {
        _deleteTarget = id;
        document.getElementById("deleteBookingOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeDeleteBookingModal() {
        _deleteTarget = null;
        document.getElementById("deleteBookingOverlay").hidden = true;
    }

    document.getElementById("deleteBookingCancel")?.addEventListener("click", closeDeleteBookingModal);
    document.getElementById("deleteBookingOverlay")?.addEventListener("click", e => {
        if (e.target === e.currentTarget) closeDeleteBookingModal();
    });
    document.getElementById("deleteBookingConfirm")?.addEventListener("click", async () => {
        if (!_deleteTarget) return;
        const btn = document.getElementById("deleteBookingConfirm");
        btn.disabled = true; btn.textContent = "Deleting…";
        try {
            const res = await fetch(`${API}/bookings/${_deleteTarget}`, {
                method: "DELETE", credentials: "include",
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed."); }
            _all = _all.filter(b => b.id !== _deleteTarget);
            closeDeleteBookingModal();
            updatePageSub();
            updatePendingBadge();
            renderList();
            if (window.showSuccess) showSuccess("Booking removed.");
        } catch (err) {
            if (window.showError) showError(err.message);
        } finally {
            btn.disabled = false; btn.textContent = "Delete";
        }
    });

})();