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
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  await setupCategoryBar();
  setupFilterPanel();
  setupTypeBubble();
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

  // Set initials always (text fallback)
  set("avatarEl", init);
  set("udAvatar", init);

  // Overlay photo if avatar_url is set
  if (user?.avatar_url) {
    // avatarEl — the initials span inside the topbar button; wrap is the button
    const avatarSpan = $("avatarEl");
    if (avatarSpan) {
      const wrap = avatarSpan.parentElement;
      if (wrap) {
        wrap.style.position = "relative";
        wrap.style.overflow = "hidden";
        let img = wrap.querySelector(".hdr-av-img");
        if (!img) {
          img = document.createElement("img");
          img.className = "hdr-av-img";
          img.alt = "Avatar";
          img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;";
          wrap.appendChild(img);
        }
        img.src = user.avatar_url;
        img.hidden = false;
        avatarSpan.hidden = true;
      }
    }

    // udAvatar — the div itself is the avatar container in the dropdown
    const udAv = $("udAvatar");
    if (udAv) {
      udAv.style.overflow = "hidden";
      udAv.style.position = "relative";
      let img = udAv.querySelector(".hdr-av-img");
      if (!img) {
        img = document.createElement("img");
        img.className = "hdr-av-img";
        img.alt = "Avatar";
        img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;";
        udAv.appendChild(img);
      }
      img.src = user.avatar_url;
      img.hidden = false;
      udAv.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = ""; });
    }
  }
  set("udName", name);
  set("udEmail", user?.email || "");

  // Dropdown toggle
  const btn = $("profileBtn");
  const menu = $("userDropdown");
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu?.classList.toggle("open");
  });
  document.addEventListener("click", () => menu?.classList.remove("open"));
  menu?.addEventListener("click", e => e.stopPropagation());

  // Profile menu links
  $("udProfile")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/auth/account-settings.html";
  });

  $("udMessages")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/resident_messages.html";
  });

  $("udTickets")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "../shared/my_tickets.html";
  });

  $("udBookings")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/my-bookings.html";
  });

  $("udSaved")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/Resident/saved_listings.html";
  });

  $("udLogout")?.addEventListener("click", async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch { }
    try { window.AuthGuard?.clearSession?.(); } catch { }
    localStorage.removeItem("vista_session_user");
    sessionStorage.setItem("loadingDest", "/auth/login.html");
    sessionStorage.setItem("loadingMsg", "Logging you out…");
    window.location.href = "/auth/loading.html";
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
  if (emailVerified) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  const email = encodeURIComponent(user?.email || "");
  const btn = $("emailVerifyBtn");
  if (btn) btn.href = `/auth/verify-email.html?email=${email}&role=RESIDENT`;

  $("evbDismiss")?.addEventListener("click", () => {
    banner.hidden = true;
  });
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

  // Load saved listing IDs from API
  try {
    const savedRes = await fetch(`${API}/listings/saved/ids`, { credentials: "include" });
    if (savedRes.ok) {
      const savedData = await savedRes.json();
      state.saved = new Set(savedData.ids || []);
    }
  } catch { }

  renderDefaultRows();
}

