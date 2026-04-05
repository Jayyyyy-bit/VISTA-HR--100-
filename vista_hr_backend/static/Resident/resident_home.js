/* ============================================================
   VISTA-HR · Resident Home JS
   - Horizontal scroll rows with curated categories
   - Filter panel + search dropdown
   - Detail drawer
   - Auth-aware header
============================================================ */

const API = "/api";

// ── State ──
const state = {
  all: [],
  saved: new Set(),
  filters: { type: "", city: "", minPrice: 0, maxPrice: 0, availOnly: false, tourOnly: false },
  mode: "default", // "default" | "filtered"
  filteredPage: 0,
  perPage: 12,
};

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  if (window.AuthGuard?.requireResident) {
    const ok = await window.AuthGuard.requireResident();
    if (!ok) return;
  }

  lucide.createIcons();
  setupEmailVerifyBanner();
  setupHeader();
  setupSearchPill();
  setupCategoryBar();
  setupFilterPanel();
  setupDropdownClose();

  await loadListings();

  // Escape key closes booking modal
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const mo = $("bmModal");
    if (mo && !mo.hidden) {
      mo.hidden = true;
      const ov = $("bmOverlay");
      if (ov) ov.hidden = true;
      document.body.style.overflow = "";
    }
  });
});

/* ════════════════════════════════════════
   AUTH HEADER
════════════════════════════════════════ */
function setupHeader() {
  let user = null;
  try { user = window.AuthGuard?.getSession?.()?.user || null; } catch { }

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Resident";
  const init = (name[0] || "R").toUpperCase();

  set("avatarEl", init);
  set("udAvatar", init);
  set("udName", name);
  set("udEmail", user?.email || "");

  // Dropdown toggle
  const btn = $("profileBtn");
  const menu = $("userDropdown");
  btn?.addEventListener("click", (e) => { e.stopPropagation(); menu?.classList.toggle("open"); });
  document.addEventListener("click", () => menu?.classList.remove("open"));
  menu?.addEventListener("click", e => e.stopPropagation());

  // Logout
  // Profile menu links
  $("udProfile")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/auth/account-settings.html";
  });
  $("udMessages")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/resident_messages.html";
  });
  $("udBookings")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/my-bookings.html";
  });

  $("udLogout")?.addEventListener("click", async () => {
    try { await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }); } catch { }
    try { window.AuthGuard?.clearSession?.(); } catch { }
    window.location.href = "../auth/login.html";
  });

  $("udSaved")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/saved_listings.html";
  });

}

function $(id) { return document.getElementById(id); }
function set(id, val) { const el = $(id); if (el) el.textContent = val; }

/* ════════════════════════════════════════
   EMAIL VERIFY BANNER
════════════════════════════════════════ */
function setupEmailVerifyBanner() {
  let user = null;
  try { user = window.AuthGuard?.getSession?.()?.user || null; } catch { }

  const banner = $("emailVerifyBanner");
  if (!banner) return;

  const emailVerified = user?.email_verified === true;
  if (emailVerified) { banner.hidden = true; return; }

  // Show banner
  banner.hidden = false;
  const email = encodeURIComponent(user?.email || "");
  const btn = $("emailVerifyBtn");
  if (btn) btn.href = `/auth/verify-email.html?email=${email}&role=RESIDENT`;

  // Dismiss (hides for this session only)
  $("evbDismiss")?.addEventListener("click", () => { banner.hidden = true; });
}

/* ════════════════════════════════════════
   LOAD LISTINGS
════════════════════════════════════════ */
async function loadListings() {
  showRowSkeletons();

  try {
    const r = await fetch(`${API}/listings/feed?limit=60`, { credentials: "include" });
    if (r.ok) {
      const d = await r.json();
      state.all = (d.listings || []).map(normalizeAPIListing);
    }
  } catch { }

  // Load saved listing IDs from API (for heart button state)
  try {
    const savedRes = await fetch(`${API}/listings/saved/ids`, { credentials: "include" });
    if (savedRes.ok) {
      const savedData = await savedRes.json();
      state.saved = new Set(savedData.ids || []);
    }
  } catch { /* silent */ }

  renderDefaultRows();
}

