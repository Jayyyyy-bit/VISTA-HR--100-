// steps/step10_preview.js — Full listing preview before publish
// ID fixes: aligned to step10_preview.html element IDs

window.Step10Init = function Step10Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const draft = ListingStore.readDraft();

    // ══════════════════════════════════════════════════════════
    //  DATA EXTRACTION
    // ══════════════════════════════════════════════════════════
    const photos = Array.isArray(draft.photos) ? draft.photos : [];
    const loc = draft.location || {};
    const cap = draft.capacity || {};
    const amenities = draft.amenities || {};
    const highlights = Array.isArray(draft.highlights) ? draft.highlights : [];
    const details = draft.details || {};
    const vt = draft.virtualTour || {};
    const placeType = draft.placeType || draft.place_type || "";
    const spaceType = draft.spaceType || draft.space_type || "";

    const title = details.title || draft.title || "Untitled Listing";
    const description = details.description || draft.description || "";
    const rent = cap.monthly_rent || null;
    const discountPct = cap.student_discount_pct || null;
    const guests = Number(cap.guests) || 0;
    const beds = Number(cap.beds) || 0;
    const bedrooms = Number(cap.bedrooms) || 0;
    const bathrooms = Number(cap.bathrooms) || 0;

    // ══════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════
    function formatPeso(amount) {
        if (!amount || isNaN(amount)) return "₱0";
        return "₱" + Number(amount).toLocaleString("en-PH");
    }

    function capitalize(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
    }

    function plural(n, word) {
        return `${n} ${word}${n !== 1 ? "s" : ""}`;
    }

    function $(id) { return document.getElementById(id); }

    // ══════════════════════════════════════════════════════════
    //  PHOTOS — cover + thumbnail strip
    //  HTML IDs: prevCover, prevCoverImg, prevThumbStrip
    // ══════════════════════════════════════════════════════════
    const coverImg = $("prevCoverImg");
    const thumbStrip = $("prevThumbStrip");

    if (photos.length > 0) {
        // Find cover photo first, fall back to first photo
        const sorted = [...photos].sort((a, b) => (b.isCover ? 1 : 0) - (a.isCover ? 1 : 0));
        const coverUrl = sorted[0]?.url || sorted[0] || "";

        if (coverImg) coverImg.src = coverUrl;

        if (thumbStrip) {
            thumbStrip.innerHTML = sorted.map((p, i) => {
                const url = p?.url || p || "";
                return `<img src="${url}" alt="Photo ${i + 1}" class="${i === 0 ? 'active' : ''}"
                    onclick="document.getElementById('prevCoverImg').src='${url}';
                             this.parentElement.querySelectorAll('img').forEach(x=>x.classList.remove('active'));
                             this.classList.add('active');" />`;
            }).join("");
        }
    } else {
        if (coverImg) {
            coverImg.style.display = "none";
            const cover = $("prevCover");
            if (cover) cover.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.9rem;">No photos uploaded yet</div>`;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  360° PANORAMA — HTML IDs: prevPanoWrap, prevPanoViewer
    // ══════════════════════════════════════════════════════════
    const panoWrap = $("prevPanoWrap");
    const panoViewer = $("prevPanoViewer");

    if (vt.enabled && vt.panoUrl && panoWrap && panoViewer) {
        panoWrap.style.display = "block";
        if (typeof pannellum !== "undefined") {
            pannellum.viewer(panoViewer, {
                type: "equirectangular",
                panorama: vt.panoUrl,
                autoLoad: true,
                autoRotate: -2,
                compass: false,
                showZoomCtrl: true,
                showFullscreenCtrl: true,
                mouseZoom: true,
                hfov: 100,
                minHfov: 50,
                maxHfov: 120,
                friction: 0.15,
            });
        }
    }

    // ══════════════════════════════════════════════════════════
    //  TITLE + BADGES + DESCRIPTION
    //  HTML IDs: prevTitle, prevBadges, prevDesc
    // ══════════════════════════════════════════════════════════
    const titleEl = $("prevTitle");
    const badgeEl = $("prevBadges");
    const descEl = $("prevDesc");

    if (titleEl) titleEl.textContent = title;

    if (badgeEl) {
        let html = "";
        if (placeType) html += `<span class="prev-badge">${capitalize(placeType)}</span>`;
        if (spaceType) html += `<span class="prev-badge">${capitalize(spaceType)}</span>`;
        if (vt.enabled && vt.panoUrl) html += `<span class="prev-badge">🔄 360° Tour</span>`;
        badgeEl.innerHTML = html;
    }

    if (descEl) descEl.textContent = description || "No description provided yet.";

    // ══════════════════════════════════════════════════════════
    //  LOCATION — HTML ID: prevLocation
    // ══════════════════════════════════════════════════════════
    const locEl = $("prevLocation");
    if (locEl) {
        const parts = [loc.street, loc.barangay, loc.city, loc.province || "Metro Manila"]
            .filter(Boolean);
        locEl.textContent = parts.join(", ") || "Location not set";
    }

    // ══════════════════════════════════════════════════════════
    //  CAPACITY GRID — HTML ID: prevCapGrid
    // ══════════════════════════════════════════════════════════
    const capGrid = $("prevCapGrid");
    if (capGrid) {
        capGrid.innerHTML = [
            { val: guests, label: plural(guests, "Guest") },
            { val: bedrooms, label: plural(bedrooms, "Bedroom") },
            { val: beds, label: plural(beds, "Bed") },
            { val: bathrooms, label: plural(bathrooms, "Bathroom") },
        ].map(d => `
            <div class="prev-cap-item">
                <div class="prev-cap-num">${d.val}</div>
                <div class="prev-cap-label">${d.label}</div>
            </div>
        `).join("");
    }

    // ══════════════════════════════════════════════════════════
    //  PRICING — HTML ID: prevPricing
    // ══════════════════════════════════════════════════════════
    const pricingEl = $("prevPricing");
    if (pricingEl) {
        if (rent && Number(rent) >= 500) {
            let html = `
                <span class="prev-rent">${formatPeso(rent)}</span>
                <span class="prev-rent-period">/ month</span>`;

            if (discountPct && discountPct >= 1) {
                const discounted = Math.round(Number(rent) * (1 - discountPct / 100));
                html += `
                    <span class="prev-discount-badge">
                        🎓 ${discountPct}% off → ${formatPeso(discounted)}/mo for students
                    </span>`;
            }
            pricingEl.innerHTML = html;
        } else {
            pricingEl.innerHTML = `<span class="prev-no-data">⚠ No price set — complete the Pricing step</span>`;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  AMENITIES — HTML ID: prevAmenities (inside prev-section)
    // ══════════════════════════════════════════════════════════
    const amenEl = $("prevAmenities");
    if (amenEl) {
        const all = [
            ...(amenities.appliances || []),
            ...(amenities.activities || []),
            ...(amenities.safety || []),
        ];
        if (all.length > 0) {
            amenEl.innerHTML = all.map(item => {
                const label = typeof item === "object"
                    ? (item.label || item.name || item.id)
                    : item;
                return `<span class="prev-tag">${label}</span>`;
            }).join("");
        } else {
            amenEl.innerHTML = `<span class="prev-no-data">No amenities selected yet</span>`;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  HIGHLIGHTS — HTML ID: prevHighlights
    // ══════════════════════════════════════════════════════════
    const hlEl = $("prevHighlights");
    if (hlEl) {
        if (highlights.length > 0) {
            hlEl.innerHTML = highlights.map(item => {
                const label = typeof item === "object"
                    ? (item.label || item.name || item.id)
                    : item;
                return `<span class="prev-tag prev-tag--highlight">${label}</span>`;
            }).join("");
        } else {
            hlEl.innerHTML = `<span class="prev-no-data">No highlights selected yet</span>`;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  COMPLETENESS STATUS — HTML ID: prevStatus
    // ══════════════════════════════════════════════════════════
    const statusEl = $("prevStatus");
    if (statusEl) {
        const checks = [
            { label: "Property type", ok: !!placeType },
            { label: "Space type", ok: !!spaceType },
            { label: "Location", ok: !!(loc.street && loc.city && loc.zip) },
            { label: "Capacity", ok: guests >= 1 },
            {
                label: "Amenities", ok: (amenities.appliances?.length || 0) +
                    (amenities.activities?.length || 0) +
                    (amenities.safety?.length || 0) >= 1
            },
            { label: "Highlights", ok: highlights.length >= 1 },
            { label: "Photos (min 5)", ok: photos.length >= 5 },
            {
                label: "Title & description", ok: !!(
                    (details.title || draft.title || "").trim().length >= 3 &&
                    (details.description || draft.description || "").trim().length >= 10
                )
            },
            { label: "Pricing", ok: !!(rent && Number(rent) >= 500) },
        ];

        const allDone = checks.every(c => c.ok);
        const missing = checks.filter(c => !c.ok).map(c => c.label);

        statusEl.className = `prev-status ${allDone ? "prev-status--ok" : "prev-status--warn"}`;

        if (allDone) {
            statusEl.innerHTML = `✅ Your listing is complete and ready to publish!`;
        } else {
            statusEl.innerHTML = `
                📋 <strong>Almost there!</strong> Still missing:
                ${missing.map(m => `<span style="display:inline-block;margin:2px 4px;background:rgba(0,0,0,0.07);padding:2px 8px;border-radius:4px;font-size:0.82rem;">${m}</span>`).join("")}
            `;
        }
    }

    // ══════════════════════════════════════════════════════════
    //  EDIT BUTTONS — data-goto attr wires back to router hash
    // ══════════════════════════════════════════════════════════
    document.querySelectorAll(".prev-edit[data-goto]").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.goto;
            if (target && window.loadStep) window.loadStep(target);
            else location.hash = `#/${target}`;
        });
    });

    // ══════════════════════════════════════════════════════════
    //  FINISH — Step 10 is read-only, Next = Finish → dashboard
    // ══════════════════════════════════════════════════════════
    if (nextBtn) nextBtn.disabled = false;

    SidePanel.setTips({
        selectedLabel: "Preview",
        tips: [
            "This is how residents will see your listing.",
            "Click any Edit button to go back and fix a section.",
            "Click Finish to save and return to your dashboard.",
        ],
    });
    SidePanel.refresh();

    window.lucide?.createIcons?.();
};