function normalizeAPIListing(l) {
  const photos = l.photos || [];
  const cover = typeof photos[0] === "object" ? photos[0]?.url : photos[0] || l.cover || null;
  const cap = typeof l.capacity === "object" ? l.capacity : {};
  const tourUrl = l.tour_url || l.pano_url || null;
  const price = l.price ?? cap.monthly_rent ?? cap.price ?? null;
  const photoUrls = photos.map(p => typeof p === "object" ? p?.url : p).filter(Boolean);

  return {
    id: l.id,
    title: l.title || "Untitled space",
    city: l.city || "",
    barangay: l.barangay || "",
    place_type: l.place_type || l.placeType || "Room",
    price,
    student_discount: l.student_discount || 0,
    available: l.status === "PUBLISHED",
    tour: !!(tourUrl || l.has_tour),
    tour_url: tourUrl,
    cover,
    photos: photoUrls,
    capacity: cap,
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
      </div>
    `).join("");
  });
}

/* ════════════════════════════════════════
   RENDER DEFAULT ROWS
════════════════════════════════════════ */
function renderDefaultRows() {
  const all = state.all;

  // Row 1: Top city
  const cityCount = {};
  all.forEach(l => {
    if (l.city) cityCount[l.city] = (cityCount[l.city] || 0) + 1;
  });

  const topCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const nearCity = topCity ? all.filter(l => l.city === topCity).slice(0, 8) : [];

  const rowUETitleEl = document.querySelector("#rowUE .row-title");
  const rowUEBtn = document.querySelector("#rowUE .row-see-all");
  if (rowUETitleEl) rowUETitleEl.textContent = topCity ? `Listings in ${topCity}` : "Top listings";
  if (rowUEBtn) rowUEBtn.dataset.city = topCity;

  // Row 2: Budget picks
  const prices = all.map(l => l.price).filter(Boolean).sort((a, b) => a - b);
  const threshold = prices.length
    ? Math.max(3000, prices[Math.floor(prices.length * 0.4)] || 5000)
    : 5000;
  const rounded = Math.ceil(threshold / 500) * 500;
  const budget = all.filter(l => l.price && l.price <= rounded).slice(0, 8);

  const rowBudgetTitleEl = document.querySelector("#rowBudget .row-title");
  const rowBudgetBtn = document.querySelector("#rowBudget .row-see-all");
  if (rowBudgetTitleEl) rowBudgetTitleEl.textContent = `Budget picks · Under ₱${rounded.toLocaleString()}`;
  if (rowBudgetBtn) rowBudgetBtn.dataset.maxprice = rounded;

  // Row 3: Tour
  const tours = all.filter(l => l.tour).slice(0, 8);

  // Row 4: Recent
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

  // Build city list from API data + fetch unique cities from API
  const localCities = [...new Set(all.map(l => l.city).filter(Boolean))].sort();
  state.realCities = localCities;
  renderCityChips(localCities);

  // Also fetch from API for full city list (may have more than current feed)
  fetch(`${API}/locations/cities`, { credentials: "include" })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const apiCities = (data.cities || []).sort();
      const merged = [...new Set([...localCities, ...apiCities])].sort();
      state.realCities = merged;
      renderCityChips(merged);
    })
    .catch(() => { });

  lucide.createIcons();
}

function renderCityChips(cities) {
  const chipsEl = $("sdCityChips");
  if (!chipsEl) return;

  // Show top 8 by default, rest revealed via search
  const TOP_N = 8;
  const cur = state.filters.city || "";

  chipsEl.innerHTML = cities.slice(0, TOP_N).map(c =>
    `<button class="city-chip${c === cur ? " active" : ""}" data-city="${esc(c)}">${esc(c)}</button>`
  ).join("");

  chipsEl.querySelectorAll(".city-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      chipsEl.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.city = btn.dataset.city;
      set("spWhereVal", btn.dataset.city);
      $("spWhereVal")?.classList.add("active");
      const inp = $("sdCitySearch");
      if (inp) inp.value = btn.dataset.city;
    });
  });
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
      toggleSave(parseInt(card.dataset.id, 10), card.querySelector(".lcard-save"));
    });
  });
}

function hideEmptyRow(rowId, arr) {
  const el = $(rowId);
  if (el) el.style.display = arr.length ? "" : "none";
}

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
    </div>
  `;
}

/* ════════════════════════════════════════
   CATEGORY BAR
════════════════════════════════════════ */
async function setupCategoryBar() {
  const catBar = document.getElementById("catBar");

  try {
    const res = await fetch(`${API}/listings/property-types`);
    if (res.ok) {
      const data = await res.json();
      const types = data.types || [];
      const icons = {
        "Room": "door-open",
        "Boarding House": "house",
        "Apartment": "building",
        "Condo": "building-2",
        "Condominium": "building-2",
        "Bedspace": "bed-single",
        "House": "home",
        "Dormitory": "school",
        "Shared House": "users",
        "Studio Unit": "layout-panel-left",
        "Townhouse": "layers",
      };

      const seen = new Set();
      types.forEach(t => {
        if (seen.has(t)) return;
        seen.add(t);

        const btn = document.createElement("button");
        btn.className = "cat-item";
        btn.dataset.type = t;
        btn.innerHTML = `<i data-lucide="${icons[t] || "home"}"></i><span>${t}</span>`;
        catBar.appendChild(btn);
      });

      if (window.lucide?.createIcons) lucide.createIcons();
    }
  } catch { }

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

  document.querySelectorAll(".row-see-all").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.city) state.filters.city = btn.dataset.city;
      if (btn.dataset.maxprice) state.filters.maxPrice = parseInt(btn.dataset.maxprice, 10);
      if (btn.dataset.tour) state.filters.tourOnly = true;
      if (btn.dataset.available) state.filters.availOnly = true;

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

  // Cities are populated from API via renderCityChips() — no static placeholder needed

  // ── City search input ──
  const cityInput = $("sdCitySearch");
  const citySearchClear = $("sdCitySearchClear");

  cityInput?.addEventListener("input", () => {
    const q = cityInput.value.trim().toLowerCase();
    if (citySearchClear) citySearchClear.hidden = !q;
    filterCityChips(q);
  });

  cityInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    // pick first visible chip on Enter
    const first = $("sdCityChips")?.querySelector(".city-chip");
    if (first) first.click();
    drop.hidden = true;
    state.mode = "filtered";
    applyFilters();
  });

  citySearchClear?.addEventListener("click", (e) => {
    e.stopPropagation();
    cityInput.value = "";
    citySearchClear.hidden = true;
    filterCityChips("");
    cityInput.focus();
  });

  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const min = parseInt(btn.dataset.min, 10) || 0;
      const max = parseInt(btn.dataset.max, 10) || 0;

      state.filters.minPrice = min;
      state.filters.maxPrice = max;

      const sdMin = $("sdMin");
      const sdMax = $("sdMax");
      if (sdMin) sdMin.value = min || "";
      if (sdMax) sdMax.value = max || "";

      const label = max ? `₱${min.toLocaleString()}–₱${max.toLocaleString()}` : `₱${min.toLocaleString()}+`;
      set("spBudgetVal", label);
      $("spBudgetVal")?.classList.add("active");
    });
  });

  $("spWhere")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = false;
    $("sdBudgetSec").hidden = true;
    const wasHidden = drop.hidden;
    drop.hidden = !drop.hidden;
    if (!drop.hidden) {
      lucide.createIcons();
      if (wasHidden) setTimeout(() => cityInput?.focus(), 80);
    }
  });

  $("spBudget")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = true;
    $("sdBudgetSec").hidden = false;
    drop.hidden = false;
    if (!drop.hidden) lucide.createIcons();
  });

  $("spType")?.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.hidden = true;
    toggleTypeBubble();
  });

  $("sdropSearch")?.addEventListener("click", () => {
    const min = parseInt($("sdMin")?.value, 10) || 0;
    const max = parseInt($("sdMax")?.value, 10) || 0;
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
    drop.hidden = true;
    state.mode = "filtered";
    applyFilters();
  });

  $("sdropClear")?.addEventListener("click", clearAll);
  $("searchBtn")?.addEventListener("click", () => {
    drop.hidden = true;
    state.mode = "filtered";
    applyFilters();
  });
}