function normalizeAPIListing(l) {
  const photos = l.photos || [];
  const cover = typeof photos[0] === "object" ? photos[0]?.url : photos[0] || l.cover || null;
  const cap = typeof l.capacity === "object" ? l.capacity : {};
  const tourUrl = l.tour_url || l.pano_url || null;
  // monthly_rent is the canonical price field; fall back to legacy price
  const price = l.price ?? cap.monthly_rent ?? cap.price ?? null;
  // Normalize photos array to always be an array of URL strings
  const photoUrls = photos.map(p => typeof p === "object" ? p?.url : p).filter(Boolean);

  return {
    id: l.id, title: l.title || "Untitled space",
    city: l.city || "", barangay: l.barangay || "",
    place_type: l.place_type || l.placeType || "Room",
    price,
    student_discount: l.student_discount || 0,
    available: l.status === "PUBLISHED",
    tour: !!(tourUrl || l.has_tour),
    tour_url: tourUrl,
    cover, photos: photoUrls, capacity: cap,
    highlights: l.highlights || [],
    amenities: l.amenities || {},
    description: l.description || "",
    badge: l.badge || null,
  };
}

function showRowSkeletons() {
  ["scrollUE", "scrollBudget", "scrollTour", "scrollAvail"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = Array.from({ length: 5 }, () => `
      <div class="row-skeleton">
        <div class="sk-photo"></div>
        <div class="sk-line w70"></div>
        <div class="sk-line w45"></div>
      </div>`).join("");
  });
}

/* ════════════════════════════════════════
   RENDER DEFAULT ROWS
════════════════════════════════════════ */
function renderDefaultRows() {
  const all = state.all;

  // ── Row 1: Top city (most listings) — dynamic title ──────
  const cityCount = {};
  all.forEach(l => { if (l.city) cityCount[l.city] = (cityCount[l.city] || 0) + 1; });
  const topCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const nearCity = topCity
    ? all.filter(l => l.city === topCity).slice(0, 8)
    : [];
  // Update row title and "Show all" button dynamically
  const rowUETitleEl = document.querySelector("#rowUE .row-title");
  const rowUEBtn = document.querySelector("#rowUE .row-see-all");
  if (rowUETitleEl) rowUETitleEl.textContent = topCity ? `Listings in ${topCity}` : "Top listings";
  if (rowUEBtn) { rowUEBtn.dataset.city = topCity; }

  // ── Row 2: Budget picks — dynamic threshold ───────────────
  const prices = all.map(l => l.price).filter(Boolean).sort((a, b) => a - b);
  // Use ~40th percentile as budget threshold (or ₱5000 as fallback)
  const threshold = prices.length
    ? Math.max(3000, prices[Math.floor(prices.length * 0.4)] || 5000)
    : 5000;
  const rounded = Math.ceil(threshold / 500) * 500; // round to nearest ₱500
  const budget = all.filter(l => l.price && l.price <= rounded).slice(0, 8);
  const rowBudgetTitleEl = document.querySelector("#rowBudget .row-title");
  const rowBudgetBtn = document.querySelector("#rowBudget .row-see-all");
  if (rowBudgetTitleEl) rowBudgetTitleEl.textContent = `Budget picks · Under ₱${rounded.toLocaleString()}`;
  if (rowBudgetBtn) rowBudgetBtn.dataset.maxprice = rounded;

  // ── Row 3: 360° Tour listings ─────────────────────────────
  const tours = all.filter(l => l.tour).slice(0, 8);

  // ── Row 4: Recently added (newest 8) ──────────────────────
  // "Available now" is meaningless since all published = available
  // Show newest listings instead (they come back sorted by updated_at desc already)
  const recent = all.slice(0, 8);
  const rowAvailTitleEl = document.querySelector("#rowAvail .row-title");
  if (rowAvailTitleEl) rowAvailTitleEl.textContent = "Recently added";

  fillRow("scrollUE", nearCity);
  fillRow("scrollBudget", budget);
  fillRow("scrollTour", tours);
  fillRow("scrollAvail", recent);

  hideEmptyRow("rowUE", nearCity);
  hideEmptyRow("rowBudget", budget);
  hideEmptyRow("rowTour", tours);
  hideEmptyRow("rowAvail", recent);

  // ── Build city chips from real data ───────────────────────
  const cities = [...new Set(all.map(l => l.city).filter(Boolean))].sort();
  state.realCities = cities;
  const chipsEl = $("sdCityChips");
  if (chipsEl) {
    chipsEl.innerHTML = cities.map(c =>
      `<button class="city-chip" data-city="${c}">${c}</button>`
    ).join("");
    chipsEl.querySelectorAll(".city-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        chipsEl.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.filters.city = btn.dataset.city;
        set("spWhereVal", btn.dataset.city);
        $("spWhereVal")?.classList.add("active");
      });
    });
  }

  lucide.createIcons();
}

