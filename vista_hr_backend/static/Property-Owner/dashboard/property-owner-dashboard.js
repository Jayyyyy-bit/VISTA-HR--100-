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
        // Backend stores UTC datetimes without 'Z' suffix — force UTC parsing
        // so toLocaleString with Asia/Manila shows correct PH local time
        const iso = dt && !String(dt).includes('+') && !String(dt).endsWith('Z')
          ? dt + 'Z' : dt;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Manila",
        });
      } catch {
        return "—";
      }
    }

    function statusBadge(listing) {
      const st = String(listing?.status || "").toUpperCase();
      // Check booking status for occupied/reserved display
      const bkStatus = String(listing?.booking_status || "").toUpperCase();
      if (st === "PUBLISHED" && bkStatus === "ACTIVE") return { text: "Occupied", cls: "occupied" };
      if (st === "PUBLISHED" && bkStatus === "APPROVED") return { text: "Reserved", cls: "reserved" };
      if (st === "PUBLISHED") return { text: "Published", cls: "published" };
      if (st === "READY" || listing?.complete) return { text: "Ready to publish", cls: "ready" };
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

        const canSubmit = status === "READY" || l.complete;
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
    data-status="${escapeHtml(status)}"
    data-booking-status="${escapeHtml(l.booking_status || '')}"
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
          ${!isPublished ? `
            <button type="button" class="lIconAction" data-act="edit" aria-label="Edit listing">
              <i data-lucide="edit-3"></i>
              <span class="lIconTip">Edit listing</span>
            </button>
          ` : `
            <button type="button" class="lIconAction" data-act="edit" aria-label="Edit listing">
              <i data-lucide="edit-3"></i>
              <span class="lIconTip">Edit</span>
            </button>
            <button type="button" class="lIconAction warn" data-act="unpublish" aria-label="Unpublish listing">
              <i data-lucide="eye-off"></i>
              <span class="lIconTip">Unpublish</span>
            </button>
          `}

          ${canSubmit && !isPublished ? `
            <button type="button" class="lIconAction" data-act="submit" aria-label="Publish listing">
              <i data-lucide="send"></i>
              <span class="lIconTip">Publish listing</span>
            </button>
          ` : ``}

          ${!isPublished ? `
            <button type="button" class="lIconAction danger" data-act="delete" aria-label="Delete listing">
              <i data-lucide="trash-2"></i>
              <span class="lIconTip">Delete listing</span>
            </button>
          ` : ``}
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
            const isPublished = (card.dataset.status || "").toUpperCase() === "PUBLISHED";
            if (isPublished) {
              // Warn owner that editing will unpublish the listing
              openModal({
                title: "Edit published listing?",
                message: "Your listing will be set to Draft while you make changes. Residents won't see it until you re-publish. Continue?",
                confirmText: "Yes, edit it",
                cancelText: "Cancel",
                onConfirm: async () => {
                  try {
                    await window.ListingStore.openListing(id);
                    location.href = `${WIZARD_URL}#/step-${step}`;
                  } catch (err) {
                    console.error(err);
                    alert(err?.message || err?.error || "Unable to continue editing.");
                  }
                }
              });
            } else {
              try {
                await window.ListingStore.openListing(id);
                location.href = `${WIZARD_URL}#/step-${step}`;
              } catch (err) {
                console.error(err);
                alert(err?.message || err?.error || "Unable to continue editing.");
              }
            }
            return;
          }

          if (act === "unpublish") {
            // Check if listing has active booking — if so, block unpublish
            const bkStatus = (card.dataset.bookingStatus || "").toUpperCase();
            if (bkStatus === "ACTIVE" || bkStatus === "APPROVED") {
              openModal({
                title: "Cannot unpublish",
                message: "This listing has an active reservation or move-in. It cannot be unpublished until the booking is completed or cancelled.",
                confirmText: "Got it",
                cancelText: null,
                onConfirm: () => { }
              });
              return;
            }
            openModal({
              title: "Unpublish this listing?",
              message: "Are you sure you want to pull this listing? It will no longer be visible to residents.",
              confirmText: "Yes, unpublish it",
              cancelText: "Cancel",
              onConfirm: async () => {
                try {
                  // Set status back to DRAFT via step-8 or a direct patch
                  // Use submit-for-verification in reverse - set back to DRAFT
                  // by patching step-8 with a special unpublish flag
                  const res = await fetch(`http://127.0.0.1:5000/api/listings/${id}/pull`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.error || "Failed to unpublish.");
                  }
                  await renderListings();
                } catch (err) {
                  alert(err.message || "Failed to unpublish.");
                }
              }
            });
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
            const bkStatusDel = (card.dataset.bookingStatus || "").toUpperCase();
            if (bkStatusDel === "ACTIVE" || bkStatusDel === "APPROVED") {
              openModal({
                title: "Cannot delete",
                message: "This listing has an active reservation. It cannot be deleted until the booking is completed or cancelled.",
                confirmText: "Got it",
                cancelText: null,
                onConfirm: () => { }
              });
              return;
            }
            openModal({
              title: "Delete listing?",
              message: "This will permanently remove the listing from the database.",
              confirmText: "Delete",
              cancelText: "Cancel",
              danger: true,
              onConfirm: async () => {
                try {
                  // Use ListingStore.deleteListing instead of raw apiFetch so
                  // the local draft entry and localStorage map are cleaned up.
                  // Calling apiFetch directly leaves orphan draft-* keys in
                  // localStorage that poison future resume/create flows.
                  await window.ListingStore.deleteListing(id);
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

      if (key === "today") { window.DashToday?.render(); window.DashToday?.bindFilterBar?.(); }
      if (key === "listings") renderListings();
      if (key === "messages") window.MessagesPanel?.init?.();

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



    // Boot
    renderTabs();

  });

  // ══════════════════════════════════════════════════════════
  // NOTIFICATIONS — Bell dropdown (Property Owner)
  // ══════════════════════════════════════════════════════════
  const API_NOTIF = "http://127.0.0.1:5000/api";

  // escapeHtml needs to be in outer scope so loadNotifications can access it
  function escapeHtmlN(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function elN(id) { return document.getElementById(id); }

  async function loadNotifications() {
    try {
      const res = await fetch(`${API_NOTIF}/notifications`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const notifs = data.notifications || [];
      const unread = data.unread ?? 0;

      // Update badge
      const badge = elN("notifBadge");
      if (badge) {
        badge.textContent = unread > 10 ? "10+" : unread;
        badge.hidden = unread === 0;
      }

      // Render list
      const list = elN("notifList");
      if (!list) return;

      if (!notifs.length) {
        list.innerHTML = `<div class="notif-empty"><i data-lucide="bell-off"></i><p>No notifications yet</p></div>`;
        if (window.lucide?.createIcons) lucide.createIcons();
        return;
      }

      list.innerHTML = notifs.map(n => {
        const time = n.created_at
          ? new Date((n.created_at.includes("+") || n.created_at.endsWith("Z") ? n.created_at : n.created_at + "Z"))
            .toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
          : "";
        // Determine redirect URL based on notification type
        const notifType = (n.notif_type || n.type || "").toUpperCase();
        let redirectUrl = null;

        if (notifType.includes("MESSAGE")) {
          const params = new URLSearchParams();
          const senderMatch = String(n.title || "").match(/^New message from\s+(.+)$/i);
          const listingMatch = String(n.body || "").match(/^Re:\s*(.+?)(?:\s+[—-]\s+|$)/i);

          if (senderMatch?.[1]) params.set("sender", senderMatch[1].trim());
          if (listingMatch?.[1]) params.set("listing", listingMatch[1].trim());

          const query = params.toString();
          redirectUrl = `/Property-Owner/dashboard/property-owner-dashboard.html${query ? `?${query}` : ""}#/messages`;
        } else if (notifType.includes("BOOKING")) {
          redirectUrl = "/Property-Owner/dashboard/property-owner-dashboard.html";
        } else if (notifType.includes("KYC") || notifType.includes("VERIF")) {
          redirectUrl = "/Property-Owner/verification/verify.html";
        }

        return `<div class="notif-item${n.is_read ? "" : " unread"}" data-id="${n.id}"
                    style="cursor:${redirectUrl ? 'pointer' : 'default'}"
                    ${redirectUrl ? `onclick="window.location.href='${redirectUrl}'"` : ""}>
                    <div class="notif-item-dot"></div>
                    <div class="notif-item-body">
                        <div class="notif-item-title">${escapeHtmlN(n.title || "")}</div>
                        ${n.body ? `<div class="notif-item-body-txt">${escapeHtmlN(n.body)}</div>` : ""}
                        <div class="notif-item-time">${time}</div>
                    </div>
                    ${redirectUrl ? '<div class="notif-item-arrow">›</div>' : ""}
                </div>`;
      }).join("");

      if (window.lucide?.createIcons) lucide.createIcons();
    } catch (err) {
      console.warn("[Notif] load failed", err);
    }
  }

  async function markAllRead() {
    try {
      await fetch(`${API_NOTIF}/notifications/mark-read`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      // Clear badge + mark items read visually
      const badge = elN("notifBadge");
      if (badge) { badge.textContent = "0"; badge.hidden = true; }
      document.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
    } catch (err) { console.warn("[Notif] mark-read failed", err); }
  }

  // Toggle panel
  elN("notifBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = elN("notifPanel");
    if (!panel) return;
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    if (!isOpen) loadNotifications(); // refresh on open
  });

  // Mark all read button
  elN("notifMarkRead")?.addEventListener("click", markAllRead);

  // Close on outside click
  document.addEventListener("click", (e) => {
    const wrap = elN("notifWrap");
    if (wrap && !wrap.contains(e.target)) {
      const panel = elN("notifPanel");
      if (panel) panel.hidden = true;
    }
  });

  // Initial load + poll every 60s
  loadNotifications();
  setInterval(loadNotifications, 60_000);

})();