function filterCityChips(q) {
  const cities = state.realCities || [];
  const noEl = $("sdNoCities");
  const chipsEl = $("sdCityChips");
  if (!chipsEl) return;

  const MAX = 12;
  const cur = state.filters.city || "";
  const filtered = q
    ? cities.filter(c => c.toLowerCase().includes(q))
    : cities.slice(0, 8);

  if (!filtered.length) {
    chipsEl.innerHTML = "";
    if (noEl) noEl.hidden = false;
    return;
  }

  if (noEl) noEl.hidden = true;
  chipsEl.innerHTML = filtered.slice(0, MAX).map(c =>
    `<button class="city-chip${c === cur ? " active" : ""}" data-city="${esc(c)}">${esc(c)}</button>`
  ).join("");

  chipsEl.querySelectorAll(".city-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      chipsEl.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.city = btn.dataset.city;
      set("spWhereVal", btn.dataset.city);
      $("spWhereVal")?.classList.add("active");
      const inp = $("sdCitySearch");
      if (inp) { inp.value = btn.dataset.city; }
      const clearBtn = $("sdCitySearchClear");
      if (clearBtn) clearBtn.hidden = false;
    });
  });
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
   TYPE BUBBLE
════════════════════════════════════════ */
function toggleTypeBubble() {
  const bubble = $("typeBubble");
  if (!bubble) return;

  if (!bubble.hidden) {
    bubble.hidden = true;
    return;
  }

  // Position below the TYPE segment
  const anchor = $("spType");
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    bubble.style.top = (rect.bottom + 10) + "px";
    const bw = 540;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - bw - 16));
    bubble.style.left = left + "px";
  }

  bubble.hidden = false;
  lucide.createIcons({ nameAttr: "data-lucide", nodes: bubble.querySelectorAll("[data-lucide]") });

  // Mark current active type
  const cur = state.filters.type || "";
  bubble.querySelectorAll(".tb-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === cur);
  });
}

