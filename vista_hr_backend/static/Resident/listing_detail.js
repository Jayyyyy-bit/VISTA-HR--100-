/* ============================================================
   VISTA-HR · listing_detail.js
   Full-featured listing detail page
============================================================ */
const API = "/api";
const STAR_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

const AMEN_ICONS = {
    wifi: "wifi", "air conditioning": "wind", ac: "wind", fan: "fan",
    refrigerator: "refrigerator", fridge: "refrigerator",
    "washing machine": "washing-machine", washer: "washing-machine",
    television: "tv", tv: "tv", microwave: "microwave",
    "water heater": "flame", "hot water": "flame",
    cctv: "camera", "security camera": "camera",
    "fire extinguisher": "flame-kindling",
    "smoke detector": "bell-ring", "smoke alarm": "bell-ring",
    "first aid": "cross", "security guard": "shield-check", guard: "shield-check",
    gate: "door-open", gated: "door-open",
    parking: "car", "parking space": "car",
    gym: "dumbbell", fitness: "dumbbell",
    pool: "waves", "swimming pool": "waves",
    garden: "leaf", balcony: "grid-2x2",
    kitchen: "utensils", "shared kitchen": "utensils",
    "study room": "book-open", laundry: "shirt",
    "common area": "sofa",
};

function amenIcon(name) {
    const l = (name || "").toLowerCase();
    for (const [k, v] of Object.entries(AMEN_ICONS)) if (l.includes(k)) return v;
    return "check-circle";
}

const esc = s => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const $ = id => document.getElementById(id);
const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

// ── State ──
let listing = null;
let allPhotos = [];
let lbIdx = 0;
let slideIdx = 0;
let rvPage = 1;
let allRevs = [];
let revTotal = 0;
let selRating = 0;
let ownerId = null;
let ownerName = "";
let pannellumViewer = null;
let currentUser = null; // fetched on boot for student discount + review eligibility

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(location.search);
    const lid = parseInt(params.get("id"));
    if (!lid) { showErr("No listing specified."); return; }

    if (window.AuthGuard?.requireResident) {
        const ok = await window.AuthGuard.requireResident();
        if (!ok) return;
    }

    // loadCatalog must finish BEFORE loadListing so _highlightMap/_amenityMap
    // are populated when render() runs. loadReviews is independent — run in parallel.
    await Promise.all([
        loadCatalog(),
        loadReviews(lid, true),
        loadCurrentUser(),
    ]);
    await loadListing(lid);

    await checkReservationStatus(lid);
    checkEligibility(lid);
    loadSimilar(lid);
    setupScrollNav();
    setupShare(lid);
    setupSave(lid);
    setupBooking(lid);
    setupMessage();
    setupReviewModal(lid);
    setupDateSync();

    lucide.createIcons();
});

// ── Lookup maps: id → { label, icon, category } ──────────
// Populated once on boot, used by render() to resolve IDs → labels
let _amenityMap = new Map(); // amenity id  → { label, icon, category }
let _highlightMap = new Map(); // highlight id → { label, icon }

async function loadCatalog() {
    try {
        const [ar, hr] = await Promise.all([
            fetch(`${API}/amenities`, { credentials: "include" }),
            fetch(`${API}/highlights`, { credentials: "include" }),
        ]);
        if (ar.ok) {
            const { amenities = {} } = await ar.json();
            // Response is grouped: { appliances: [...], activities: [...], safety: [...] }
            for (const items of Object.values(amenities)) {
                for (const a of items) _amenityMap.set(a.id, a);
            }
        }
        if (hr.ok) {
            const { highlights = [] } = await hr.json();
            for (const h of highlights) _highlightMap.set(h.id, h);
        }
    } catch {
        // Non-fatal — render() falls back to raw value if maps are empty
    }
}

