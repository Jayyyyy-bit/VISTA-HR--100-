(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.AuthGuard) {
      console.error("AuthGuard missing. Check /auth/sessionGuard.js path.");
      showInfo("AuthGuard missing. Fix sessionGuard.js include/path.");
      return;
    }
    if (!window.ListingStore) {
      console.error("ListingStore missing. Check /core/store.js path.");
      showInfo("ListingStore missing. Fix store.js include/path.");
      return;
    }

    const ok = await window.AuthGuard.requireOwner();
    if (!ok) return;

    const API_BASE = "/api";
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

    // ── Dashboard avatar helper ─────────────────────────────────────────
    function applyDashboardAvatar(user) {
      const url = (user.avatar_url || "").trim();
      const initial = (user.first_name?.[0] || user.email?.[0] || "O").toUpperCase();

      // Topbar button
      const circle = document.getElementById("avatarCircle");
      const img = document.getElementById("avatarImg");
      // Sidebar / today panel
      const sCircle = document.getElementById("sidebarAvatar");
      const sImg = document.getElementById("sidebarAvatarImg");

      if (url) {
        if (circle) circle.hidden = true;
        if (img) { img.src = url; img.hidden = false; }
        if (sCircle) sCircle.hidden = true;
        if (sImg) { sImg.src = url; sImg.hidden = false; }
      } else {
        if (circle) { circle.textContent = initial; circle.hidden = false; }
        if (img) { img.hidden = true; img.src = ""; }
        if (sCircle) { sCircle.textContent = initial; sCircle.hidden = false; }
        if (sImg) { sImg.hidden = true; sImg.src = ""; }
      }
    }

    // Avatar — requireOwner() already called fetchMe() + saveSession(),
    // so getSession() is already fresh here. No extra fetch needed.
    try {
      const user = AuthGuard.getSession?.()?.user;
      if (user) applyDashboardAvatar(user);
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
      // Re-query every time — avoids stale null refs from early init
      const modalOverlay = document.getElementById("modalOverlay");
      const modalTitle = document.getElementById("modalTitle");
      const modalMessage = document.getElementById("modalMessage");
      const modalCancel = document.getElementById("modalCancel");
      const modalConfirm = document.getElementById("modalConfirm");

      if (!modalOverlay || !modalTitle || !modalMessage || !modalCancel || !modalConfirm) {
        const yes = window.confirm(`${title}\n\n${message}`);
        if (yes && !confirmDisabled) onConfirm?.();
        else onCancel?.();
        return;
      }

      modalTitle.textContent = title || "Confirm";
      modalMessage.textContent = message || "";
      // modalExtra is pre-populated by caller — do not clear it here
      // Inject extra HTML (e.g. form fields) below message
      // Don't clear modalExtra — caller pre-populates it before calling openModal
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

    window.DashModal = { open: openModal };

    // Expose openModal globally for dashboard-today.js


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
        return;
      }

      const gridListings = listings.filter(l => {
        const bk = String(l.booking_status || "").toUpperCase();
        const st = String(l.status || "").toUpperCase();
        return !(st === "PUBLISHED" && (bk === "APPROVED" || bk === "ACTIVE"));
      });

      listingGrid.innerHTML = gridListings.map((l) => {
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

      renderOccupancySections(listings);
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
                    showError(err?.message || err?.error || "Unable to continue editing.");
                  }
                }
              });
            } else {
              try {
                await window.ListingStore.openListing(id);
                location.href = `${WIZARD_URL}#/step-${step}`;
              } catch (err) {
                console.error(err);
                showError(err?.message || err?.error || "Unable to continue editing.");
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
                  const res = await fetch(`/api/listings/${id}/pull`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.error || "Failed to unpublish.");
                  }
                  await renderListings();
                } catch (err) {
                  showError(err.message || "Failed to unpublish.");
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
                  location.href = `/auth/account-settings.html#email?email=${email}`;
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
                  showError(err?.message || err?.error || "Publish failed.");
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
                  showError(err?.message || err?.error || "Delete failed.");
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

    function renderOccupancySections(listings) {
      const row = document.getElementById("occupancyRow");
      if (!row) return;

      const reserved = listings.filter(l => {
        const bk = String(l.booking_status || "").toUpperCase();
        const st = String(l.status || "").toUpperCase();
        return st === "PUBLISHED" && (bk === "APPROVED" || bk === "VIEWING_SCHEDULED");
      });
      const occupied = listings.filter(l => {
        const bk = String(l.booking_status || "").toUpperCase();
        const st = String(l.status || "").toUpperCase();
        return st === "PUBLISHED" && bk === "ACTIVE";
      });

      if (!reserved.length && !occupied.length) {
        row.hidden = true;
        return;
      }

      row.hidden = false;

      // Build mosaics
      buildMosaic("reservedMosaic", reserved);
      buildMosaic("occupiedMosaic", occupied);

      document.getElementById("reservedCount").textContent =
        `${reserved.length} listing${reserved.length !== 1 ? "s" : ""}`;
      document.getElementById("occupiedCount").textContent =
        `${occupied.length} listing${occupied.length !== 1 ? "s" : ""}`;

      // Store data for click expand
      window._occData = { reserved, occupied };

      // Album click handlers
      document.getElementById("reservedAlbum").onclick = () => openOccExpanded("Reserved", reserved);
      document.getElementById("occupiedAlbum").onclick = () => openOccExpanded("Occupied", occupied);

      // Close handler
      document.getElementById("occExpandedClose").onclick = () => {
        document.getElementById("occExpandedPanel").classList.remove("open");
      };

      if (window.lucide?.createIcons) lucide.createIcons();
    }

    function buildMosaic(containerId, listings) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const photos = [];
      for (const l of listings) {
        const imgs = galleryImages(l);
        if (imgs[0]) photos.push(imgs[0]);
        if (photos.length >= 4) break;
      }
      let html = "";
      for (let i = 0; i < 4; i++) {
        if (photos[i]) {
          html += `<img src="${escapeHtml(photos[i])}" alt="Listing" loading="lazy" />`;
        } else {
          html += `<div class="occAlbumPlaceholder"><i data-lucide="image"></i></div>`;
        }
      }
      el.innerHTML = html;
    }

    function openOccExpanded(title, listings) {
      const panel = document.getElementById("occExpandedPanel");
      const backdrop = document.getElementById("occBackdrop");
      const titleEl = document.getElementById("occExpandedTitle");
      const listEl = document.getElementById("occExpandedList");

      document.getElementById("occDetailPanel").hidden = true;
      titleEl.textContent = `${title} (${listings.length})`;

      if (!listings.length) {
        listEl.innerHTML = `<div class="occEmpty">No ${title.toLowerCase()} listings</div>`;
      } else {
        listEl.innerHTML = listings.map((l, i) => {
          const images = galleryImages(l);
          const thumb = images[0]
            ? `<img class="occThumb" src="${escapeHtml(images[0])}" alt="Listing" />`
            : `<div class="occThumb"></div>`;
          const name = (l.title || "").trim() || "Untitled space";
          const type = title === "Reserved" ? "reserved" : "occupied";
          const label = title === "Reserved" ? "Reserved" : "Occupied";
          const meta = title === "Reserved" ? "Booking approved" : "Currently occupied";
          return `<div class="occItem" data-occ-idx="${i}" style="cursor:pointer;">
                    ${thumb}
                    <div class="occInfo">
                        <div class="occTitle">${escapeHtml(name)}</div>
                        <div class="occMeta">${meta}</div>
                    </div>
                    <span class="occBadge occBadge--${type}">${label}</span>
                </div>`;
        }).join("");

        // Click a listing item → show detail
        listEl.querySelectorAll(".occItem").forEach(item => {
          item.addEventListener("click", () => {
            const idx = parseInt(item.dataset.occIdx);
            const l = listings[idx];
            if (!l) return;
            showOccDetail(l, title);
          });
        });
      }

      panel.classList.add("open");
      backdrop.classList.add("open");
      if (window.lucide?.createIcons) lucide.createIcons();
    }

    async function showOccDetail(l, type) {
      const panel = document.getElementById("occDetailPanel");
      const images = galleryImages(l);
      const cap = typeof l.capacity === "object" ? l.capacity : {};
      const loc = typeof l.location === "object" ? l.location : {};

      document.getElementById("occDetailTitle").textContent = (l.title || "").trim() || "Untitled space";

      const imgEl = document.getElementById("occDetailImg");
      if (images[0]) { imgEl.src = images[0]; imgEl.style.display = "block"; }
      else { imgEl.style.display = "none"; }

      const bkStatus = String(l.booking_status || "").toUpperCase();
      const statusLabels = {
        APPROVED: "Approved — Awaiting viewing",
        VIEWING_SCHEDULED: "Viewing Scheduled",
        ACTIVE: "Occupied",
      };
      document.getElementById("occDetailStatus").textContent = statusLabels[bkStatus] || type;
      document.getElementById("occDetailPrice").textContent = cap.monthly_rent ? `₱${Number(cap.monthly_rent).toLocaleString()}/mo` : "On request";
      document.getElementById("occDetailLocation").textContent = [loc.city, loc.barangay].filter(Boolean).join(", ") || "—";
      document.getElementById("occDetailType").textContent = l.place_type || "—";

      // Viewing + payment wrap
      const viewingWrap = document.getElementById("occViewingWrap");

      // Fetch booking detail for proof + verified status
      let booking = null;
      if (l.booking_id) {
        try {
          const d = await apiFetch(`/bookings/${l.booking_id}/receipt`);
          booking = d.receipt || null;
        } catch { /* silent */ }
      }

      if (viewingWrap) {
        viewingWrap.hidden = false;
        let html = "";

        if (bkStatus === "APPROVED") {
          html = `<button id="occScheduleViewingBtn"
              style="width:100%;padding:8px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i data-lucide="eye" style="width:14px;height:14px;"></i> Schedule Viewing
            </button>`;
        } else if (bkStatus === "VIEWING_SCHEDULED") {
          html = `<div style="font-size:12px;color:#1d4ed8;background:#eff6ff;border-radius:8px;padding:8px 10px;margin-bottom:8px;">
              <i data-lucide="calendar-clock" style="width:13px;height:13px;"></i>
              Viewing: <strong>${l.viewing_date ? new Date(l.viewing_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}</strong>
            </div>`;

          // Payment proof section
          if (booking?.payment_proof_url) {
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">Payment Proof</div>
                <a href="${escapeHtml(booking.payment_proof_url)}" target="_blank"
                   style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#1d4ed8;text-decoration:none;background:#eff6ff;padding:5px 10px;border-radius:6px;border:1px solid #bfdbfe;">
                   <i data-lucide="file-text" style="width:13px;height:13px;"></i> View proof
                </a>
                ${booking.payment_verified
                ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#15803d;background:#f0fdf4;padding:5px 10px;border-radius:6px;border:1px solid #bbf7d0;margin-left:6px;"><i data-lucide="check-circle-2" style="width:13px;height:13px;"></i> Verified</span>`
                : `<button id="occVerifyPaymentBtn" data-booking-id="${l.booking_id}"
                       style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#fff;background:#15803d;padding:5px 10px;border-radius:6px;border:none;cursor:pointer;margin-left:6px;">
                       <i data-lucide="check" style="width:13px;height:13px;"></i> Verify payment
                     </button>`
              }
              </div>`;
          } else {
            html += `<div style="font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:7px 10px;margin-top:8px;">
                <i data-lucide="clock" style="width:13px;height:13px;"></i> Awaiting payment proof from resident
              </div>`;
          }
        }

        viewingWrap.innerHTML = html;

        // Bind schedule viewing btn
        const schedBtn = document.getElementById("occScheduleViewingBtn");
        if (schedBtn) schedBtn.onclick = () => openScheduleViewingModal(l.booking_id);

        // Bind verify payment btn
        const verifyBtn = document.getElementById("occVerifyPaymentBtn");
        if (verifyBtn) {
          verifyBtn.onclick = async () => {
            verifyBtn.disabled = true;
            verifyBtn.textContent = "Verifying…";
            try {
              await apiFetch(`/bookings/${verifyBtn.dataset.bookingId}/verify-payment`, {
                method: "PATCH",
                body: JSON.stringify({ verified: true }),
              });
              if (window.showSuccess) showSuccess("Payment verified! Resident can now be confirmed for move-in.");
              showOccDetail(l, type); // refresh panel
            } catch (e) {
              if (window.showToast) showToast(e?.error || "Failed.", "error");
              verifyBtn.disabled = false;
            }
          };
        }
      }

      panel.hidden = false;
      if (window.lucide?.createIcons) lucide.createIcons();
    } async function showOccDetail(l, type) {
      const panel = document.getElementById("occDetailPanel");
      const images = galleryImages(l);
      const cap = typeof l.capacity === "object" ? l.capacity : {};
      const loc = typeof l.location === "object" ? l.location : {};

      document.getElementById("occDetailTitle").textContent = (l.title || "").trim() || "Untitled space";

      const imgEl = document.getElementById("occDetailImg");
      if (images[0]) { imgEl.src = images[0]; imgEl.style.display = "block"; }
      else { imgEl.style.display = "none"; }

      const bkStatus = String(l.booking_status || "").toUpperCase();
      const statusLabels = {
        APPROVED: "Approved — Awaiting viewing",
        VIEWING_SCHEDULED: "Viewing Scheduled",
        ACTIVE: "Occupied",
      };
      document.getElementById("occDetailStatus").textContent = statusLabels[bkStatus] || type;
      document.getElementById("occDetailPrice").textContent = cap.monthly_rent ? `₱${Number(cap.monthly_rent).toLocaleString()}/mo` : "On request";
      document.getElementById("occDetailLocation").textContent = [loc.city, loc.barangay].filter(Boolean).join(", ") || "—";
      document.getElementById("occDetailType").textContent = l.place_type || "—";

      // Viewing + payment wrap
      const viewingWrap = document.getElementById("occViewingWrap");

      // Fetch booking detail for proof + verified status
      let booking = null;
      if (l.booking_id) {
        try {
          const d = await apiFetch(`/bookings/${l.booking_id}/receipt`);
          booking = d.receipt || null;
        } catch { /* silent */ }
      }

      if (viewingWrap) {
        viewingWrap.hidden = false;
        let html = "";

        if (bkStatus === "APPROVED") {
          html = `<button id="occScheduleViewingBtn"
              style="width:100%;padding:8px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
              <i data-lucide="eye" style="width:14px;height:14px;"></i> Schedule Viewing
            </button>`;
        } else if (bkStatus === "VIEWING_SCHEDULED") {
          html = `<div style="font-size:12px;color:#1d4ed8;background:#eff6ff;border-radius:8px;padding:8px 10px;margin-bottom:8px;">
              <i data-lucide="calendar-clock" style="width:13px;height:13px;"></i>
              Viewing: <strong>${l.viewing_date ? new Date(l.viewing_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "TBD"}</strong>
            </div>`;

          // Payment proof section
          if (booking?.payment_proof_url) {
            html += `<div style="margin-top:8px;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">Payment Proof</div>
                <a href="${escapeHtml(booking.payment_proof_url)}" target="_blank"
                   style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#1d4ed8;text-decoration:none;background:#eff6ff;padding:5px 10px;border-radius:6px;border:1px solid #bfdbfe;">
                   <i data-lucide="file-text" style="width:13px;height:13px;"></i> View proof
                </a>
                ${booking.payment_verified
                ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#15803d;background:#f0fdf4;padding:5px 10px;border-radius:6px;border:1px solid #bbf7d0;margin-left:6px;"><i data-lucide="check-circle-2" style="width:13px;height:13px;"></i> Verified</span>`
                : `<button id="occVerifyPaymentBtn" data-booking-id="${l.booking_id}"
                       style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#fff;background:#15803d;padding:5px 10px;border-radius:6px;border:none;cursor:pointer;margin-left:6px;">
                       <i data-lucide="check" style="width:13px;height:13px;"></i> Verify payment
                     </button>`
              }
              </div>`;
          } else {
            html += `<div style="font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:7px 10px;margin-top:8px;">
                <i data-lucide="clock" style="width:13px;height:13px;"></i> Awaiting payment proof from resident
              </div>`;
          }
        }

        viewingWrap.innerHTML = html;

        // Bind schedule viewing btn
        const schedBtn = document.getElementById("occScheduleViewingBtn");
        if (schedBtn) schedBtn.onclick = () => openScheduleViewingModal(l.booking_id);

        // Bind verify payment btn
        const verifyBtn = document.getElementById("occVerifyPaymentBtn");
        if (verifyBtn) {
          verifyBtn.onclick = async () => {
            verifyBtn.disabled = true;
            verifyBtn.textContent = "Verifying…";
            try {
              await apiFetch(`/bookings/${verifyBtn.dataset.bookingId}/verify-payment`, {
                method: "PATCH",
                body: JSON.stringify({ verified: true }),
              });
              if (window.showSuccess) showSuccess("Payment verified! Resident can now be confirmed for move-in.");
              showOccDetail(l, type); // refresh panel
            } catch (e) {
              if (window.showToast) showToast(e?.error || "Failed.", "error");
              verifyBtn.disabled = false;
            }
          };
        }
      }

      panel.hidden = false;
      if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeOccExpanded() {
      document.getElementById("occExpandedPanel").classList.remove("open");
      document.getElementById("occBackdrop").classList.remove("open");
      document.getElementById("occDetailPanel").hidden = true;
    }

    document.getElementById("occExpandedClose")?.addEventListener("click", closeOccExpanded);
    document.getElementById("occBackdrop")?.addEventListener("click", closeOccExpanded);

    function openScheduleViewingModal(bookingId) {
      openModal({
        title: "Schedule Viewing",
        message: "Set a viewing date and optional notes for the resident.",
        confirmText: "Schedule",
        cancelText: "Cancel",
        onConfirm: async () => {
          const dateVal = document.getElementById("viewingDateInput")?.value;
          const notesVal = (document.getElementById("viewingNotesInput")?.value || "").trim() || null;
          if (!dateVal) { if (window.showError) showError("Please pick a date."); return; }
          try {
            const res = await fetch(`${API}/bookings/${bookingId}/status`, {
              method: "PATCH", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "VIEWING_SCHEDULED", viewing_date: dateVal, viewing_notes: notesVal }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to schedule viewing.");
            if (window.showSuccess) showSuccess("Viewing scheduled! Resident has been notified.");
            closeOccExpanded();
          } catch (e) {
            if (window.showError) showError(e.message);
          }
        },
        extraHTML: `
          <div style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem">
            <label style="font-size:0.8rem;font-weight:600;color:#374151">Viewing Date & Time</label>
            <input type="datetime-local" id="viewingDateInput" style="padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;width:100%">
            <label style="font-size:0.8rem;font-weight:600;color:#374151">Notes (optional)</label>
            <input type="text" id="viewingNotesInput" placeholder="e.g. Bring valid ID" style="padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:8px;font-size:0.9rem;width:100%">
          </div>`,
      });
    }

    function fmtDate(dt) {
      if (!dt) return "—";
      try { return new Date(dt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); }
      catch { return "—"; }
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
    menuHelp?.addEventListener("click", () => { openMenu(false); showInfo("Help center (later)."); });
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
  const API_NOTIF = "/api";

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
        badge.textContent = unread > 9 ? "9+" : unread;
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
        if (notifType.includes("MESSAGE")) redirectUrl = "/Property-Owner/dashboard/property-owner-dashboard.html#/messages";
        else if (notifType.includes("BOOKING")) redirectUrl = "/Property-Owner/dashboard/property-owner-dashboard.html#listings";
        else if (notifType.includes("KYC") || notifType.includes("VERIF")) redirectUrl = "/auth/account-settings.html#verification";
        else if (notifType.includes("TICKET")) redirectUrl = "/shared/my-tickets.html";

        return `<div class="notif-item${n.is_read ? "" : " unread"}" data-id="${n.id}"
                    style="cursor:${redirectUrl ? 'pointer' : 'default'}"
                    ${redirectUrl ? `data-redirect="${redirectUrl}"` : ""}>
                    <div class="notif-item-dot"></div>
                    <div class="notif-item-body">
                        <div class="notif-item-title">${escapeHtmlN(n.title || "")}</div>
                        ${n.body ? `<div class="notif-item-body-txt">${escapeHtmlN(n.body)}</div>` : ""}
                        <div class="notif-item-time">${time}</div>
                    </div>
                    <button class="notif-delete" data-notif-del="${n.id}"><i data-lucide="trash-2"></i></button>
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
  // Mark all read button
  elN("notifMarkRead")?.addEventListener("click", markAllRead);

  // Mark single as read on click + redirect
  elN("notifList")?.addEventListener("click", async (e) => {
    const item = e.target.closest(".notif-item[data-redirect]");
    if (!item) return;
    if (e.target.closest("[data-notif-del]")) return;
    const id = item.dataset.id;
    const redirect = item.dataset.redirect;
    if (id && item.classList.contains("unread")) {
      item.classList.remove("unread");
      fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" }).catch(() => { });
      const badge = elN("notifBadge");
      if (badge) {
        const cur = parseInt(badge.textContent, 10) || 0;
        const next = Math.max(0, cur - 1);
        badge.textContent = next > 9 ? "9+" : String(next);
        badge.hidden = next === 0;
      }
    }
    if (redirect) window.location.href = redirect;
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    const wrap = elN("notifWrap");
    if (wrap && !wrap.contains(e.target)) {
      const panel = elN("notifPanel");
      if (panel) panel.hidden = true;
    }
  });

  // Initial load + poll every 10s
  loadNotifications();
  setInterval(loadNotifications, 10_000);

  document.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-notif-del]");
    if (!delBtn) return;
    const id = delBtn.dataset.notifDel;
    const item = delBtn.closest(".notif-item");
    if (item) {
      item.style.transform = "translateX(-100%)";
      item.style.opacity = "0";
      setTimeout(() => item.remove(), 200);
    }
    fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" }).catch(() => { });
  });


})();