function setupTypeBubble() {
  document.addEventListener("click", (e) => {
    const bubble = $("typeBubble");
    if (!bubble || bubble.hidden) return;
    if (!bubble.contains(e.target) && !$("spType")?.contains(e.target)) {
      bubble.hidden = true;
    }
  });

  $("typeBubble")?.addEventListener("click", e => {
    const item = e.target.closest(".tb-item");
    if (!item) return;

    const type = item.dataset.type || "";
    state.filters.type = type;

    // Update pill label
    set("spTypeVal", type || "Any type");
    $("spTypeVal")?.classList.toggle("active", !!type);

    // Close bubble
    $("typeBubble").hidden = true;

    // Apply filter
    if (!type) {
      showDefaultView();
    } else {
      state.mode = "filtered";
      applyFilters();
    }
  });
}

// stubs — filter panel removed, openFilterPanel refs kept safe
function setupFilterPanel() { }
function openFilterPanel() { toggleTypeBubble(); }
function closeFilterPanel() { const b = $("typeBubble"); if (b) b.hidden = true; }

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
  const f = state.filters;
  const params = new URLSearchParams({ limit: 60 });

  if (f.type) params.set("type", f.type.toLowerCase());
  if (f.city) params.set("city", f.city);
  if (f.minPrice) params.set("min_price", f.minPrice);
  if (f.maxPrice) params.set("max_price", f.maxPrice);

  showFilteredView(null, true);

  try {
    const r = await fetch(`${API}/listings/feed?${params}`, { credentials: "include" });
    if (!r.ok) throw new Error("Feed failed");

    const d = await r.json();
    let results = (d.listings || []).map(normalizeAPIListing);

    if (f.tourOnly) results = results.filter(l => l.tour);

    showFilteredView(results);
  } catch {
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
    if (grid) {
      grid.innerHTML = Array.from({ length: 8 }, () => `
        <div class="lcard grid-mode">
          <div class="lcard-photo"><div class="sk-photo" style="height:210px;border-radius:16px"></div></div>
          <div class="sk-line w70" style="height:12px;border-radius:6px;margin-top:10px"></div>
          <div class="sk-line w45" style="height:10px;border-radius:6px;margin-top:8px"></div>
        </div>
      `).join("");
    }
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
      toggleSave(parseInt(card.dataset.id, 10), card.querySelector(".lcard-save"));
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
  set("spWhereVal", "Search destinations");
  $("spWhereVal")?.classList.remove("active");
  set("spTypeVal", "Any type");
  set("spBudgetVal", "Add budget");
  $("spBudgetVal")?.classList.remove("active");

  document.querySelectorAll(".cat-item").forEach((b, i) => b.classList.toggle("active", i === 0));
  document.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
  $("filterToggle")?.classList.remove("active");

  const fpMin = $("fpMin");
  const fpMax = $("fpMax");
  if (fpMin) fpMin.value = "";
  if (fpMax) fpMax.value = "";

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
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.saved) {
      state.saved.add(id);
      btn?.classList.add("saved");
      if (btn) {
        btn.style.transform = "scale(1.35)";
        setTimeout(() => { btn.style.transform = ""; }, 200);
      }
    } else {
      state.saved.delete(id);
      btn?.classList.remove("saved");
    }
  } catch { }
}