function fillRow(containerId, listings) {
  const el = $(containerId);
  if (!el) return;

  if (!listings.length) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = listings.map(l => rowCardHTML(l)).join("");

  el.querySelectorAll(".lcard[data-id]").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".lcard-save")) return;
      location.href = `/Resident/listing_detail.html?id=${card.dataset.id}`;
    });
    card.querySelector(".lcard-save")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSave(parseInt(card.dataset.id), card.querySelector(".lcard-save"));
    });
  });
}

function hideEmptyRow(rowId, arr) {
  const el = $(rowId);
  if (el) el.style.display = arr.length ? "" : "none";
}

/* Row card HTML */
function rowCardHTML(l) {
  const saved = state.saved.has(l.id);
  const loc = [l.barangay, l.city].filter(Boolean).join(", ") || "Caloocan";
  const price = l.price
    ? `<b>₱${Number(l.price).toLocaleString()}</b><span>/mo</span>`
    : `<span style="color:var(--ink-60)">On request</span>`;

  const imgEl = l.cover
    ? `<img class="lcard-img" src="${esc(l.cover)}" alt="${esc(l.title)}" loading="lazy">`
    : `<div class="lcard-placeholder"><i data-lucide="home"></i></div>`;

  const badge = l.badge ? `<div class="lcard-badge">${esc(l.badge)}</div>` : "";
  const tour = l.tour ? `<div class="lcard-tour"><i data-lucide="rotate-3d"></i>360° Tour</div>` : "";
  const dot = `<div class="lcard-status-dot${l.available === false ? " unavail" : ""}"></div>`;

  return `
    <div class="lcard" data-id="${l.id}">
      <div class="lcard-photo">
        ${imgEl}
        ${badge}
        <button class="lcard-save${saved ? " saved" : ""}" aria-label="Save">
          <i data-lucide="heart"></i>
        </button>
        ${tour}
      </div>
      <div class="lcard-body">
        <div class="lcard-top">
          <span class="lcard-location">${esc(loc)}</span>
          ${dot}
        </div>
        <div class="lcard-type">${esc(l.place_type || "Room")}</div>
        <div class="lcard-price">${price}</div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   CATEGORY BAR
════════════════════════════════════════ */
function setupCategoryBar() {
  document.querySelectorAll(".cat-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const type = btn.dataset.type || "";
      state.filters.type = type;

      if (!type) {
        showDefaultView();
      } else {
        state.mode = "filtered";
        applyFilters();
      }
    });
  });

  // Row "show all" buttons
  document.querySelectorAll(".row-see-all").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.city) { state.filters.city = btn.dataset.city; }
      if (btn.dataset.maxprice) { state.filters.maxPrice = parseInt(btn.dataset.maxprice); }
      if (btn.dataset.tour) { state.filters.tourOnly = true; }
      if (btn.dataset.available) { state.filters.availOnly = true; }
      state.mode = "filtered";
      applyFilters();
    });
  });
}

function showDefaultView() {
  $("defaultView").hidden = false;
  $("filteredView").hidden = true;
  $("emptyState").hidden = true;
  state.mode = "default";
}

/* ════════════════════════════════════════
   SEARCH PILL + DROPDOWN
════════════════════════════════════════ */
function setupSearchPill() {
  const drop = $("searchDrop");

  // City chips — built dynamically from real listing data in renderDefaultRows()
  // Placeholder until listings load
  const chipsEl = $("sdCityChips");
  if (chipsEl && !chipsEl.children.length) {
    chipsEl.innerHTML = `<span style="font-size:12px;color:var(--ink-60)">Loading cities…</span>`;
  }

  // Price presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const min = parseInt(btn.dataset.min) || 0;
      const max = parseInt(btn.dataset.max) || 0;
      state.filters.minPrice = min;
      state.filters.maxPrice = max;
      const sdMin = $("sdMin"); const sdMax = $("sdMax");
      if (sdMin) sdMin.value = min || "";
      if (sdMax) sdMax.value = max || "";
      const label = max ? `₱${min.toLocaleString()}–₱${max.toLocaleString()}` : `₱${min.toLocaleString()}+`;
      set("spBudgetVal", label);
      $("spBudgetVal")?.classList.add("active");
    });
  });

  // Toggle where section
  $("spWhere")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = false;
    $("sdBudgetSec").hidden = true;
    drop.hidden = !drop.hidden;
    if (!drop.hidden) lucide.createIcons();
  });

  // Toggle budget section
  $("spBudget")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = true;
    $("sdBudgetSec").hidden = false;
    drop.hidden = false;
    if (!drop.hidden) lucide.createIcons();
  });

  // Type pill just opens filter panel
  $("spType")?.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.hidden = true;
    openFilterPanel();
  });

  // Apply search
  $("sdropSearch")?.addEventListener("click", () => {
    const min = parseInt($("sdMin")?.value) || 0;
    const max = parseInt($("sdMax")?.value) || 0;
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
    drop.hidden = true;
    state.mode = "filtered";
    applyFilters();
  });

  $("sdropClear")?.addEventListener("click", clearAll);
  $("searchBtn")?.addEventListener("click", () => { drop.hidden = true; state.mode = "filtered"; applyFilters(); });
}

function setupDropdownClose() {
  document.addEventListener("click", (e) => {
    const drop = $("searchDrop");
    if (drop && !drop.contains(e.target) && !$("searchPill")?.contains(e.target)) {
      drop.hidden = true;
    }
  });
}

/* ════════════════════════════════════════
   FILTER PANEL
════════════════════════════════════════ */
function setupFilterPanel() {
  $("filterToggle")?.addEventListener("click", openFilterPanel);
  $("fpClose")?.addEventListener("click", closeFilterPanel);
  $("filterOverlay")?.addEventListener("click", closeFilterPanel);

  // Type buttons
  document.querySelectorAll(".fp-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fp-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Toggle switches
  setupToggle("fpAvailToggle");
  setupToggle("fpTourToggle");

  $("fpReset")?.addEventListener("click", () => {
    document.querySelectorAll(".fp-type-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
    const fpMin = $("fpMin"); const fpMax = $("fpMax");
    if (fpMin) fpMin.value = "";
    if (fpMax) fpMax.value = "";
    $("fpAvailToggle")?.setAttribute("aria-checked", "false");
    $("fpTourToggle")?.setAttribute("aria-checked", "false");
  });

  $("fpApply")?.addEventListener("click", () => {
    // Collect from filter panel
    const activeType = document.querySelector(".fp-type-btn.active")?.dataset.type || "";
    const min = parseInt($("fpMin")?.value) || 0;
    const max = parseInt($("fpMax")?.value) || 0;
    const avail = $("fpAvailToggle")?.getAttribute("aria-checked") === "true";
    const tour = $("fpTourToggle")?.getAttribute("aria-checked") === "true";

    state.filters.type = activeType;
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
    state.filters.availOnly = avail;
    state.filters.tourOnly = tour;

    // Sync category bar
    document.querySelectorAll(".cat-item").forEach(b => b.classList.toggle("active", b.dataset.type === activeType));

    // Update filter btn state
    const hasFilters = activeType || min || max || avail || tour;
    $("filterToggle")?.classList.toggle("active", !!hasFilters);

    closeFilterPanel();
    state.mode = "filtered";
    applyFilters();
  });
}

function setupToggle(id) {
  const btn = $(id);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur = btn.getAttribute("aria-checked") === "true";
    btn.setAttribute("aria-checked", (!cur).toString());
  });
}

function openFilterPanel() {
  $("filterPanel")?.classList.add("open");
  $("filterOverlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeFilterPanel() {
  $("filterPanel")?.classList.remove("open");
  $("filterOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ════════════════════════════════════════
   APPLY FILTERS → FILTERED VIEW
════════════════════════════════════════ */
async function applyFilters() {
  // Build query params for server-side filtering
  const f = state.filters;
  const params = new URLSearchParams({ limit: 60 });
  if (f.type) params.set("type", f.type.toLowerCase());
  if (f.city) params.set("city", f.city);
  if (f.minPrice) params.set("min_price", f.minPrice);
  if (f.maxPrice) params.set("max_price", f.maxPrice);

  // Show loading state
  showFilteredView(null, true);

  try {
    const r = await fetch(`${API}/listings/feed?${params}`, { credentials: "include" });
    if (!r.ok) throw new Error("Feed failed");
    const d = await r.json();
    let results = (d.listings || []).map(normalizeAPIListing);

    // Client-side only: tour filter (backend doesn't have this field yet)
    if (f.tourOnly) results = results.filter(l => l.tour);

    showFilteredView(results);
  } catch {
    // Fallback to client-side if fetch fails
    let results = [...state.all];
    if (f.type) results = results.filter(l => (l.place_type || "").toLowerCase() === f.type.toLowerCase());
    if (f.city) results = results.filter(l => (l.city || "").toLowerCase().includes(f.city.toLowerCase()));
    if (f.minPrice) results = results.filter(l => (l.price || 0) >= f.minPrice);
    if (f.maxPrice) results = results.filter(l => (l.price || 0) <= f.maxPrice);
    if (f.tourOnly) results = results.filter(l => l.tour);
    showFilteredView(results);
  }
}

function showFilteredView(results, loading = false) {
  $("defaultView").hidden = true;
  $("emptyState").hidden = true;
  $("filteredView").hidden = false;

  if (loading) {
    const grid = $("listingGrid");
    if (grid) grid.innerHTML = Array.from({ length: 8 }, () => `
      <div class="lcard grid-mode">
        <div class="lcard-photo"><div class="sk-photo" style="height:210px;border-radius:16px"></div></div>
        <div class="sk-line w70" style="height:12px;border-radius:6px;margin-top:10px"></div>
        <div class="sk-line w45" style="height:10px;border-radius:6px;margin-top:8px"></div>
      </div>`).join("");
    set("filteredTitle", "Searching…");
    set("filteredCount", "");
    return;
  }

  if (!results.length) {
    $("filteredView").hidden = true;
    $("emptyState").hidden = false;
    $("esClear")?.addEventListener("click", clearAll, { once: true });
    return;
  }

  // Build title
  const parts = [];
  if (state.filters.type) parts.push(state.filters.type);
  if (state.filters.city) parts.push(`in ${state.filters.city}`);
  if (state.filters.maxPrice) parts.push(`under ₱${state.filters.maxPrice.toLocaleString()}`);
  const title = parts.length ? parts.join(" ") : "All listings";

  set("filteredTitle", title);
  set("filteredCount", `${results.length} listing${results.length !== 1 ? "s" : ""} found`);

  state.filteredPage = 0;
  renderFilteredCards(results, true);
}

function renderFilteredCards(results, reset) {
  const grid = $("listingGrid");
  if (!grid) return;
  const loadMoreWrap = $("loadMoreWrap");

  const next = results.slice(state.filteredPage, state.filteredPage + state.perPage);
  state.filteredPage += next.length;

  if (reset) grid.innerHTML = "";

  grid.insertAdjacentHTML("beforeend", next.map(l => gridCardHTML(l)).join(""));

  grid.querySelectorAll(".lcard[data-id]:not([data-bound])").forEach(card => {
    card.dataset.bound = "1";
    card.addEventListener("click", (e) => {
      if (e.target.closest(".lcard-save")) return;
      location.href = `/Resident/listing_detail.html?id=${card.dataset.id}`;
    });
    card.querySelector(".lcard-save")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSave(parseInt(card.dataset.id), card.querySelector(".lcard-save"));
    });
  });

  if (loadMoreWrap) loadMoreWrap.hidden = state.filteredPage >= results.length;
  $("loadMoreBtn")?.addEventListener("click", () => renderFilteredCards(results, false), { once: true });

  lucide.createIcons();
}

function gridCardHTML(l) {
  return rowCardHTML(l).replace('class="lcard"', 'class="lcard grid-mode"');
}

function clearAll() {
  state.filters = { type: "", city: "", minPrice: 0, maxPrice: 0, availOnly: false, tourOnly: false };
  set("spWhereVal", "Search destinations"); $("spWhereVal")?.classList.remove("active");
  set("spTypeVal", "Any type");
  set("spBudgetVal", "Add budget"); $("spBudgetVal")?.classList.remove("active");
  document.querySelectorAll(".cat-item").forEach((b, i) => b.classList.toggle("active", i === 0));
  document.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
  $("filterToggle")?.classList.remove("active");
  // Reset filter panel inputs
  const fpMin = $("fpMin"); const fpMax = $("fpMax");
  if (fpMin) fpMin.value = ""; if (fpMax) fpMax.value = "";
  $("fpAvailToggle")?.setAttribute("aria-checked", "false");
  $("fpTourToggle")?.setAttribute("aria-checked", "false");
  showDefaultView();
}

/* ════════════════════════════════════════
   SAVE / HEART
════════════════════════════════════════ */
async function toggleSave(id, btn) {
  try {
    const res = await fetch(`${API}/listings/${id}/save`, {
      method: "POST", credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.saved) {
      state.saved.add(id);
      btn?.classList.add("saved");
      if (btn) { btn.style.transform = "scale(1.35)"; setTimeout(() => btn.style.transform = "", 200); }
    } else {
      state.saved.delete(id);
      btn?.classList.remove("saved");
    }
  } catch { /* silent fail */ }
}

/* ════════════════════════════════════════
   BOOKING MODAL
════════════════════════════════════════ */
function openBookingModal(l) {
  if (!$("bmModal")) return;

  // ── Step 1: Clone persistent nodes FIRST to wipe all stale listeners.
  // freshNode() replaces the element in the DOM, destroying every previously
  // attached handler. Must run before we read any of these nodes below.
  function freshNode(id) {
    const el = $(id);
    if (!el || !el.parentNode) return el;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }
  const freshSubmit = freshNode("bmSubmit");
  const freshCancel = freshNode("bmCancel");
  const freshClose = freshNode("bmClose");
  const freshOverlay = freshNode("bmOverlay");

  // ── Step 2: Reset form state on the now-live cloned nodes ──
  $("bmBody").hidden = false;
  $("bmSuccess").hidden = true;
  $("bmFooter").hidden = false;
  $("bmError").hidden = true;
  $("bmMoveIn").value = "";
  $("bmMessage").value = "";
  $("bmSubmitLabel").hidden = false;
  $("bmSpinner").hidden = true;
  if (freshSubmit) freshSubmit.disabled = false;
  $("bmMoveIn").min = new Date().toISOString().split("T")[0];

  // ── Step 3: Populate listing snapshot ──
  const photoEl = l.cover
    ? `<img class="bm-listing-photo" src="${esc(l.cover)}" alt="${esc(l.title)}">`
    : `<div class="bm-listing-photo-placeholder"><i data-lucide="home"></i></div>`;
  let bmStudentVerified = false;
  try { bmStudentVerified = window.AuthGuard?.getSession?.()?.user?.student_verified === true; } catch { }
  const bmDiscount = l.student_discount || 0;
  const bmDiscounted = bmStudentVerified && bmDiscount > 0 && l.price
    ? Math.round(l.price * (1 - bmDiscount / 100)) : null;
  const priceEl = l.price
    ? bmDiscounted
      ? `<div class="bm-listing-price" style="text-align:right">
           ₱${Number(bmDiscounted).toLocaleString()}<span>/mo</span>
           <div style="font-size:10px;color:#166534;font-weight:700;margin-top:2px">${bmDiscount}% student discount</div>
         </div>`
      : `<div class="bm-listing-price">₱${Number(l.price).toLocaleString()}<span>/mo</span></div>`
    : "";
  $("bmListing").innerHTML = `
    ${photoEl}
    <div class="bm-listing-info">
      <div class="bm-listing-title">${esc(l.title)}</div>
      <div class="bm-listing-meta">${esc(l.place_type || "Room")} · ${esc([l.barangay, l.city].filter(Boolean).join(", "))}</div>
    </div>
    ${priceEl}`;

  // ── Step 4: Show modal — animate overlay and modal separately ──
  // freshOverlay is the live node after cloneNode replacement above.
  // void el.offsetWidth forces a reflow so the animation restarts cleanly.
  if (freshOverlay) {
    freshOverlay.hidden = false;
    void freshOverlay.offsetWidth;
    freshOverlay.style.animation = "fadeIn 200ms ease both";
  }
  const modalEl = $("bmModal");
  if (modalEl) {
    modalEl.hidden = false;
    void modalEl.offsetWidth;
    modalEl.style.animation = "modalIn 260ms var(--ease-o) both";
  }
  document.body.style.overflow = "hidden";
  lucide.createIcons();

  // ── Step 5: Submit handler ──
  const submitHandler = async () => {
    let sessionUser = null;
    try { sessionUser = window.AuthGuard?.getSession?.()?.user || null; } catch { }
    if (sessionUser && sessionUser.email_verified === false) {
      const email = encodeURIComponent(sessionUser.email || "");
      $("bmError").innerHTML = `Email not verified. <a href="/auth/verify-email.html?email=${email}&role=RESIDENT" style="color:inherit;font-weight:800;text-decoration:underline">Verify now →</a>`;
      $("bmError").hidden = false;
      return;
    }
    const moveIn = $("bmMoveIn").value || null;
    const message = $("bmMessage").value.trim() || null;
    if (freshSubmit) freshSubmit.disabled = true;
    $("bmSubmitLabel").hidden = true;
    $("bmSpinner").hidden = false;
    $("bmError").hidden = true;
    try {
      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: l.id, move_in_date: moveIn, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit booking request.");
      $("bmBody").hidden = true;
      $("bmFooter").hidden = true;
      $("bmSuccess").hidden = false;
      lucide.createIcons();
      setTimeout(closeBookingModal, 3000);
    } catch (err) {
      $("bmError").textContent = err.message;
      $("bmError").hidden = false;
      if (freshSubmit) freshSubmit.disabled = false;
      $("bmSubmitLabel").hidden = false;
      $("bmSpinner").hidden = true;
    }
  };

  // ── Step 6: Attach listeners to the freshly cloned nodes ──
  freshSubmit?.addEventListener("click", submitHandler);
  freshCancel?.addEventListener("click", closeBookingModal);
  freshClose?.addEventListener("click", closeBookingModal);
  // Only close when clicking the dark backdrop itself, not modal content bubbling through.
  freshOverlay?.addEventListener("click", (e) => {
    if (e.target === freshOverlay) closeBookingModal();
  });
}

function closeBookingModal() {
  const ov = $("bmOverlay");
  const mo = $("bmModal");
  if (ov) { ov.style.animation = ""; ov.hidden = true; }
  if (mo) { mo.style.animation = ""; mo.hidden = true; }
  document.body.style.overflow = "";
}

// ══ NOTIFICATIONS — Resident ══════════════════════════════
(function () {
  const API = "/api";
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const el = id => document.getElementById(id);

  async function loadNotif() {
    try {
      const res = await fetch(`${API}/notifications`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const notifs = data.notifications || [];
      const unread = data.unread ?? 0;

      const badge = el("notifBadge");
      if (badge) { badge.textContent = unread > 9 ? "9+" : unread; badge.hidden = unread === 0; }

      const list = el("notifList");
      if (!list) return;

      if (!notifs.length) {
        list.innerHTML = `<div class="notif-empty"><i data-lucide="bell-off"></i><p>No notifications yet</p></div>`;
        if (window.lucide?.createIcons) lucide.createIcons();
        return;
      }

      list.innerHTML = notifs.map(n => {
        const iso = n.created_at
          ? (n.created_at.includes("+") || n.created_at.endsWith("Z") ? n.created_at : n.created_at + "Z")
          : null;
        const time = iso
          ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
          : "";
        const nType = (n.notif_type || n.type || "").toUpperCase();
        let rUrl = null;
        if (nType.includes("MESSAGE")) rUrl = "/Resident/resident_messages.html";
        else if (nType.includes("BOOKING")) rUrl = "/Resident/my-bookings.html";
        return `<div class="notif-item${n.is_read ? "" : " unread"}" data-id="${n.id}"
                    style="cursor:${rUrl ? 'pointer' : 'default'}"
                    ${rUrl ? `onclick="window.location.href='${rUrl}'"` : ""}>
                    <div class="notif-item-body">
                        <div class="notif-item-title">${esc(n.title || "")}</div>
                        ${n.body ? `<div class="notif-item-body-txt">${esc(n.body)}</div>` : ""}
                        <div class="notif-item-time">${time}</div>
                    </div>
                    ${rUrl ? '<span style="color:#9ca3af;font-size:16px;align-self:center">›</span>' : ""}
                </div>`;
      }).join("");

      if (window.lucide?.createIcons) lucide.createIcons();
    } catch (err) { console.warn("[Notif]", err); }
  }

  async function markRead() {
    try {
      await fetch(`${API}/notifications/mark-read`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      const badge = el("notifBadge");
      if (badge) { badge.textContent = "0"; badge.hidden = true; }
      document.querySelectorAll(".notif-item.unread").forEach(el => el.classList.remove("unread"));
    } catch { }
  }

  el("notifBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = el("notifPanel");
    if (!panel) return;
    const open = !panel.hidden;
    panel.hidden = open;
    if (!open) loadNotif();
  });

  el("notifMarkRead")?.addEventListener("click", markRead);

  document.addEventListener("click", (e) => {
    const wrap = el("notifWrap");
    if (wrap && !wrap.contains(e.target)) {
      const panel = el("notifPanel");
      if (panel) panel.hidden = true;
    }
  });

  loadNotif();
  setInterval(loadNotif, 60_000);
})();