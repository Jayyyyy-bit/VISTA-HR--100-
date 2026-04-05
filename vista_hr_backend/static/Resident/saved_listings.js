/* Resident/saved_listings.js — Wishlists page */
(() => {
    const API = "/api";
    let savedListings = [];
    let currentUser = null;

    function el(id) { return document.getElementById(id); }

    // ── Init ────────────────────────────────────────────────────
    async function init() {
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (!res.ok) { location.href = "/auth/login.html"; return; }
            const data = await res.json().catch(() => ({}));
            currentUser = data?.user;
            if (!currentUser) { location.href = "/auth/login.html"; return; }

            // Set avatar
            const init = (currentUser.first_name?.[0] || currentUser.email?.[0] || "U").toUpperCase();
            if (el("avatarInit")) el("avatarInit").textContent = init;
            if (currentUser.avatar_url && el("avatarImg")) {
                el("avatarImg").src = currentUser.avatar_url;
                el("avatarImg").hidden = false;
                el("avatarInit").hidden = true;
            }
        } catch {
            location.href = "/auth/login.html";
            return;
        }

        await loadSaved();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Load saved listings ─────────────────────────────────────
    async function loadSaved() {
        try {
            const res = await fetch(`${API}/listings/saved`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to load");
            const data = await res.json();
            savedListings = data.listings || [];
        } catch {
            savedListings = [];
        }

        renderAlbums();
    }

    // ── Render album view (2x2 mosaic) ──────────────────────────
    function renderAlbums() {
        const grid = el("albumGrid");
        const empty = el("emptyState");
        const sub = el("pageSub");

        grid.innerHTML = "";

        if (!savedListings.length) {
            grid.hidden = true;
            empty.hidden = false;
            if (sub) sub.textContent = "";
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        grid.hidden = false;
        empty.hidden = true;
        if (sub) sub.textContent = `${savedListings.length} listing${savedListings.length !== 1 ? "s" : ""} saved`;

        // Build one album card showing up to 4 photos as a mosaic
        const card = document.createElement("div");
        card.className = "album-card";
        card.style.animationDelay = "0ms";

        const mosaic = document.createElement("div");
        mosaic.className = "album-mosaic";

        // Collect up to 4 unique photos from saved listings
        const photos = [];
        for (const listing of savedListings) {
            const listingPhotos = listing.photos || [];
            if (listingPhotos.length > 0) {
                const url = typeof listingPhotos[0] === "string" ? listingPhotos[0] : listingPhotos[0]?.url;
                if (url) photos.push(url);
            }
            if (photos.length >= 4) break;
        }

        // Fill 4 slots (photos or placeholders)
        for (let i = 0; i < 4; i++) {
            if (photos[i]) {
                const img = document.createElement("img");
                img.src = photos[i];
                img.alt = "Saved listing";
                img.loading = "lazy";
                mosaic.appendChild(img);
            } else {
                const ph = document.createElement("div");
                ph.className = "mosaic-placeholder";
                ph.innerHTML = `<i data-lucide="image"></i>`;
                mosaic.appendChild(ph);
            }
        }

        card.appendChild(mosaic);

        const label = document.createElement("div");
        label.className = "album-label";
        label.textContent = "Saved listings";
        card.appendChild(label);

        const count = document.createElement("div");
        count.className = "album-count";
        const newest = savedListings[0]?.saved_at;
        if (newest) {
            const d = new Date(newest);
            const now = new Date();
            const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
            count.textContent = diff === 0 ? "Updated today"
                : diff === 1 ? "Updated yesterday"
                    : diff < 7 ? `Updated ${diff} days ago`
                        : diff < 30 ? `${Math.floor(diff / 7)} week${Math.floor(diff / 7) > 1 ? "s" : ""} ago`
                            : d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        } else {
            count.textContent = `${savedListings.length} saved`;
        }
        card.appendChild(count);

        card.addEventListener("click", () => showListingsView());

        grid.appendChild(card);

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Expanded listings view ───────────────────────────────────
    function showListingsView() {
        el("albumGrid").hidden = true;
        el("pageSub").hidden = true;
        document.querySelector(".page-title").hidden = true;
        el("listingsView").hidden = false;
        el("listingsTitle").textContent = `Saved listings · ${savedListings.length}`;

        renderListings();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    el("backToAlbums")?.addEventListener("click", () => {
        el("listingsView").hidden = true;
        el("albumGrid").hidden = false;
        el("pageSub").hidden = false;
        document.querySelector(".page-title").hidden = false;
        renderAlbums();
    });

    function renderListings() {
        const grid = el("listingsGrid");
        grid.innerHTML = "";

        savedListings.forEach((listing, i) => {
            const card = document.createElement("div");
            card.className = "sl-card";
            card.style.animationDelay = `${i * 60}ms`;

            const photos = listing.photos || [];
            const firstPhoto = photos.length > 0
                ? (typeof photos[0] === "string" ? photos[0] : photos[0]?.url)
                : null;

            const loc = listing.location || {};
            const locationStr = [loc.city, loc.barangay].filter(Boolean).join(", ") || "Location not set";

            const cap = listing.capacity || {};
            const rent = cap.monthly_rent
                ? `₱${Number(cap.monthly_rent).toLocaleString()}/mo`
                : "";

            card.innerHTML = `
                <div class="sl-card-photo">
                    ${firstPhoto
                    ? `<img src="${firstPhoto}" alt="${listing.title || 'Listing'}" loading="lazy" />`
                    : `<div class="sl-card-placeholder"><i data-lucide="image"></i></div>`
                }
                    <button class="sl-card-unsave" data-id="${listing.id}" title="Remove from saved">
                        <i data-lucide="heart"></i>
                    </button>
                </div>
                <div class="sl-card-body">
                    <div class="sl-card-title">${listing.title || "Untitled listing"}</div>
                    <div class="sl-card-location">${locationStr}</div>
                    <div class="sl-card-meta">
                        ${rent ? `<span class="sl-card-price">${rent}</span>` : ""}
                        ${listing.place_type ? `<span class="sl-card-type">${listing.place_type}</span>` : ""}
                    </div>
                </div>
            `;

            // Click card → go to listing detail
            card.addEventListener("click", (e) => {
                if (e.target.closest(".sl-card-unsave")) return;
                location.href = `/Resident/listing_detail.html?id=${listing.id}`;
            });

            // Unsave button
            card.querySelector(".sl-card-unsave")?.addEventListener("click", async (e) => {
                e.stopPropagation();
                await unsaveListing(listing.id, card);
            });

            grid.appendChild(card);
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Unsave ──────────────────────────────────────────────────
    async function unsaveListing(listingId, cardEl) {
        try {
            const res = await fetch(`${API}/listings/${listingId}/save`, {
                method: "POST",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed");

            // Animate out
            cardEl.style.transition = "opacity 250ms, transform 250ms";
            cardEl.style.opacity = "0";
            cardEl.style.transform = "scale(0.95)";

            setTimeout(() => {
                savedListings = savedListings.filter(l => l.id !== listingId);
                el("listingsTitle").textContent = `Saved listings · ${savedListings.length}`;

                if (savedListings.length === 0) {
                    // Go back to album view which will show empty state
                    el("listingsView").hidden = true;
                    el("albumGrid").hidden = false;
                    el("pageSub").hidden = false;
                    document.querySelector(".page-title").hidden = false;
                    renderAlbums();
                } else {
                    renderListings();
                }
            }, 260);

        } catch {
            if (window.showToast) showToast("Failed to unsave.", "error");
        }
    }

    // ── Boot ────────────────────────────────────────────────────
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();