/* ════════════════════════════════════════
   BOOKING MODAL
════════════════════════════════════════ */
function openBookingModal(l) {
  if (!$("bmModal")) return;

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

  const photoEl = l.cover
    ? `<img class="bm-listing-photo" src="${esc(l.cover)}" alt="${esc(l.title)}">`
    : `<div class="bm-listing-photo-placeholder"><i data-lucide="home"></i></div>`;

  let bmStudentVerified = false;
  try { bmStudentVerified = window.AuthGuard?.getSession?.()?.user?.student_verified === true; } catch { }

  const bmDiscount = l.student_discount || 0;
  const bmDiscounted = bmStudentVerified && bmDiscount > 0 && l.price
    ? Math.round(l.price * (1 - bmDiscount / 100))
    : null;

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
    ${priceEl}
  `;

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

  freshSubmit?.addEventListener("click", submitHandler);
  freshCancel?.addEventListener("click", closeBookingModal);
  freshClose?.addEventListener("click", closeBookingModal);
  freshOverlay?.addEventListener("click", (e) => {
    if (e.target === freshOverlay) closeBookingModal();
  });
}

function closeBookingModal() {
  const ov = $("bmOverlay");
  const mo = $("bmModal");
  if (ov) {
    ov.style.animation = "";
    ov.hidden = true;
  }
  if (mo) {
    mo.style.animation = "";
    mo.hidden = true;
  }
  document.body.style.overflow = "";
}

/* ════════════════════════════════════════
   NOTIFICATIONS — Resident
════════════════════════════════════════ */
(function () {
  const API = "/api";
  const el = id => document.getElementById(id);

  const NOTIF_REDIRECT = {
    BOOKING: "/Resident/my-bookings.html",
    MESSAGE: "/Resident/resident_messages.html",
    KYC: "/auth/account-settings.html#verification",
    STUDENT: "/auth/account-settings.html#verification",
    TICKET: "/shared/my_tickets.html",
    NEW_MESSAGE: "/Resident/resident_messages.html",
    PAYMENT_VERIFIED: "/Resident/my-bookings.html",
    PAYMENT_REJECTED: "/Resident/my-bookings.html",
  };

  async function loadNotif() {
    try {
      const res = await fetch(`${API}/notifications`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const notifs = data.notifications || [];
      const unread = data.unread ?? 0;

      const badge = el("notifBadge");
      if (badge) {
        badge.textContent = unread > 9 ? "9+" : String(unread);
        badge.hidden = unread === 0;
      }

      const list = el("notifList");
      if (!list) return;

      if (!notifs.length) {
        list.innerHTML = `
          <div class="notif-empty">
            <i data-lucide="bell-off"></i>
            <p>No notifications yet</p>
          </div>
        `;
        if (window.lucide?.createIcons) lucide.createIcons();
        return;
      }

      list.innerHTML = notifs.map(n => {
        const iso = n.created_at
          ? (n.created_at.includes("+") || n.created_at.endsWith("Z") ? n.created_at : `${n.created_at}Z`)
          : null;

        const time = iso
          ? new Date(iso).toLocaleString("en-PH", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "Asia/Manila"
          })
          : "";

        const nType = String(n.notif_type || n.type || "").toUpperCase();

        let rUrl = null;
        if (NOTIF_REDIRECT[nType]) {
          rUrl = NOTIF_REDIRECT[nType];
        } else if (nType.includes("MESSAGE")) {
          rUrl = NOTIF_REDIRECT.MESSAGE;
        } else if (nType.includes("BOOKING")) {
          rUrl = NOTIF_REDIRECT.BOOKING;
        } else if (nType.includes("STUDENT")) {
          rUrl = NOTIF_REDIRECT.STUDENT;
        } else if (nType.includes("TICKET")) {
          rUrl = NOTIF_REDIRECT.TICKET;
        }

        return `
          <div class="notif-item${n.is_read ? "" : " unread"}" data-id="${n.id}" data-url="${rUrl || ""}">
            <div class="notif-item-body">
              <div class="notif-title">${esc(n.title || "")}</div>
              ${n.body ? `<div class="notif-body">${esc(n.body)}</div>` : ""}
              <div class="notif-time">${time}</div>
            </div>
            <button class="notif-delete" type="button" data-notif-del="${n.id}" aria-label="Delete notification">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        `;
      }).join("");

      if (window.lucide?.createIcons) lucide.createIcons();
    } catch (err) {
      console.warn("[Notif]", err);
    }
  }

  async function markRead() {
    try {
      await fetch(`${API}/notifications/mark-read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });

      const badge = el("notifBadge");
      if (badge) {
        badge.textContent = "0";
        badge.hidden = true;
      }

      document.querySelectorAll(".notif-item.unread").forEach(node => node.classList.remove("unread"));
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

  el("notifMarkRead")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await markRead();
  });

  document.addEventListener("click", (e) => {
    const wrap = el("notifWrap");
    if (wrap && !wrap.contains(e.target)) {
      const panel = el("notifPanel");
      if (panel) panel.hidden = true;
    }
  });

  document.addEventListener("click", async (e) => {
    const delBtn = e.target.closest("[data-notif-del]");
    if (!delBtn) return;

    e.stopPropagation();

    const id = delBtn.dataset.notifDel;
    const item = delBtn.closest(".notif-item");

    try {
      const res = await fetch(`${API}/notifications/${id}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!res.ok) return;

      if (item) {
        item.style.transform = "translateX(-100%)";
        item.style.opacity = "0";
        setTimeout(() => item.remove(), 200);
      }

      setTimeout(loadNotif, 250);
    } catch { }
  });

  document.addEventListener("click", async (e) => {
    const item = e.target.closest(".notif-item");
    if (!item) return;
    if (e.target.closest("[data-notif-del]")) return;

    const url = item.dataset.url;
    const notifId = item.dataset.id;

    // Mark individual notif read immediately (optimistic UI)
    if (notifId && item.classList.contains("unread")) {
      item.classList.remove("unread");
      try {
        await fetch(`${API}/notifications/${notifId}/read`, {
          method: "PATCH",
          credentials: "include",
        });
        // Update badge count
        const badge = el("notifBadge");
        if (badge) {
          const cur = parseInt(badge.textContent, 10) || 0;
          const next = Math.max(0, cur - 1);
          badge.textContent = next > 9 ? "9+" : String(next);
          badge.hidden = next === 0;
        }
      } catch { }
    }

    if (url) {
      window.location.href = url;
    }
  });

  loadNotif();
  setInterval(loadNotif, 10000);
})();