// ── Load current user (for student discount + review eligibility) ──
async function loadCurrentUser() {
    try {
        const r = await fetch(`${API}/auth/me`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        currentUser = d.user || null;
    } catch { }
}

// ── Load listing ──────────────────────────────────────────
async function loadListing(lid) {
    try {
        const r = await fetch(`${API}/listings/${lid}/public`, { credentials: "include" });
        if (!r.ok) { showErr("Listing not found."); return; }
        const d = await r.json();
        listing = d.listing;
        render(listing);
    } catch {
        showErr("Failed to load listing. Please check your connection.");
    }
}

function render(l) {
    document.title = `VISTA-HR · ${l.title || "Listing"}`;

    // Photos
    const raw = (l.photos && l.photos.length)
        ? l.photos
        : (l.cover ? [l.cover] : []);
    const normalPhotos = raw
        .map(p => typeof p === "object" ? p?.url : p)
        .filter(Boolean);

    const tourUrl = l.virtualTour?.enabled
        ? l.virtualTour?.panoUrl
        : (l.virtualTour?.panoUrl || l.tour_url || l.pano_url || "");

    // Grid items: only 5 visible slots
    let photoItems = normalPhotos.slice(0, 5).map(url => ({ url, is360: false }));

    // If may 360, replace the last visible tile so it always shows in the grid
    if (tourUrl) {
        if (photoItems.length >= 5) {
            photoItems[4] = { url: tourUrl, is360: true };
        } else {
            photoItems.push({ url: tourUrl, is360: true });
        }
    }

    allPhotos = normalPhotos; // lightbox only for real photos
    buildPhotoGrid(photoItems, l.title, tourUrl);
    buildMobileSlides(photoItems, tourUrl, l.title);

    // Title
    $("ldTitle").textContent = l.title || "Untitled space";

    // Badges
    const badges = [];
    if (l.place_type) badges.push(`<span class="ld-badge type">${esc(l.place_type)}</span>`);
    if (l.status === "PUBLISHED") badges.push(`<span class="ld-badge avail">Available</span>`);
    // student_discount_pct lives in capacity — resolved after cap is declared below
    $("ldBadges").innerHTML = badges.join("");

    // Location
    const loc = l.location || {};
    const locParts = [loc.barangay, loc.city || l.city, loc.province].filter(Boolean);
    $("ldLocTxt").textContent = locParts.join(", ") || "Metro Manila";

    // Rating
    if (l.avg_rating && l.review_count > 0) {
        $("ldRatingRow").hidden = false;
        $("ldStarsSm").innerHTML = miniStars(l.avg_rating);
        $("ldRevLink").textContent = `${l.review_count} review${l.review_count !== 1 ? "s" : ""}`;
    }

    // Host
    const owner = l.owner;
    if (owner) {
        ownerId = owner.id;
        ownerName = owner.name || "Property Owner";
        const init = (ownerName[0] || "P").toUpperCase();

        // Small host row avatar (top of listing)
        const av = $("ldHostAv");
        if (av) {
            if (owner.avatar_url) {
                av.innerHTML = `<img src="${esc(owner.avatar_url)}" alt="${esc(ownerName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                av.textContent = init;
            }
        }
        $("ldHostName").textContent = ownerName;
        $("ldHostSince").textContent = owner.member_since ? `Member since ${owner.member_since}` : "";
        if (owner.email) {
            const btn = $("ldMsgOwnerBtn");
            if (btn) btn.hidden = false;
        }

        // Meet your landlord card
        renderLandlordCard(owner);
    }

    // Room breakdown cards
    const cap = l.capacity || {};

    // Now cap is available — append student discount badge if applicable
    const discountPct = cap.student_discount_pct || 0;
    if (discountPct > 0) {
        $("ldBadges").innerHTML += `<span class="ld-badge disc">${discountPct}% student discount</span>`;
    }

    const rbEl = $("ldRoomBreakdown");
    if (rbEl) {
        const spaceType = l.space_type || l.placeType || null;
        const specItems = [
            { icon: "users", n: cap.guests, label: cap.guests === 1 ? "Guest" : "Guests" },
            { icon: "door-open", n: cap.bedrooms, label: cap.bedrooms === 1 ? "Bedroom" : "Bedrooms" },
            { icon: "bed-single", n: cap.beds, label: cap.beds === 1 ? "Bed" : "Beds" },
            { icon: "bath", n: cap.bathrooms, label: cap.bathrooms === 1 ? "Bath" : "Baths" },
        ].filter(s => s.n);
        rbEl.innerHTML =
            (spaceType ? `<div class="ld-room-type-row">${esc(spaceType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))}</div>` : "") +
            specItems.map(s => `
        <div class="ld-room-card">
          <i data-lucide="${s.icon}"></i>
          <div class="ld-room-num">${s.n}</div>
          <div class="ld-room-lbl">${esc(s.label)}</div>
        </div>`).join("");
    }

    // Description
    const descEl = $("ldDesc");
    if (descEl) {
        const fullDesc = l.description || "";
        descEl.textContent = fullDesc;
        const showMore = $("ldShowMore");
        if (showMore) {
            if (fullDesc.trim()) {
                showMore.hidden = false;
                showMore.innerHTML = `Show more <i data-lucide="chevron-right"></i>`;
                showMore.onclick = () => {
                    const body = $("descModalBody");
                    if (body) {
                        body.innerHTML = fullDesc.split(/\n+/).filter(p => p.trim()).map(p =>
                            `<p>${esc(p.trim())}</p>`
                        ).join("");
                    }
                    $("descOv").hidden = false;
                    $("descModal").hidden = false;
                    document.body.style.overflow = "hidden";
                    lucide.createIcons();
                };
            }
        }
    }

    const closeDesc = () => {
        $("descOv").hidden = true;
        $("descModal").hidden = true;
        document.body.style.overflow = "";
    };
    on("descClose", "click", closeDesc);
    on("descOv", "click", closeDesc);

    // Virtual tour section
    const detailTourUrl = l.virtualTour?.enabled
        ? l.virtualTour?.panoUrl
        : (l.virtualTour?.panoUrl || l.tour_url || l.pano_url || "");

    if (detailTourUrl) {
        $("ldTourSec").hidden = false;
        if ($("ldTourHr")) $("ldTourHr").hidden = false;
        $("ldTourLaunch").onclick = () => launchTour(detailTourUrl, l.title);
    }

    // Highlights
    // l.highlights is an array of IDs (integers) — resolve via _highlightMap
    const hl = l.highlights || [];
    function niceLabel(s) {
        return String(s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    if (hl.length) {
        $("ldHighSec").hidden = false;
        $("ldHighlights").innerHTML = hl.map(h => {
            const meta = _highlightMap.get(Number(h));
            const label = meta ? esc(meta.label) : esc(niceLabel(h));
            const icon = meta?.icon || "star";
            return `<div class="ld-hl"><i data-lucide="${icon}"></i>${label}</div>`;
        }).join("");
    }

    // Amenities
    // l.amenities is an array of IDs (integers) — resolve via _amenityMap
    // then regroup by category for the modal view
    const rawAmenIds = Array.isArray(l.amenities)
        ? l.amenities
        : Object.values(l.amenities || {}).flat();

    const resolvedAmen = rawAmenIds
        .map(id => _amenityMap.get(Number(id)))
        .filter(Boolean);

    // Regroup by category for the "Show all" modal
    const amenGroups = ["appliances", "activities", "safety"].reduce((acc, cat) => {
        const items = resolvedAmen.filter(a => a.category === cat);
        if (items.length) acc.push({ label: cat.charAt(0).toUpperCase() + cat.slice(1), items });
        return acc;
    }, []);

    // Also handle any already-grouped object shape from the API (fallback)
    if (!resolvedAmen.length && typeof l.amenities === "object" && !Array.isArray(l.amenities)) {
        const amen = l.amenities || {};
        const groups = [
            { label: "Appliances", items: amen.appliances || [] },
            { label: "Activities & common areas", items: amen.activities || [] },
            { label: "Safety", items: amen.safety || [] },
        ].filter(g => g.items.length);
        if (groups.length) {
            $("ldAmenSec").hidden = false;
            const flatAmen = groups.flatMap(g => g.items);
            const preview = flatAmen.slice(0, 6);
            $("ldAmenGrid").innerHTML = preview.map(a =>
                `<div class="ld-amen"><i data-lucide="${amenIcon(a)}"></i>${esc(niceLabel(a))}</div>`
            ).join("");
            const showAllAmen = $("ldShowAllAmen");
            if (showAllAmen) {
                showAllAmen.hidden = false;
                showAllAmen.innerHTML = `Show all ${flatAmen.length} amenities`;
                showAllAmen.onclick = () => {
                    const body = $("amenModalBody");
                    if (body) {
                        body.innerHTML = groups.map(g =>
                            `<div class="amen-group-hd">${esc(g.label)}</div>
             <div class="amen-full-grid">
               ${g.items.map(a => `<div class="amen-full-item"><i data-lucide="${amenIcon(a)}"></i>${esc(niceLabel(a))}</div>`).join("")}
             </div>`
                        ).join("");
                    }
                    $("amenOv").hidden = false;
                    $("amenModal").hidden = false;
                    document.body.style.overflow = "hidden";
                    lucide.createIcons();
                };
            }
        }
    } else if (resolvedAmen.length) {
        $("ldAmenSec").hidden = false;
        const preview = resolvedAmen.slice(0, 6);
        $("ldAmenGrid").innerHTML = preview.map(a =>
            `<div class="ld-amen"><i data-lucide="${a.icon || amenIcon(a.label)}"></i>${esc(a.label)}</div>`
        ).join("");

        const showAllAmen = $("ldShowAllAmen");
        if (showAllAmen) {
            showAllAmen.hidden = false;
            showAllAmen.innerHTML = `Show all ${resolvedAmen.length} amenities`;
            showAllAmen.onclick = () => {
                const body = $("amenModalBody");
                if (body) {
                    body.innerHTML = amenGroups.map(g =>
                        `<div class="amen-group-hd">${esc(g.label)}</div>
             <div class="amen-full-grid">
               ${g.items.map(a => `<div class="amen-full-item"><i data-lucide="${a.icon || amenIcon(a.label)}"></i>${esc(a.label)}</div>`).join("")}
             </div>`
                    ).join("");
                }
                $("amenOv").hidden = false;
                $("amenModal").hidden = false;
                document.body.style.overflow = "hidden";
                lucide.createIcons();
            };
        }
    }

    const closeAmen = () => {
        $("amenOv").hidden = true;
        $("amenModal").hidden = true;
        document.body.style.overflow = "";
    };
    on("amenClose", "click", closeAmen);
    on("amenOv", "click", closeAmen);

    // Map
    if (loc.lat && loc.lng) {
        initMap(loc.lat, loc.lng, l.title, locParts.join(", "));
    } else {
        document.querySelector(".ld-map-wrap")?.style && (document.querySelector(".ld-map-wrap").style.display = "none");
        $("ldMapNote").textContent = locParts.join(", ");
    }
    const dirBtn = $("ldDirBtn");
    if (dirBtn) {
        dirBtn.hidden = false;
        dirBtn.onclick = () => {
            const dest = (loc.lat && loc.lng) ? `${loc.lat},${loc.lng}` : encodeURIComponent(locParts.join(", "));
            window.open(`https://maps.google.com/maps?daddr=${dest}`, "_blank");
        };
    }

    // Booking card price — apply student discount if resident is student-verified
    const rent = cap.monthly_rent || cap.price;
    const isStudentVerified = currentUser?.student_status === "APPROVED";
    const discPct2 = cap.student_discount_pct || 0;
    const discountedRent = (isStudentVerified && discPct2 > 0)
        ? Math.round(rent * (1 - discPct2 / 100))
        : null;

    if (rent) {
        $("ldBookPrice").innerHTML = discountedRent
            ? `<span style="text-decoration:line-through;color:#999;font-size:0.85em">₱${Number(rent).toLocaleString()}</span> ₱${Number(discountedRent).toLocaleString()}<span>/mo</span> <span class="ld-badge disc" style="font-size:11px">${discPct2}% off</span>`
            : `₱${Number(rent).toLocaleString()}<span>/mo</span>`;
        $("ldMobPrice").innerHTML = discountedRent
            ? `₱${Number(discountedRent).toLocaleString()}<span style="font-size:12px;font-weight:400;color:rgba(26,26,26,.6)">/mo</span>`
            : `₱${Number(rent).toLocaleString()}<span style="font-size:12px;font-weight:400;color:rgba(26,26,26,.6)">/mo</span>`;
    } else {
        $("ldBookPrice").innerHTML = `Price on request`;
        $("ldMobPrice").innerHTML = "";
    }

    // Booking card rating
    if (l.avg_rating && l.review_count > 0) {
        const ratEl = $("ldBookRating");
        if (ratEl) {
            ratEl.hidden = false;
            ratEl.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="#F59E0B" stroke="#F59E0B"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg> ${l.avg_rating.toFixed(1)} · ${l.review_count} review${l.review_count !== 1 ? "s" : ""}`;
        }
    }

    // Show message buttons if owner found
    if (ownerId) {
        const mob = $("ldMobMsgBtn");
        const card = $("ldCardMsgBtn");
        if (mob) mob.hidden = false;
        if (card) card.hidden = false;
    }

    // Set today as min date for move-in
    const today = new Date().toISOString().split("T")[0];
    // date mins handled by Pikaday in setupBooking()

    lucide.createIcons();
}

// ── Photo grid ────────────────────────────────────────────
function buildPhotoGrid(items, title, tourUrl = "") {
    const slots = ["ldPhotoMain", "ldPhotoSide1", "ldPhotoSide2", "ldPhotoSide3", "ldPhotoSide4"];

    slots.forEach((id, i) => {
        const el = $(id);
        if (!el) return;

        const item = items[i];
        if (!item?.url) return;

        const keep = i === 4 ? el.querySelector(".ld-showall") : null;
        const badge = item.is360
            ? `<div class="ld-360-badge"><i data-lucide="rotate-3d"></i><span>360° Tour</span></div>`
            : "";

        el.innerHTML = `
            <div class="ld-photo-tile${item.is360 ? " is-360" : ""}">
                <img src="${esc(item.url)}" alt="${esc(title)} ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}">
                ${badge}
            </div>
        `;

        if (keep) el.appendChild(keep);

        const tile = el.querySelector(".ld-photo-tile");
        if (!tile) return;

        if (item.is360) {
            tile.addEventListener("click", () => {
                if (!tourUrl) return;
                const sec = $("ldTourSec");
                if (sec?.hidden) {
                    sec.hidden = false;
                    if ($("ldTourHr")) $("ldTourHr").hidden = false;
                }
                launchTour(tourUrl, `${title} 360° Tour`);
                sec?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        } else {
            const normalIdx = allPhotos.indexOf(item.url);
            tile.addEventListener("click", () => openLightbox(normalIdx >= 0 ? normalIdx : 0));
        }
    });

    const showAll = $("ldShowAll");
    if (showAll && allPhotos.length > 0) {
        showAll.hidden = false;
        showAll.innerHTML = `<i data-lucide="grid-2x2"></i> Show all ${allPhotos.length} photos`;
        showAll.onclick = () => openLightbox(0);
    }

    lucide.createIcons();
}

// ── Mobile slideshow ──────────────────────────────────────
function buildMobileSlides(items, tourUrl = "", title = "Listing") {
    const track = $("ldSlidesTrack");
    const ctr = $("ldSlideCounter");
    if (!track || !items.length) return;

    track.innerHTML = items.map((item, i) => `
        <div class="ld-slide-item${item.is360 ? " is-360" : ""}" data-i="${i}" style="position:relative;flex-shrink:0;width:100%;height:100%;">
            <img
                src="${esc(item.url)}"
                alt="Photo ${i + 1}"
                loading="${i === 0 ? "eager" : "lazy"}"
                style="width:100%;height:100%;object-fit:cover;"
            >
            ${item.is360 ? `<div class="ld-360-badge mob"><i data-lucide="rotate-3d"></i><span>360° Tour</span></div>` : ""}
        </div>
    `).join("");

    if (ctr) ctr.textContent = `1 / ${items.length}`;

    function goSlide(idx) {
        slideIdx = (idx + items.length) % items.length;
        track.style.transform = `translateX(-${slideIdx * 100}%)`;
        if (ctr) ctr.textContent = `${slideIdx + 1} / ${items.length}`;
    }

    on("ldSlidePrev", "click", () => goSlide(slideIdx - 1));
    on("ldSlideNext", "click", () => goSlide(slideIdx + 1));

    track.querySelectorAll(".ld-slide-item").forEach((slide, i) => {
        slide.addEventListener("click", () => {
            const item = items[i];
            if (!item) return;

            if (item.is360) {
                if (!tourUrl) return;
                const sec = $("ldTourSec");
                if (sec?.hidden) {
                    sec.hidden = false;
                    if ($("ldTourHr")) $("ldTourHr").hidden = false;
                }
                launchTour(tourUrl, `${title} 360° Tour`);
                sec?.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                const normalIdx = allPhotos.indexOf(item.url);
                openLightbox(normalIdx >= 0 ? normalIdx : 0);
            }
        });
    });

    let tx = 0;
    const mob = $("ldMobSlides");
    if (mob) {
        mob.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
        mob.addEventListener("touchend", e => {
            const dx = tx - e.changedTouches[0].clientX;
            if (Math.abs(dx) > 40) goSlide(slideIdx + (dx > 0 ? 1 : -1));
        });
    }

    lucide.createIcons();
}

// ── Lightbox ──────────────────────────────────────────────
function openLightbox(startIdx) {
    lbIdx = startIdx;
    const lb = $("ldLb");
    if (!lb) return;
    lb.hidden = false;
    document.body.style.overflow = "hidden";

    const strip = $("ldLbStrip");
    if (strip) {
        strip.innerHTML = allPhotos.map((url, i) =>
            `<div class="ld-lb-thumb${i === lbIdx ? " active" : ""}" data-i="${i}"><img src="${esc(url)}" loading="lazy"></div>`
        ).join("");
        strip.querySelectorAll(".ld-lb-thumb").forEach(t => {
            t.addEventListener("click", () => updateLb(parseInt(t.dataset.i, 10)));
        });
    }
    updateLb(lbIdx);

    on("ldLbClose", "click", closeLightbox);
    on("ldLbPrev", "click", () => updateLb(lbIdx - 1));
    on("ldLbNext", "click", () => updateLb(lbIdx + 1));

    document._lbKey = e => {
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") updateLb(lbIdx - 1);
        if (e.key === "ArrowRight") updateLb(lbIdx + 1);
    };
    document.addEventListener("keydown", document._lbKey);
}

function updateLb(idx) {
    lbIdx = (idx + allPhotos.length) % allPhotos.length;
    const img = $("ldLbImg");
    if (img) {
        img.src = allPhotos[lbIdx];
        img.alt = `Photo ${lbIdx + 1}`;
    }
    const ctr = $("ldLbCtr");
    if (ctr) ctr.textContent = `${lbIdx + 1} / ${allPhotos.length}`;
    document.querySelectorAll(".ld-lb-thumb").forEach((t, i) => t.classList.toggle("active", i === lbIdx));
    document.querySelectorAll(".ld-lb-thumb")[lbIdx]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function closeLightbox() {
    $("ldLb").hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", document._lbKey);
}

// ── Virtual Tour (Pannellum) ──────────────────────────────
function launchTour(url, title) {
    const cover = $("ldTourCover");
    const pann = $("ldPannellum");

    if (!cover || !pann || !url) return;

    cover.hidden = true;
    pann.hidden = false;

    if (!window.pannellum) {
        console.error("Pannellum not loaded on listing detail page.");
        return;
    }

    initPann(url, title);
}

function initPann(url, title) {
    if (pannellumViewer) return;
    pannellumViewer = window.pannellum.viewer("ldPannellum", {
        type: "equirectangular",
        panorama: url,
        title: title,
        autoLoad: true,
        autoRotate: -2,
        compass: false,
        showZoomCtrl: true,
        showFullscreenCtrl: true,
        hfov: 100,
    });
}

// ── Map ───────────────────────────────────────────────────
function initMap(lat, lng, title, addr) {
    try {
        const map = L.map("ldMap", { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 16);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
            maxZoom: 19
        }).addTo(map);

        const icon = L.divIcon({
            className: "",
            html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;background:#123458;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);transform:rotate(-45deg)"></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 34],
        });
        L.marker([lat, lng], { icon }).addTo(map).bindPopup(title || "Listing");

        const note = $("ldMapNote");
        if (note) note.textContent = addr;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                const dist = haversine(pos.coords.latitude, pos.coords.longitude, lat, lng);
                if (note) {
                    note.textContent = `${addr} · ${dist < 1 ? Math.round(dist * 1000) + "m" : dist.toFixed(1) + "km"} from you`;
                }
            }, () => { });
        }
    } catch { }
}

function haversine(la1, lo1, la2, lo2) {
    const R = 6371;
    const dL = (la2 - la1) * Math.PI / 180;
    const dO = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dL / 2) ** 2 +
        Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) *
        Math.sin(dO / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Meet your landlord ────────────────────────────────────
function renderLandlordCard(owner) {
    const sec = $("ldLandlordSec");
    if (!sec) return;
    sec.hidden = false;

    const init = (owner.name?.[0] || "P").toUpperCase();
    const avatarHtml = owner.avatar_url
        ? `<img src="${esc(owner.avatar_url)}" alt="${esc(owner.name || "Owner")}" class="ll-av-img">`
        : `<div class="ll-av-fallback">${esc(init)}</div>`;

    const ratingHtml = owner.owner_rating
        ? `<div class="ll-rating">
             <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="#F59E0B"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
             ${owner.owner_rating.toFixed(1)}
             <span class="ll-rating-ct">(${owner.owner_reviews} review${owner.owner_reviews !== 1 ? "s" : ""})</span>
           </div>`
        : `<div class="ll-rating ll-rating-none">No ratings yet</div>`;

    const badgeHtml = owner.kyc_verified
        ? `<span class="ll-badge"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Verified</span>`
        : "";

    $("llAvWrap").innerHTML = avatarHtml;
    $("llName").textContent = owner.name || "Property Owner";
    $("llMeta").innerHTML = `
        ${badgeHtml}
        <div class="ll-since">${owner.member_since ? `Member since ${owner.member_since}` : ""}</div>
        ${ratingHtml}`;
}

// ── Reviews ───────────────────────────────────────────────
async function loadReviews(lid, reset = false) {
    if (reset) { rvPage = 1; allRevs = []; }
    try {
        const r = await fetch(`${API}/listings/${lid}/reviews?page=${rvPage}&per_page=6`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        revTotal = d.total;
        allRevs = reset ? d.reviews : [...allRevs, ...d.reviews];
        renderRevSummary(d.avg_rating, d.total, d.rating_breakdown);
        renderRevList(allRevs);
        const lm = $("ldLoadMore");
        if (lm) {
            lm.hidden = allRevs.length >= revTotal;
            lm.onclick = async () => { rvPage++; await loadReviews(lid, false); };
        }
    } catch { }
}

function miniStars(rating) {
    return Array.from({ length: 5 }, (_, i) =>
        `<svg class="ld-star-sm${i >= Math.round(rating) ? " e" : ""}" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`
    ).join("");
}

function starSvg(filled, cls = "ld-rev-s") {
    return `<svg class="${cls}${filled ? "" : " e"}" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;
}

function renderRevSummary(avg, total, breakdown) {
    const title = $("ldRevTitle");
    if (title) title.textContent = total ? `${avg?.toFixed(1) ?? ""} · ${total} review${total !== 1 ? "s" : ""}` : "Reviews";
    const sum = $("ldRevSummary");
    if (!sum) return;
    if (!total) { sum.hidden = true; return; }
    sum.hidden = false;
    const bars = [5, 4, 3, 2, 1].map(n => {
        const ct = breakdown?.[String(n)] || 0;
        const pct = total ? Math.round((ct / total) * 100) : 0;
        return `<div class="ld-bar-row"><span class="ld-bar-n">${n}</span><div class="ld-bar-track"><div class="ld-bar-fill" style="width:${pct}%"></div></div><span class="ld-bar-ct">${ct}</span></div>`;
    }).join("");
    sum.innerHTML = `
    <div class="ld-rev-big">
      <div class="ld-rev-score">${avg?.toFixed(1) ?? "—"}</div>
      <div class="ld-rev-stars">${Array.from({ length: 5 }, (_, i) => starSvg(i < Math.round(avg ?? 0), "ld-rev-star")).join("")}</div>
      <div class="ld-rev-total">${total} review${total !== 1 ? "s" : ""}</div>
    </div>
    <div class="ld-rev-bars">${bars}</div>`;
}

function renderRevList(revs) {
    const grid = $("ldRevGrid");
    const llGrid = $("llRevGrid");

    // Populate Meet your landlord reviews panel (same data)
    if (llGrid) {
        if (!revs.length) {
            llGrid.innerHTML = `<p class="ll-no-rev">No reviews yet.</p>`;
        } else {
            llGrid.innerHTML = revs.slice(0, 6).map(rv => {
                const date = rv.created_at
                    ? new Date(rv.created_at).toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" })
                    : "";
                const name = rv.resident_name || "Resident";
                const init = (name[0] || "R").toUpperCase();
                const avatarHtml = rv.reviewer_avatar_url
                    ? `<img src="${esc(rv.reviewer_avatar_url)}" alt="${esc(name)}" class="ll-rev-av-img">`
                    : `<div class="ll-rev-av-fallback">${esc(init)}</div>`;
                return `<div class="ll-rev-card">
                  <div class="ll-rev-top">
                    <div class="ll-rev-av-wrap">${avatarHtml}</div>
                    <div>
                      <div class="ll-rev-name">${esc(name)}</div>
                      <div class="ll-rev-date">${esc(date)}</div>
                    </div>
                    <div class="ll-rev-stars">${Array.from({ length: 5 }, (_, i) => starSvg(i < rv.rating, "ld-rev-s")).join("")}</div>
                  </div>
                  ${rv.comment ? `<p class="ll-rev-txt">${esc(rv.comment)}</p>` : ""}
                </div>`;
            }).join("");
        }
    }

    if (!grid) return;
    grid.innerHTML = revs.map(rv => {
        const date = rv.created_at
            ? new Date(rv.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
            : "";
        const name = rv.resident_name || "Resident";
        const init = (name[0] || "R").toUpperCase();
        const avatarHtml = rv.reviewer_avatar_url
            ? `<img src="${esc(rv.reviewer_avatar_url)}" alt="${esc(name)}" class="ld-rev-av-img">`
            : `<div class="ld-rev-av">${esc(init)}</div>`;
        return `<div class="ld-rev-card">
      <div class="ld-rev-top">
        <div class="ld-rev-av-wrap">${avatarHtml}</div>
        <div><div class="ld-rev-name">${esc(name)}</div><div class="ld-rev-date">${esc(date)}</div></div>
      </div>
      <div class="ld-rev-stars2">${Array.from({ length: 5 }, (_, i) => starSvg(i < rv.rating, "ld-rev-s")).join("")}</div>
      ${rv.comment ? `<p class="ld-rev-txt">${esc(rv.comment)}</p>` : ""}
    </div>`;
    }).join("");
}

// ── Eligibility check ─────────────────────────────────────
async function checkEligibility(lid) {
    try {
        const session = window.AuthGuard?.getSession?.()?.user;
        if (!session) return;
        const r = await fetch(`${API}/bookings/mine`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        // Only COMPLETED bookings qualify — matches backend rule in reviews.py
        const eligible = (d.bookings || []).some(b => b.listing_id === lid && b.status === "COMPLETED");
        const reviewed = allRevs.some(rv => rv.resident_id === session.id);
        if (eligible && !reviewed) {
            const btn = $("ldWriteRev");
            if (btn) btn.hidden = false;
        }
    } catch { }
}

// ── Similar listings ──────────────────────────────────────
async function loadSimilar(lid) {
    if (!listing) return;
    try {
        const city = (listing.location?.city || listing.city || "").toLowerCase();
        const type = (listing.place_type || "").toLowerCase();
        const params = new URLSearchParams({ limit: 8 });
        if (city) params.set("city", city);
        if (type) params.set("type", type);
        const r = await fetch(`${API}/listings/feed?${params}`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        const others = (d.listings || []).filter(x => x.id !== lid).slice(0, 6);
        if (!others.length) return;
        $("ldSimilarSec").hidden = false;
        $("ldSimilarRow").innerHTML = others.map(l => {
            const cap = l.capacity || {};
            const price = l.price ?? cap.monthly_rent ?? cap.price;
            const cover = l.cover || null;
            const loc = [l.barangay, l.city].filter(Boolean).join(", ");
            return `<div class="ld-sim-card" data-id="${l.id}">
        ${cover ? `<img class="ld-sim-img" src="${esc(cover)}" alt="${esc(l.title)}" loading="lazy">` : `<div class="ld-sim-img" style="background:#e8e4df;display:flex;align-items:center;justify-content:center;"><i data-lucide="home" style="width:24px;height:24px;color:rgba(26,26,26,.3)"></i></div>`}
        <div class="ld-sim-loc">${esc(loc)}</div>
        <div class="ld-sim-type">${esc(l.place_type || "Room")}</div>
        <div class="ld-sim-price">${price ? `₱${Number(price).toLocaleString()}/mo` : "Price on request"}</div>
      </div>`;
        }).join("");
        $("ldSimilarRow").querySelectorAll(".ld-sim-card").forEach(card => {
            card.addEventListener("click", () => {
                location.href = `/Resident/listing_detail.html?id=${card.dataset.id}`;
            });
        });
        lucide.createIcons();
    } catch { }
}

// ── Share ─────────────────────────────────────────────────
function setupShare(lid) {
    on("ldShareBtn", "click", async () => {
        const url = `${location.origin}/Resident/listing_detail.html?id=${lid}`;
        const title = listing?.title || "VISTA-HR Listing";
        if (navigator.share) {
            try { await navigator.share({ title, url }); return; } catch { }
        }
        try { await navigator.clipboard.writeText(url); } catch { }
        showToast("Link copied!");
    });
}

function showToast(msg) {
    const t = $("ldToast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

// ── Save ──────────────────────────────────────────────────
function setupSave(lid) {
    const btn = $("ldSaveBtn");
    if (!btn) return;
    let saved = false;
    try { saved = JSON.parse(localStorage.getItem("vista_saved") || "[]").includes(lid); } catch { }
    updateSaveBtn(btn, saved);
    btn.addEventListener("click", () => {
        try {
            const arr = JSON.parse(localStorage.getItem("vista_saved") || "[]");
            const next = saved ? arr.filter(x => x !== lid) : [...arr, lid];
            localStorage.setItem("vista_saved", JSON.stringify(next));
            saved = !saved;
            updateSaveBtn(btn, saved);
            showToast(saved ? "Saved!" : "Removed from saved");
        } catch { }
    });
}

function updateSaveBtn(btn, saved) {
    btn.classList.toggle("saved", saved);
    const sv = btn.querySelector("svg");
    if (sv) {
        sv.style.fill = saved ? "#DC2626" : "none";
        sv.style.stroke = saved ? "#DC2626" : "currentColor";
    }
}

// ── Reservation status guard ──────────────────────────────
async function checkReservationStatus(lid) {
    try {
        const session = window.AuthGuard?.getSession?.()?.user;
        if (!session) return;

        const r = await fetch(`${API}/bookings/me/status`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();

        if (!d.has_live_booking) return;

        const liveBooking = d.booking || {};
        const isThisListing = liveBooking.listing_id === lid;

        const statusLabels = {
            PENDING: "Pending",
            APPROVED: "Reserved",
            ACTIVE: "Occupied",
            COMPLETED: "Moved Out",
        };
        const statusLabel = statusLabels[liveBooking.status] || liveBooking.status;

        const msg = isThisListing
            ? "You already have a reservation for this listing"
            : "You already have an active reservation";

        ["ldReserveBtn", "ldMobReserveBtn"].forEach(id => {
            const btn = $(id);
            if (!btn) return;
            btn.disabled = true;
            btn.classList.add("btn--disabled");
            btn.title = `Status: ${statusLabel}`;
            const span = btn.querySelector("span") || btn;
            span.textContent = msg;
        });
    } catch { }
}

// ── Booking ───────────────────────────────────────────────
let _pikaMoveIn = null;
let _pikaEnd = null;

function setupBooking(lid) {
    const openBm = () => openBookingModal(lid);
    on("ldReserveBtn", "click", openBm);
    on("ldMobReserveBtn", "click", openBm);
    on("bmClose", "click", closeBm);
    on("bmCancel", "click", closeBm);
    on("bmSend", "click", () => sendBooking(lid));

    // Close on overlay click (outside modal card)
    $("bmOv")?.addEventListener("click", e => {
        if (e.target === $("bmOv")) closeBm();
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Pikaday — Move-in
    _pikaMoveIn = new Pikaday({
        field: $("bmMoveIn"),
        minDate: today,
        toString: d => fmtPikaDate(d),
        onSelect(d) {
            $("bmMoveInVal").value = toISODate(d);
            // Push contract end minDate to day after move-in
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            _pikaEnd.setMinDate(next);
            updateDuration();
            validateBmDates();
        },
    });

    // Pikaday — Contract end
    _pikaEnd = new Pikaday({
        field: $("bmContractEnd"),
        minDate: new Date(today.getTime() + 86400000),
        toString: d => fmtPikaDate(d),
        onSelect() {
            $("bmContractEndVal").value = toISODate(_pikaEnd.getDate());
            updateDuration();
            validateBmDates();
        },
    });
}

function fmtPikaDate(d) {
    if (!d) return "";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function toISODate(d) {
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function updateDuration() {
    const startVal = $("bmMoveInVal")?.value;
    const endVal = $("bmContractEndVal")?.value;
    const dur = $("bmDuration");
    if (!dur) return;
    if (!startVal || !endVal) { dur.hidden = true; return; }
    const ms = new Date(endVal) - new Date(startVal);
    const days = Math.round(ms / 86400000);
    if (days <= 0) { dur.hidden = true; return; }
    const months = Math.floor(days / 30);
    const rem = days % 30;
    const parts = [];
    if (months) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
    if (rem) parts.push(`${rem} day${rem !== 1 ? "s" : ""}`);
    dur.textContent = `Duration: ${parts.join(" and ")}`;
    dur.hidden = false;

    // Update sidebar summary
    const summary = $("ldDateSummary");
    if (summary) {
        $("ldsSummaryMoveIn").textContent = fmtPikaDate(new Date(startVal));
        $("ldsSummaryEnd").textContent = fmtPikaDate(new Date(endVal));
        summary.hidden = false;
    }
}

function validateBmDates() {
    const hasStart = !!$("bmMoveInVal")?.value;
    const hasEnd = !!$("bmContractEndVal")?.value;
    const btn = $("bmSend");
    if (btn) btn.disabled = !(hasStart && hasEnd);
}

function openBookingModal(lid) {
    const cap = listing?.capacity || {};
    const rent = cap.monthly_rent || cap.price;
    const isStudentV = currentUser?.student_status === "APPROVED";
    const bDiscPct = cap.student_discount_pct || 0;
    const bDiscRent = (isStudentV && bDiscPct > 0 && rent) ? Math.round(rent * (1 - bDiscPct / 100)) : null;
    const cover = allPhotos[0];
    const locParts = [listing?.location?.barangay, listing?.location?.city || listing?.city].filter(Boolean);

    const priceSnap = rent
        ? (bDiscRent
            ? `<div class="bm-snap-price"><span class="bm-snap-orig">₱${Number(rent).toLocaleString()}</span> ₱${Number(bDiscRent).toLocaleString()}<span class="bm-snap-mo">/mo</span></div>`
            : `<div class="bm-snap-price">₱${Number(rent).toLocaleString()}<span class="bm-snap-mo">/mo</span></div>`)
        : "";

    $("bmSnap").innerHTML = `
        ${cover
            ? `<img class="bm-snap-img" src="${esc(cover)}" alt="">`
            : `<div class="bm-snap-ph"><i data-lucide="home"></i></div>`}
        <div class="bm-snap-info">
            <div class="bm-snap-title">${esc(listing?.title || "")}</div>
            <div class="bm-snap-sub">${esc(listing?.place_type || "")} · ${esc(locParts.join(", "))}</div>
        </div>
        ${priceSnap}`;

    // Reset state
    $("bmMoveIn").value = "";
    $("bmContractEnd").value = "";
    $("bmMoveInVal").value = "";
    $("bmContractEndVal").value = "";
    $("bmNote").value = "";
    $("bmDuration").hidden = true;
    $("bmErr").hidden = true;
    $("bmSend").disabled = true;
    $("bmBd").hidden = false;
    $("bmOk").hidden = true;
    $("bmFt").hidden = false;
    $("bmLbl").hidden = false;
    $("bmSpin").hidden = true;

    // Reset pikaday
    _pikaMoveIn?.setDate(null, true);
    _pikaEnd?.setDate(null, true);

    $("bmOv").hidden = false;
    document.body.style.overflow = "hidden";
    lucide.createIcons();
}

function closeBm() {
    $("bmOv").hidden = true;
    document.body.style.overflow = "";
}

async function sendBooking(lid) {
    const session = window.AuthGuard?.getSession?.()?.user;
    if (session?.email_verified === false) {
        $("bmErr").textContent = "Please verify your email first.";
        $("bmErr").hidden = false;
        return;
    }
    const moveIn = $("bmMoveInVal")?.value;
    const contractEnd = $("bmContractEndVal")?.value;
    if (!moveIn || !contractEnd) {
        $("bmErr").textContent = "Please select both move-in and contract end dates.";
        $("bmErr").hidden = false;
        return;
    }
    $("bmSend").disabled = true;
    $("bmLbl").hidden = true;
    $("bmSpin").hidden = false;
    $("bmErr").hidden = true;
    try {
        const res = await fetch(`${API}/bookings`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                listing_id: lid,
                move_in_date: moveIn,
                move_out_date: contractEnd,
                message: $("bmNote")?.value.trim() || null,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed.");
        $("bmBd").hidden = true;
        $("bmFt").hidden = true;
        $("bmOk").hidden = false;
        lucide.createIcons();
        setTimeout(closeBm, 3000);
    } catch (err) {
        $("bmErr").textContent = err.message;
        $("bmErr").hidden = false;
        $("bmSend").disabled = false;
        $("bmLbl").hidden = false;
        $("bmSpin").hidden = true;
    }
}

// ── Message owner ─────────────────────────────────────────
function setupMessage() {
    const openMsg = () => {
        if (!ownerId) return;
        $("msgText").value = "";
        $("msgCt").textContent = "0";
        $("msgErr").hidden = true;
        $("msgSend").disabled = false;
        $("msgLbl").hidden = false;
        $("msgSpin").hidden = true;
        $("msgOv").hidden = false;
        $("msgModal").hidden = false;
        document.body.style.overflow = "hidden";
        $("msgText")?.focus();
    };
    const closeMsg = () => {
        $("msgOv").hidden = true;
        $("msgModal").hidden = true;
        document.body.style.overflow = "";
    };

    on("ldCardMsgBtn", "click", openMsg);
    on("ldMobMsgBtn", "click", openMsg);
    on("msgClose", "click", closeMsg);
    on("msgCancel", "click", closeMsg);
    on("msgOv", "click", closeMsg);
    on("msgSend", "click", sendMessage);

    $("msgText")?.addEventListener("input", () => {
        $("msgCt").textContent = $("msgText").value.length;
    });
}

async function sendMessage() {
    const text = $("msgText")?.value.trim();
    if (!text) {
        $("msgErr").textContent = "Please write a message.";
        $("msgErr").hidden = false;
        return;
    }
    if (!ownerId || !listing?.id) {
        $("msgErr").textContent = "Cannot find owner.";
        $("msgErr").hidden = false;
        return;
    }
    $("msgSend").disabled = true;
    $("msgLbl").hidden = true;
    $("msgSpin").hidden = false;
    $("msgErr").hidden = true;
    try {
        const res = await fetch(`${API}/messages`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiver_id: ownerId, listing_id: listing.id, text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send.");
        $("msgOv").hidden = true;
        $("msgModal").hidden = true;
        document.body.style.overflow = "";
        showToast("Message sent! Opening your inbox…");
        setTimeout(() => {
            location.href = `/Resident/resident_messages.html?listing=${listing.id}&owner=${ownerId}`;
        }, 1200);
    } catch (err) {
        $("msgErr").textContent = err.message;
        $("msgErr").hidden = false;
        $("msgSend").disabled = false;
        $("msgLbl").hidden = false;
        $("msgSpin").hidden = true;
    }
}

// ── Review modal ──────────────────────────────────────────
function setupReviewModal(lid) {
    const open = () => {
        selRating = 0;
        $("rvText").value = "";
        $("rvCt").textContent = "0";
        $("rvErr").hidden = true;
        $("rvSend").disabled = true;
        $("rvLbl2").hidden = false;
        $("rvSpin").hidden = true;
        updateStars(0);
        $("rvLbl").textContent = "Tap a star to rate";
        $("rvOv").hidden = false;
        $("rvModal").hidden = false;
        document.body.style.overflow = "hidden";
        lucide.createIcons();
    };
    const close = () => {
        $("rvOv").hidden = true;
        $("rvModal").hidden = true;
        document.body.style.overflow = "";
    };

    on("ldWriteRev", "click", open);
    on("rvClose", "click", close);
    on("rvCancel", "click", close);
    on("rvOv", "click", close);

    document.querySelectorAll("#ldStarRow button").forEach(btn => {
        btn.addEventListener("click", () => {
            selRating = parseInt(btn.dataset.s, 10);
            updateStars(selRating);
            $("rvLbl").textContent = STAR_LABELS[selRating] || "";
            $("rvSend").disabled = false;
        });
        btn.addEventListener("mouseover", () => updateStars(parseInt(btn.dataset.s, 10), true));
        btn.addEventListener("mouseout", () => updateStars(selRating));
    });

    $("rvText")?.addEventListener("input", () => {
        $("rvCt").textContent = $("rvText").value.length;
    });

    on("rvSend", "click", async () => {
        if (!selRating) return;
        $("rvSend").disabled = true;
        $("rvLbl2").hidden = true;
        $("rvSpin").hidden = false;
        $("rvErr").hidden = true;
        try {
            const res = await fetch(`${API}/listings/${lid}/reviews`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating: selRating, comment: $("rvText")?.value.trim() || null }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed.");
            close();
            await Promise.all([loadReviews(lid, true), loadListing(lid)]);
            $("ldWriteRev").hidden = true;
            showToast("Review submitted!");
        } catch (err) {
            $("rvErr").textContent = err.message;
            $("rvErr").hidden = false;
            $("rvSend").disabled = false;
            $("rvLbl2").hidden = false;
            $("rvSpin").hidden = true;
        }
    });
}

function updateStars(n, hover = false) {
    document.querySelectorAll("#ldStarRow button").forEach((btn, i) => {
        btn.classList.toggle("on", !hover && i < n);
        btn.classList.toggle("hov", hover && i < n);
    });
    lucide.createIcons();
}

// ── Scroll nav ───────────────────────────────────────────
function setupScrollNav() {
    const nav = $("ldScrollNav");
    const photos = $("ldPhotosWrap");
    if (!nav || !photos) return;

    const photosBottom = () => photos.getBoundingClientRect().bottom + window.scrollY;

    function updateNav() {
        const scrollY = window.scrollY;
        if (scrollY > photosBottom() - 100) {
            nav.classList.add("visible");
            nav.hidden = false;
        } else {
            nav.classList.remove("visible");
        }

        const sections = [
            { id: "ldPhotosWrap", link: nav.querySelector('[data-target="ldPhotosWrap"]') },
            { id: "ldAmenSec", link: nav.querySelector('[data-target="ldAmenSec"]') },
            { id: "ldRevSec", link: nav.querySelector('[data-target="ldRevSec"]') },
            { id: "ldMapSec", link: nav.querySelector('[data-target="ldMapSec"]') },
        ];
        let active = sections[0];
        for (const s of sections) {
            const el = $(s.id);
            if (!el) continue;
            if (el.getBoundingClientRect().top < 120) active = s;
        }
        nav.querySelectorAll(".ld-snav-link").forEach(l => l.classList.remove("active"));
        active?.link?.classList.add("active");
    }

    nav.querySelectorAll(".ld-snav-link").forEach(link => {
        link.addEventListener("click", e => {
            e.preventDefault();
            const target = $(link.dataset.target);
            if (target) {
                const top = target.getBoundingClientRect().top + window.scrollY - 130;
                window.scrollTo({ top, behavior: "smooth" });
            }
        });
    });

    window.addEventListener("scroll", updateNav, { passive: true });
    updateNav();
}

// ── Date sync (card → booking modal) ─────────────────────
function setupDateSync() {
    $("ldMoveIn")?.addEventListener("change", () => {
        if ($("bmDate")) $("bmDate").value = $("ldMoveIn").value;
    });
}

// ── Error state ───────────────────────────────────────────
function showErr(msg) {
    document.body.innerHTML = `<div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;gap:12px;padding:24px">
    <div style="font-size:40px">🏠</div>
    <h2 style="font-size:18px;font-weight:600;color:#1a1a1a">${esc(msg)}</h2>
    <a href="/Resident/resident_home.html" style="color:#123458;font-weight:600;text-decoration:underline">← Back to listings</a>
  </div>`;
}