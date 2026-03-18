(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.AuthGuard) {
      console.error("AuthGuard missing. Check /auth/sessionGuard.js path.");
      alert("AuthGuard missing. Fix sessionGuard.js include/path.");
      return;
    }
    if (!window.ListingStore) {
      console.error("ListingStore missing. Check /core/store.js path.");
      alert("ListingStore missing. Fix store.js include/path.");
      return;
    }

    const ok = await window.AuthGuard.requireOwner();
    if (!ok) return;

    const API_BASE = "http://127.0.0.1:5000/api";
    const WIZARD_URL = "/PO-after-signup/listing-wizard/index.html";

    // ===== Tabs (.dashTab + #tab-*) =====
    const tabButtons = Array.from(document.querySelectorAll(".dashTab"));
    const panels = {
      today: document.getElementById("tab-today"),
      calendar: document.getElementById("tab-calendar"),
      listings: document.getElementById("tab-listings"),
      messages: document.getElementById("tab-messages"),
    };

    //  Listings 
    const listingGrid = document.getElementById("listingGrid");
    const btnNewListing = document.getElementById("btnNewListing");
    const btnContinue = document.getElementById("btnContinue");
    const btnCompleteListing = document.getElementById("btnCompleteListing");

    // Profile 
    const profileBtn = document.getElementById("profileBtn");
    const profileMenu = document.getElementById("profileMenu");
    const menuAccount = document.getElementById("menuAccount");
    const menuHelp = document.getElementById("menuHelp");
    const menuLogout = document.getElementById("menuLogout");

    //  Modal 
    const modalOverlay = document.getElementById("modalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const modalCancel = document.getElementById("modalCancel");
    const modalConfirm = document.getElementById("modalConfirm");

    // Avatar initial
    try {
      const s = AuthGuard.getSession?.();
      const email = s?.user?.email || "";
      const initial = (email?.[0] || "O").toUpperCase();
      const avatar = document.getElementById("avatarCircle");
      if (avatar) avatar.textContent = initial;
    } catch { }

    function escapeHtml(str) {
      return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function openModal({
      title,
      message,
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false,
      confirmDisabled = false,
      onConfirm,
      onCancel
    }) {
      if (!modalOverlay || !modalTitle || !modalMessage || !modalCancel || !modalConfirm) {
        const yes = window.confirm(`${title}\n\n${message}`);
        if (yes && !confirmDisabled) onConfirm?.();
        else onCancel?.();
        return;
      }

      modalTitle.textContent = title || "Confirm";
      modalMessage.textContent = message || "";
      modalConfirm.textContent = confirmText || "Confirm";
      modalCancel.textContent = cancelText || "Cancel";
      modalConfirm.classList.toggle("danger", !!danger);

      modalConfirm.disabled = !!confirmDisabled;
      modalConfirm.classList.toggle("disabled", !!confirmDisabled);

      const cleanup = () => {
        modalOverlay.classList.remove("open");
        modalOverlay.setAttribute("aria-hidden", "true");
        modalConfirm.onclick = null;
        modalCancel.onclick = null;
        modalOverlay.onclick = null;
        document.removeEventListener("keydown", onEsc);
      };

      const onEsc = (e) => {
        if (e.key === "Escape") {
          cleanup();
          onCancel?.();
        }
      };

      modalConfirm.onclick = () => {
        if (modalConfirm.disabled) return;
        cleanup();
        onConfirm?.();
      };

      modalCancel.onclick = () => {
        cleanup();
        onCancel?.();
      };

      modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
          cleanup();
          onCancel?.();
        }
      };

      document.addEventListener("keydown", onEsc);

      modalOverlay.classList.add("open");
      modalOverlay.setAttribute("aria-hidden", "false");
    }

    async function apiFetch(path, options = {}) {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw data;
      return data;
    }

    function niceDate(dt) {
      try {
        const d = new Date(dt);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
      } catch {
        return "—";
      }
    }

    function statusBadge(listing) {
      const st = String(listing?.status || "").toUpperCase();
      if (st === "PUBLISHED") return { text: "Published", cls: "published" };
      if (st === "READY") return { text: "Ready", cls: "ready" };
      return { text: "In progress", cls: "draft" };
    }

    function locationLine(listing) {
      const b = (listing?.barangay || "").trim();
      const c = (listing?.city || "").trim();
      if (b && c) return `Home in ${b}, ${c}`;
      if (c) return `Home in ${c}`;
      return "Home";
    }

    function galleryImages(listing) {
      const raw = [];

      if (listing?.cover) raw.push(listing.cover);

      if (Array.isArray(listing?.photos)) {
        for (const p of listing.photos) {
          if (typeof p === "string" && p) raw.push(p);
          else if (p?.url) raw.push(p.url);
          else if (p?.secure_url) raw.push(p.secure_url);
        }
      }

      const unique = [...new Set(raw.filter(Boolean))];
      return unique;
    }

    // close any open card menus
    function closeAllMenus() {
      document.querySelectorAll(".lCard.isExpanded").forEach((el) => {
        el.classList.remove("isExpanded");
      });
    }

    function initCardPreviews() {
      if (!listingGrid) return;

      listingGrid.querySelectorAll(".lCard").forEach((card) => {
        const imgEl = card.querySelector(".lHeroImg");
        if (!imgEl) return;

        const dots = Array.from(card.querySelectorAll(".lDot"));

        let images = [];
        try {
          images = JSON.parse(card.dataset.images || "[]");
        } catch {
          images = [];
        }

        if (!Array.isArray(images) || images.length < 2) return;

        let idx = 0;
        let timer = null;

        const setActiveDot = (activeIdx) => {
          dots.forEach((dot, i) => {
            dot.classList.toggle("active", i === activeIdx);
          });
        };

        const showImage = (nextIdx) => {
          if (!images[nextIdx]) return;

          imgEl.classList.add("isSwitching");

          setTimeout(() => {
            imgEl.src = images[nextIdx];
            setActiveDot(nextIdx);
          }, 160);

          setTimeout(() => {
            imgEl.classList.remove("isSwitching");
          }, 420);
        };

        const start = () => {
          if (timer) return;

          timer = setInterval(() => {
            idx = (idx + 1) % images.length;
            showImage(idx);
          }, 2200);
        };

        const stop = () => {
          if (timer) clearInterval(timer);
          timer = null;
          idx = 0;
          showImage(0);
        };

        card.addEventListener("mouseenter", start);
        card.addEventListener("mouseleave", stop);
      });
    }

    async function renderListings() {
      if (!listingGrid) return;

      listingGrid.innerHTML = `
    <div style="grid-column:1 / -1; padding:14px; border:1px solid #e5e7eb; border-radius:22px; background:#fff;">
      Loading listings…
    </div>
  `;

      let listings = [];
      try {
        listings = await window.ListingStore.listMyListings();
      } catch (e) {
        console.error("[dashboard] listMyListings failed", e);
        listingGrid.innerHTML = `
      <div style="grid-column:1 / -1; padding:14px; border:1px solid #e5e7eb; border-radius:22px; background:#fff;">
        Unable to load listings. Check /api/listings/mine.
      </div>
    `;
        return;
      }

      if (!listings.length) {
        listingGrid.innerHTML = `
      <div class="emptyListings">
        <div class="emptyListingsIcon"><i data-lucide="home"></i></div>
        <div class="emptyListingsTitle">No listings yet</div>
        <div class="emptyListingsSub">Create your first listing to start accepting bookings.</div>
      </div>
    `;
        if (window.lucide?.createIcons) lucide.createIcons();
        return;
      }

      listingGrid.innerHTML = listings.map((l) => {
        const status = String(l.status || "").toUpperCase();
        const badge = statusBadge(l);
        const images = galleryImages(l);
        const coverUrl = images[0] || null;
        const title = (l.title || "").trim() || "Untitled space";
        const updated = l.updated_at || l.updatedAt || l.modified_at || null;
        const step = Math.max(1, Math.min(8, Number(l.current_step || 1)));

        const canSubmit = status === "READY";
        const isPublished = status === "PUBLISHED";

        const supportLine =
          isPublished
            ? `Published • Updated ${escapeHtml(updated ? niceDate(updated) : "—")}`
            : canSubmit
              ? `Ready to publish • Updated ${escapeHtml(updated ? niceDate(updated) : "—")}`
              : `Step ${escapeHtml(step)} of 8 • Updated ${escapeHtml(updated ? niceDate(updated) : "—")}`;

        return `
  <article
    class="lCard premiumCard"
    data-id="${escapeHtml(l.id)}"
    data-step="${escapeHtml(step)}"
    data-images='${escapeHtml(JSON.stringify(images))}'
  >
    <div class="lMedia">
      ${coverUrl
            ? `<img class="lHeroImg" src="${escapeHtml(coverUrl)}" alt="Listing cover">`
            : `<div class="lPlaceholder"><i data-lucide="home"></i></div>`
          }

      <div class="lTopOverlay">
        <span class="lStatusChip ${badge.cls}">
          <span class="lStatusDot"></span>
          <span class="lStatusText">${escapeHtml(badge.text)}</span>
        </span>
      </div>

    

      <div class="lShade"></div>

      ${images.length > 1 ? `
  <div class="lPreviewDots">
    ${images.map((_, i) => `
      <span class="lDot ${i === 0 ? "active" : ""}" data-dot="${i}"></span>
    `).join("")}
  </div>
` : ""}

      <div class="lActionOverlay">
        <div class="lActionIcons">
          <button type="button" class="lIconAction" data-act="edit" aria-label="Continue editing">
            <i data-lucide="edit-3"></i>
            <span class="lIconTip">Continue editing</span>
          </button>

          ${canSubmit ? `
            <button type="button" class="lIconAction" data-act="submit" aria-label="Publish listing">
              <i data-lucide="send"></i>
              <span class="lIconTip">Publish listing</span>
            </button>
          ` : ``}

          <button type="button" class="lIconAction danger" data-act="delete" aria-label="Delete listing">
            <i data-lucide="trash-2"></i>
            <span class="lIconTip">Delete listing</span>
          </button>
        </div>
      </div>
    </div>

    <div class="lMeta">
      <div class="lTitle">${escapeHtml(title)}</div>
      <div class="lSub">${escapeHtml(locationLine(l))}</div>
      <div class="lSupport">${supportLine}</div>
    </div>
  </article>
`;
      }).join("");

      initCardPreviews();

      listingGrid.onclick = async (e) => {
        const actBtn = e.target.closest("[data-act]");
        const card = e.target.closest(".lCard");
        if (!card) return;

        const id = Number(card.dataset.id);
        const step = Number(card.dataset.step || 1);

        // action icon clicks ( edit, delete, etc..)
        if (actBtn) {
          const act = actBtn.dataset.act;

          closeAllMenus();

          if (act === "edit") {
            try {
              await window.ListingStore.openListing(id);
              location.href = `${WIZARD_URL}#/step-${step}`;
            } catch (err) {
              console.error(err);
              alert(err?.message || err?.error || "Unable to continue editing.");
            }
            return;
          }

          if (act === "submit") {
            // Check email verified first
            const session = window.AuthGuard?.getSession?.();
            const emailVerified = session?.user?.email_verified === true;
            const kycStatus = session?.user?.kyc_status || "NONE";
            const isVerified = session?.user?.is_verified === true;

            if (!emailVerified) {
              const email = encodeURIComponent(session?.user?.email || "");
              openModal({
                title: "Verify your email first",
                message: "You need to verify your email address before you can publish listings.",
                confirmText: "Verify email →",
                cancelText: "Not now",
                onConfirm: () => {
                  location.href = `/auth/verify-email.html?email=${email}&role=OWNER`;
                }
              });
              return;
            }

            if (!isVerified && kycStatus !== "APPROVED") {
              openModal({
                title: "Verify your account first",
                message: "Your listings won't be visible to residents until your identity is approved. Verification takes 1–2 business days.",
                confirmText: "Verify my identity →",
                cancelText: "Not now",
                onConfirm: () => {
                  location.href = "/Property-Owner/verification/verify.html";
                },
                onCancel: async () => {
                  // Still allow submitting — listing will sit in READY state
                  try {
                    await window.ListingStore.openListing(id);
                    await window.ListingStore.submitForVerification();
                    await renderListings();
                  } catch (err) {
                    console.error(err);
                  }
                }
              });
              return;
            }

            openModal({
              title: "Publish listing?",
              message: "This listing will be visible to all residents across Metro Manila.",
              confirmText: "Publish",
              cancelText: "Cancel",
              onConfirm: async () => {
                try {
                  await window.ListingStore.openListing(id);
                  await window.ListingStore.submitForVerification();
                  await renderListings();
                } catch (err) {
                  console.error(err);
                  alert(err?.message || err?.error || "Publish failed.");
                }
              }
            });
            return;
          }

          if (act === "delete") {
            openModal({
              title: "Delete listing?",
              message: "This will permanently remove the listing from the database.",
              confirmText: "Delete",
              cancelText: "Cancel",
              danger: true,
              onConfirm: async () => {
                try {
                  await apiFetch(`/listings/${id}`, { method: "DELETE" });
                  await renderListings();
                } catch (err) {
                  console.error(err);
                  alert(err?.message || err?.error || "Delete failed.");
                }
              }
            });
            return;
          }
        }

        // plain card click toggles menu
        const isOpen = card.classList.contains("isExpanded");
        closeAllMenus();
        if (!isOpen) card.classList.add("isExpanded");
      };

      if (window.lucide?.createIcons) lucide.createIcons();
    }

    //  Buttons to
    btnCompleteListing?.addEventListener("click", () => {
      setTab("listings");
      setTimeout(() => btnNewListing?.click(), 50);
    });

    btnNewListing?.addEventListener("click", async () => {
      let listings = [];
      const limit = window.ListingStore.getDraftLimit?.() ?? 3;

      try {
        listings = await window.ListingStore.listMyListings();
      } catch (e) {
        console.error("[dashboard] failed to load listings", e);
        openModal({
          title: "Unable to load listings",
          message: "Please try again in a moment.",
          confirmText: "Okay",
          cancelText: "Close",
          onConfirm: () => { }
        });
        return;
      }

      const activeListings = listings.filter((l) => {
        const st = String(l?.status || "").toUpperCase();
        return st !== "PUBLISHED";
      });

      const latestDraft = activeListings[0] || null;
      const used = activeListings.length;
      const reached = used >= limit;

      const resumeLatestDraft = async () => {
        if (!latestDraft) return;
        try {
          await window.ListingStore.openListing(latestDraft.id);
          const step = Math.max(1, Math.min(8, Number(latestDraft.current_step || 1)));
          location.href = `${WIZARD_URL}#/step-${step}`;
        } catch (e) {
          console.error("[dashboard] open latest draft failed", e);
          openModal({
            title: "Unable to resume listing",
            message: e?.error || e?.message || "Please try again.",
            confirmText: "Okay",
            cancelText: "Close",
            onConfirm: () => { }
          });
        }
      };

      const createFreshListing = async () => {
        try {
          await window.ListingStore.createNewDraft();
          location.href = `${WIZARD_URL}?new=1#/step-1`;
        } catch (e) {
          console.error("[dashboard] create draft failed", e);
          openModal({
            title: "Cannot create listing",
            message: e?.error || e?.message || "Please try again.",
            confirmText: "Okay",
            cancelText: "Close",
            onConfirm: () => { }
          });
        }
      };

      if (latestDraft && reached) {
        openModal({
          title: "Listing limit reached",
          message: "You already have the maximum number of active listings for your account. Resume your latest listing to continue editing.",
          confirmText: "Resume latest",
          cancelText: "Close",
          onConfirm: resumeLatestDraft
        });
        return;
      }

      if (latestDraft && !reached) {
        openModal({
          title: "Continue your latest listing?",
          message: "You still have an unfinished listing. You can continue where you left off or start a new one.",
          confirmText: "Resume latest",
          cancelText: "Create new",
          onConfirm: resumeLatestDraft,
          onCancel: createFreshListing
        });
        return;
      }

      await createFreshListing();
    });

    btnContinue?.addEventListener("click", async () => {
      // continue whatever is currently in local active draft
      try {
        const d = window.ListingStore.readDraft();
        const p = window.ListingStore.computeProgress(d);
        location.href = `${WIZARD_URL}#/${"step-" + (p.nextStep || 1)}`;
      } catch {
        location.href = `${WIZARD_URL}#/${"step-1"}`;
      }
    });



    // tabs routing 
    function activeTabKey() {
      const h = (location.hash || "").replace("#/", "").trim();
      return (["today", "calendar", "listings", "messages"].includes(h)) ? h : "today";
    }

    function setTab(key) {
      location.hash = `#/${key}`;
    }

    function renderTabs() {
      const key = activeTabKey();

      tabButtons.forEach(btn => {
        const on = btn.dataset.tab === key;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });

      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle("active", k === key);
      });

      if (key === "today") renderToday();
      if (key === "listings") renderListings();

      if (key === "calendar" && window.DashboardCalendar?.render) {
        window.DashboardCalendar.render();
      }
    }

    tabButtons.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
    window.addEventListener("hashchange", renderTabs);

    // profile menu
    function openMenu(on) {
      if (!profileMenu || !profileBtn) return;
      profileMenu.classList.toggle("open", on);
      profileBtn.setAttribute("aria-expanded", on ? "true" : "false");
      profileMenu.setAttribute("aria-hidden", on ? "false" : "true");
      if (window.lucide?.createIcons) lucide.createIcons();
    }

    profileBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = profileMenu?.classList.contains("open");
      openMenu(!isOpen);
    });

    document.addEventListener("click", () => openMenu(false));
    profileMenu?.addEventListener("click", (e) => e.stopPropagation());

    menuAccount?.addEventListener("click", () => { openMenu(false); location.href = "/auth/account-settings.html"; });
    menuHelp?.addEventListener("click", () => { openMenu(false); alert("Help center (later)."); });
    menuLogout?.addEventListener("click", async () => { openMenu(false); await AuthGuard.logout(); });

    document.addEventListener("click", (evt) => {
      if (!evt.target.closest(".lCard")) closeAllMenus();
    }, { capture: true });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") closeAllMenus();
    });

    // ===== Density toggle =====
    const densityGrid = document.getElementById("densityGrid");
    const densityList = document.getElementById("densityList");

    function setDensity(mode) {
      const grid = document.getElementById("listingGrid");
      if (!grid) return;

      if (mode === "list") {
        grid.classList.add("isList");
        densityGrid?.classList.remove("active");
        densityGrid?.setAttribute("aria-pressed", "false");
        densityList?.classList.add("active");
        densityList?.setAttribute("aria-pressed", "true");
      } else {
        grid.classList.remove("isList");
        densityGrid?.classList.add("active");
        densityGrid?.setAttribute("aria-pressed", "true");
        densityList?.classList.remove("active");
        densityList?.setAttribute("aria-pressed", "false");
      }

      try { localStorage.setItem("listingDensity", mode); } catch { }
    }

    densityGrid?.addEventListener("click", () => setDensity("grid"));
    densityList?.addEventListener("click", () => setDensity("list"));

    // Restore saved preference
    try {
      const saved = localStorage.getItem("listingDensity");
      if (saved === "list") setDensity("list");
    } catch { }

    // ===== Today tab =====
    async function renderToday() {
      const el = id => document.getElementById(id);
      let bookings = [];
      let listings = [];
      let ownerVerified = true;

      try {
        const [bData, lData] = await Promise.all([
          apiFetch("/bookings/for-owner"),
          apiFetch("/listings/mine"),
        ]);
        bookings = bData.bookings || [];
        listings = lData.listings || [];
        ownerVerified = lData.owner_verified !== false;
      } catch (e) {
        console.error("[today] load failed", e);
      }

      // ── Email verify banner ──────────────────────────────────────
      const session = window.AuthGuard?.getSession?.();
      const emailVerified = session?.user?.email_verified === true;
      const emailBanner = el("emailVerifyBanner");
      if (emailBanner) {
        emailBanner.hidden = emailVerified;
        if (!emailVerified) {
          const email = encodeURIComponent(session?.user?.email || "");
          el("emailVerifyBtn").href = `/auth/verify-email.html?email=${email}&role=OWNER`;
        }
      }

      // ── KYC Verification banner ──────────────────────────────────────
      const banner = el("verifyBanner");
      if (banner) banner.hidden = !emailVerified || ownerVerified;

      // ── Stat cards ───────────────────────────────────────────────
      const pending = bookings.filter(b => b.status === "PENDING");
      const approved = bookings.filter(b => b.status === "APPROVED");
      const active = listings.filter(l => ["DRAFT", "READY", "PUBLISHED"].includes(l.status));

      // Occupancy: approved bookings / active listings (capped at 100%)
      const occupancyNum = active.length > 0
        ? Math.min(100, Math.round((approved.length / active.length) * 100))
        : null;

      if (el("statPending")) el("statPending").textContent = pending.length;
      if (el("statApproved")) el("statApproved").textContent = approved.length;
      if (el("statListings")) el("statListings").textContent = active.length;
      if (el("statOccupancy")) el("statOccupancy").textContent = occupancyNum !== null ? `${occupancyNum}%` : "—";

      // ── Today's date label ───────────────────────────────────────
      const todayLabel = el("todayDateLabel");
      if (todayLabel) {
        todayLabel.textContent = new Date().toLocaleDateString("en-PH", {
          weekday: "long", month: "long", day: "numeric"
        });
      }

      // ── Today's move-in events ───────────────────────────────────
      const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const moveIns = bookings.filter(b =>
        b.status === "APPROVED" && b.move_in_date && String(b.move_in_date).slice(0, 10) === todayStr
      );

      const eventsList = el("todayEventsList");
      if (eventsList) {
        if (!moveIns.length) {
          eventsList.innerHTML = `
            <div class="todayEventsEmpty">
              <i data-lucide="calendar-check-2"></i>
              <span>No move-ins scheduled for today.</span>
            </div>`;
        } else {
          eventsList.innerHTML = `<div class="todayEventCards">${moveIns.map(b => todayEventRow(b)).join("")}</div>`;
        }
      }

      // ── Bookings section (full filterable list) ──────────────────
      const bookingsList = el("bookingsList");
      if (bookingsList) {
        _allBookings = bookings;

        // Update pending badge on Today tab
        const badge = el("bookingsBadge");
        const pendingCount = bookings.filter(b => b.status === "PENDING");
        if (badge) {
          badge.textContent = pendingCount.length;
          badge.hidden = pendingCount.length === 0;
        }

        // Update pending count chip on filter bar
        const countEl = el("bkCountPending");
        if (countEl) {
          countEl.textContent = pendingCount.length || "";
          countEl.style.display = pendingCount.length ? "" : "none";
        }

        applyBookingFilter();
      }

      // ── Recent activity: last 5 bookings of any status ───────────
      const activityList = el("todayActivityList");
      if (activityList) {
        // sort by created_at desc, take 5 non-pending (pending already shown above)
        const recent = [...bookings]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .filter(b => b.status !== "PENDING")
          .slice(0, 5);

        if (!recent.length) {
          activityList.innerHTML = `
            <div class="todayActivityEmpty">
              <i data-lucide="activity"></i>
              <span>No recent activity yet.</span>
            </div>`;
        } else {
          activityList.innerHTML = `<div class="activityFeed">${recent.map(b => activityRowHTML(b)).join("")}</div>`;
        }
      }

      lucide.createIcons();
    }

    function todayEventRow(b) {
      const listing = b.listing || {};
      const tenant = b.resident_name || b.resident_email || "Resident";

      return `
        <div class="todayEventCard todayEvent--in">
          <div class="todayEventIcon"><i data-lucide="log-in"></i></div>
          <div class="todayEventBody">
            <div class="todayEventLabel">Move-in today</div>
            <div class="todayEventTenant">${escapeHtml(tenant)}</div>
            <div class="todayEventListing">${escapeHtml(listing.title || "Untitled listing")}</div>
          </div>
          <div class="todayEventBadge todayEvent--in">Move-in</div>
        </div>`;
    }

    function activityRowHTML(b) {
      const listing = b.listing || {};
      const status = b.status || "PENDING";
      const statusMap = {
        APPROVED: { cls: "bkStatus--approved", label: "Approved", icon: "check-circle-2" },
        REJECTED: { cls: "bkStatus--rejected", label: "Rejected", icon: "x-circle" },
        CANCELLED: { cls: "bkStatus--cancelled", label: "Cancelled", icon: "ban" },
      };
      const { cls, label, icon } = statusMap[status] || { cls: "", label: status, icon: "circle" };
      const tenant = b.resident_name || b.resident_email || "Resident";
      const timeAgo = relativeTime(b.updated_at || b.created_at);

      return `
        <div class="activityRow">
          <div class="activityIcon activityIcon--${status.toLowerCase()}">
            <i data-lucide="${icon}"></i>
          </div>
          <div class="activityBody">
            <div class="activityMain">
              <span class="activityTenant">${escapeHtml(tenant)}</span>
              <span class="activityVerb">booking</span>
              <span class="bkStatus ${cls}">${label}</span>
            </div>
            <div class="activityMeta">${escapeHtml(listing.title || "Untitled listing")} · ${timeAgo}</div>
          </div>
        </div>`;
    }

    function relativeTime(dt) {
      try {
        const diff = Date.now() - new Date(dt).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(dt).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      } catch {
        return "";
      }
    }

    // ===== Bookings state + filter (lives inside Today tab) =====
    let _allBookings = [];
    let _bkStatus = "ALL";

    function applyBookingFilter() {
      const list = document.getElementById("bookingsList");
      if (!list) return;

      const filtered = _bkStatus === "ALL"
        ? _allBookings
        : _allBookings.filter(b => b.status === _bkStatus);

      if (!filtered.length) {
        const label = _bkStatus === "ALL" ? "bookings" : `${_bkStatus.toLowerCase()} bookings`;
        list.innerHTML = `
          <div class="bkEmpty">
            <div class="bkEmptyIcon"><i data-lucide="calendar-x-2"></i></div>
            <div class="bkEmptyTitle">No ${label} yet</div>
          </div>`;
        lucide.createIcons();
        return;
      }

      list.innerHTML = filtered.map(b => bookingCardHTML(b)).join("");
      bindBookingActions(list, () => renderToday());
      lucide.createIcons();
    }

    // Filter bar clicks
    document.querySelectorAll(".bkFilterBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".bkFilterBtn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _bkStatus = btn.dataset.status;
        applyBookingFilter();
      });
    });

    // ===== Booking card HTML =====
    function bookingCardHTML(b) {
      const listing = b.listing || {};
      const status = b.status || "PENDING";
      const isPending = status === "PENDING";

      const statusMap = {
        PENDING: { cls: "bkStatus--pending", label: "Pending" },
        APPROVED: { cls: "bkStatus--approved", label: "Approved" },
        REJECTED: { cls: "bkStatus--rejected", label: "Rejected" },
        CANCELLED: { cls: "bkStatus--cancelled", label: "Cancelled" },
      };
      const { cls, label } = statusMap[status] || statusMap.PENDING;

      const price = listing.price
        ? `<span class="bkListingPrice">₱${Number(listing.price).toLocaleString()}<span>/mo</span></span>`
        : "";

      const coverEl = listing.cover
        ? `<img class="bkListingThumb" src="${escapeHtml(listing.cover)}" alt="">`
        : `<div class="bkListingThumb bkListingThumb--placeholder"><i data-lucide="home"></i></div>`;

      const moveIn = b.move_in_date
        ? `<span class="bkMeta"><i data-lucide="calendar"></i>${escapeHtml(b.move_in_date)}</span>`
        : "";

      const message = b.message
        ? `<div class="bkMessage">"${escapeHtml(b.message)}"</div>`
        : "";

      const ownerNote = b.owner_note
        ? `<div class="bkOwnerNote"><i data-lucide="message-square"></i>${escapeHtml(b.owner_note)}</div>`
        : "";

      const actions = isPending ? `
        <div class="bkActions">
          <button class="btn bkBtn bkBtn--approve" data-booking-id="${b.id}" data-action="approve">
            <i data-lucide="check"></i> Approve
          </button>
          <button class="btn bkBtn bkBtn--reject" data-booking-id="${b.id}" data-action="reject">
            <i data-lucide="x"></i> Reject
          </button>
        </div>` : "";

      return `
        <div class="bkCard" data-booking-id="${b.id}">
          <div class="bkCardMain">
            ${coverEl}
            <div class="bkCardBody">
              <div class="bkCardTop">
                <div class="bkListingName">${escapeHtml(listing.title || "Untitled listing")}</div>
                <span class="bkStatus ${cls}">${label}</span>
              </div>
              <div class="bkListingLoc">${escapeHtml([listing.barangay, listing.city].filter(Boolean).join(", ") || "—")}</div>
              <div class="bkMetaRow">
                ${moveIn}
                <span class="bkMeta"><i data-lucide="clock-3"></i>${escapeHtml(niceDate(b.created_at))}</span>
              </div>
              ${message}
              ${ownerNote}
            </div>
            ${price}
          </div>
          ${actions}
        </div>`;
    }

    // ===== Bind approve/reject buttons =====
    function bindBookingActions(container, onRefresh) {
      container.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const bookingId = btn.dataset.bookingId;
          const action = btn.dataset.action;

          if (action === "approve") {
            openModal({
              title: "Approve booking?",
              message: "The resident will be notified that their booking has been approved.",
              confirmText: "Approve",
              onConfirm: async () => {
                try {
                  await apiFetch(`/bookings/${bookingId}/approve`, { method: "POST" });
                  await onRefresh();
                } catch (err) {
                  alert(err?.error || "Failed to approve booking.");
                }
              }
            });
          }

          if (action === "reject") {
            // Use the existing modal — note field via prompt fallback
            const note = window.prompt("Add a note for the resident (optional):", "") ?? "";
            openModal({
              title: "Reject booking?",
              message: note ? `Note to resident: "${note}"` : "The resident will be notified that their booking was not accepted.",
              confirmText: "Reject",
              danger: true,
              onConfirm: async () => {
                try {
                  await apiFetch(`/bookings/${bookingId}/reject`, {
                    method: "POST",
                    body: JSON.stringify({ note: note || null }),
                  });
                  await onRefresh();
                } catch (err) {
                  alert(err?.error || "Failed to reject booking.");
                }
              }
            });
          }
        });
      });
    }

    // Boot
    renderTabs();

  });
})();