// steps/step3_location.js
// Location data powered by PSGC API (Philippine Standard Geographic Code)
// Source: https://psgc.gitlab.io/api/ — Official PSA / DICT data, no API key required
// Geocoding powered by Nominatim (OpenStreetMap) — free, no API key required
console.log("[Step3] init loaded ✅");

window.Step3Init = function Step3Init() {
    const { ListingStore, SidePanel } = window;
    const $ = (id) => document.getElementById(id);

    const els = {
        form: $("locForm"),
        country: $("country"),
        unit: $("unit"),
        building: $("building"),
        street: $("street"),           // ← correct ID (was "streetAddress" — bug fixed)

        barangay: $("barangay"),
        brgySuggest: $("barangaySuggest"),

        city: $("city"),             // hidden native select
        cityDD: $("cityDD"),
        cityBtn: $("cityBtn"),
        cityVal: $("cityVal"),
        cityMenu: $("cityMenu"),

        province: $("province"),
        zip: $("zip"),
        preview: $("addrPreview"),
        nextBtn: $("nextBtn"),

        streetErr: $("streetErr"),
        barangayErr: $("barangayErr"),
        cityErr: $("cityErr"),
        provinceErr: $("provinceErr"),
        zipErr: $("zipErr"),

        mapEl: $("osmMap"),
        mapHint: $("mapHint"),

        // Auto-fill toast/indicator (optional — gracefully skipped if absent)
        autofillBadge: $("autofillBadge"),
    };

    if (!els.street || !els.city || !els.province || !els.zip || !els.preview || !els.nextBtn) {
        console.warn("[Step3] Missing required elements");
        return;
    }

    const API_BASE = "http://127.0.0.1:5000/api";
    const norm = (s) => (s || "").toLowerCase().trim();

    // PSGC city code map — populated by loadCities()
    // { "Quezon City": "137404000", ... }
    const cityCodeMap = {};

    // PSGC barangay cache — { cityCode: ["Barangay 1", ...] }
    const psgcBrgyCache = {};

    // Force province to Metro Manila always
    els.province.value = "Metro Manila";

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function clearErrors() {
        [els.streetErr, els.barangayErr, els.cityErr, els.provinceErr, els.zipErr]
            .filter(Boolean)
            .forEach((el) => (el.textContent = ""));
        [els.street, els.barangay, els.zip].filter(Boolean)
            .forEach((el) => el.classList.remove("inputInvalid"));
    }

    function buildAddressLine(loc) {
        return [loc.unit, loc.building, loc.street, loc.barangay, loc.city, loc.province, loc.zip, loc.country]
            .filter(Boolean)
            .join(", ");
    }

    function zipValid(zip) {
        return /^\d{4}$/.test(String(zip || "").trim());
    }

    function isValidForBackend(loc) {
        return !!(loc.street && loc.city && loc.province && zipValid(loc.zip));
    }

    function readLocFromDraft() {
        return ListingStore.readDraft().location || {};
    }

    function readLocFromUI() {
        const prev = readLocFromDraft();
        const nextLoc = {
            lat: prev.lat ?? null,
            lng: prev.lng ?? null,
            precise: !!prev.precise,
            country: (els.country?.value || prev.country || "Philippines").trim() || "Philippines",
            unit: (els.unit?.value || "").trim(),
            building: (els.building?.value || "").trim(),
            street: (els.street?.value || "").trim(),
            barangay: (els.barangay?.value || "").trim(),
            city: (els.city?.value || "").trim(),
            province: "Metro Manila",
            zip: (els.zip?.value || "").trim(),
            addressLine: "",
        };
        nextLoc.addressLine = buildAddressLine(nextLoc);
        return nextLoc;
    }

    function paintFromDraft() {
        const loc = readLocFromDraft();
        if (els.country) els.country.value = loc.country || "Philippines";
        if (els.unit) els.unit.value = loc.unit || "";
        if (els.building) els.building.value = loc.building || "";
        if (els.street) els.street.value = loc.street || "";
        if (els.barangay) els.barangay.value = loc.barangay || "";
        els.city.value = loc.city || "";
        updateCityUIFromSelect();
        els.province.value = "Metro Manila";
        if (els.zip) els.zip.value = loc.zip || "";
        const forced = { ...loc, province: "Metro Manila" };
        els.preview.textContent = forced.addressLine || buildAddressLine(forced) || "—";
        els.nextBtn.disabled = !isValidForBackend(forced);
    }

    function syncUIAndDraft({ geocode = true } = {}) {
        clearErrors();
        const prev = readLocFromDraft();
        const nextLoc = readLocFromUI();

        const addrChanged =
            (prev.street || "") !== nextLoc.street ||
            (prev.barangay || "") !== nextLoc.barangay ||
            (prev.city || "") !== nextLoc.city ||
            (prev.zip || "") !== nextLoc.zip;

        if (addrChanged) {
            nextLoc.precise = false;
            lastQueryKey = "";
        }

        ListingStore.saveDraft({ location: nextLoc });
        els.preview.textContent = nextLoc.addressLine || "—";
        els.nextBtn.disabled = !isValidForBackend(nextLoc);

        SidePanel.setTips({
            selectedLabel: "Location",
            tips: [
                "Choose your city + barangay to improve accuracy.",
                "ZIP must be 4 digits.",
                "Map preview appears when street + city + ZIP are filled.",
                "Drag the pin to auto-fill your address from the map 📍",
            ],
        });
        SidePanel.refresh();

        if (geocode) debouncedGeocode();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-fill toast
    // ─────────────────────────────────────────────────────────────────────────
    function showAutofillToast(msg) {
        // Use autofillBadge if it exists in the HTML, otherwise mapHint
        const el = els.autofillBadge || els.mapHint;
        if (!el) return;
        el.textContent = msg;
        // If it's the badge element, add a fade-out class after 3s
        if (els.autofillBadge) {
            els.autofillBadge.classList.add("visible");
            setTimeout(() => els.autofillBadge.classList.remove("visible"), 3000);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ZIP guard
    // ─────────────────────────────────────────────────────────────────────────
    function bindZipGuard() {
        els.zip.addEventListener("input", () => {
            const cleaned = els.zip.value.replace(/\D/g, "").slice(0, 4);
            if (els.zip.value !== cleaned) els.zip.value = cleaned;
            if (els.zipErr) {
                els.zipErr.textContent =
                    cleaned.length === 0 || cleaned.length === 4 ? "" : "ZIP must be 4 digits.";
            }
            syncUIAndDraft({ geocode: true });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // City dropdown — backed by PSGC via /api/locations/cities
    // ─────────────────────────────────────────────────────────────────────────
    async function loadCities() {
        try {
            // Our backend now proxies PSGC — source="psgc" confirmed in response
            const res = await fetch(`${API_BASE}/locations/cities`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            const cities = Array.isArray(data?.cities) ? data.cities : [];

            // Also fetch raw PSGC to build cityCodeMap for barangay lookups
            try {
                const psgcRes = await fetch(
                    "https://psgc.gitlab.io/api/regions/130000000/cities-municipalities/",
                    { cache: "force-cache" }
                );
                const psgcData = await psgcRes.json();
                if (Array.isArray(psgcData)) {
                    for (const item of psgcData) {
                        // PSGC names are uppercase; title-case to match our display names
                        const titleName = item.name.replace(/\w\S*/g, (w) =>
                            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                        );
                        cityCodeMap[titleName] = item.code;
                    }
                }
            } catch (e) {
                console.warn("[Step3] PSGC city code map failed — barangay lookup will use backend fallback", e);
            }

            const current = els.city.value;
            els.city.innerHTML =
                `<option value="">Select a city</option>` +
                cities.map((c) => `<option value="${c}">${c}</option>`).join("");

            if (current && cities.includes(current)) els.city.value = current;

            if (els.cityMenu) {
                els.cityMenu.innerHTML =
                    `<div class="ddOpt" data-value="">Select a city</div>` +
                    cities.map((c) => `<div class="ddOpt" data-value="${c}">${c}</div>`).join("");
            }

            updateCityUIFromSelect();
            return cities;
        } catch (e) {
            console.warn("[Step3] cities load failed", e);
            return [];
        }
    }

    function openDD() {
        els.cityDD?.classList.add("open");
        els.cityBtn?.setAttribute("aria-expanded", "true");
    }
    function closeDD() {
        els.cityDD?.classList.remove("open");
        els.cityBtn?.setAttribute("aria-expanded", "false");
    }

    function updateCityUIFromSelect() {
        if (!els.cityVal || !els.cityMenu) return;
        const v = (els.city.value || "").trim();
        els.cityVal.textContent = v || "Select a city";
        els.cityMenu.querySelectorAll(".ddOpt").forEach((n) => {
            n.classList.toggle("active", (n.dataset.value || "") === v);
        });
    }

    function setCity(next) {
        const v = (next || "").trim();
        if ((els.city.value || "").trim() === v) { closeDD(); return; }
        els.city.value = v;
        updateCityUIFromSelect();
        if (els.barangay) els.barangay.value = "";
        hideBrgySuggest();
        lastQueryKey = "";
        els.city.dispatchEvent(new Event("change", { bubbles: true }));
        closeDD();
    }

    function bindCityDropdown() {
        if (!els.cityDD || !els.cityBtn || !els.cityMenu) return;
        els.cityBtn.addEventListener("click", () =>
            els.cityDD.classList.contains("open") ? closeDD() : openDD()
        );
        els.cityMenu.addEventListener("click", (e) => {
            const opt = e.target.closest(".ddOpt");
            if (opt) setCity(opt.dataset.value || "");
        });
        document.addEventListener("click", (e) => {
            if (!els.cityDD.contains(e.target)) closeDD();
        });
        els.city.addEventListener("change", () => updateCityUIFromSelect());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Barangay suggestions — PSGC with backend fallback
    // ─────────────────────────────────────────────────────────────────────────
    let brgyTimer = null;
    let brgyItems = [];
    let brgyActive = -1;

    function showBrgySuggest() { els.brgySuggest?.classList.remove("hidden"); }
    function hideBrgySuggest() {
        els.brgySuggest?.classList.add("hidden");
        brgyActive = -1;
    }

    function renderBrgySuggest(items) {
        if (!els.brgySuggest) return;
        brgyItems = items || [];
        brgyActive = -1;

        if (!brgyItems.length) {
            els.brgySuggest.innerHTML = `<div class="suggestEmpty">No matches</div>`;
            showBrgySuggest();
            return;
        }

        els.brgySuggest.innerHTML = brgyItems
            .map((b, i) => `<button type="button" class="suggestItem" data-i="${i}" role="option">${b}</button>`)
            .join("");
        showBrgySuggest();
    }

    function setBrgyActive(i) {
        if (!els.brgySuggest) return;
        const nodes = Array.from(els.brgySuggest.querySelectorAll(".suggestItem"));
        nodes.forEach((n) => n.classList.remove("active"));
        if (i >= 0 && i < nodes.length) {
            nodes[i].classList.add("active");
            brgyActive = i;
            nodes[i].scrollIntoView({ block: "nearest" });
        } else {
            brgyActive = -1;
        }
    }

    async function fetchBarangays(city, q) {
        try {
            const cityCode = cityCodeMap[city];
            if (!cityCode) throw new Error("City code not found: " + city);

            if (!psgcBrgyCache[cityCode]) {
                const res = await fetch(
                    `https://psgc.gitlab.io/api/cities-municipalities/${cityCode}/barangays/`,
                    { cache: "force-cache" }
                );
                if (!res.ok) throw new Error("PSGC barangays error: " + res.status);
                const data = await res.json();
                psgcBrgyCache[cityCode] = data
                    .map((b) => b.name.replace(/\w\S*/g, (w) =>
                        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                    ))
                    .sort((a, b) => a.localeCompare(b));
            }

            const all = psgcBrgyCache[cityCode];
            if (!q?.trim()) return all.slice(0, 30);
            const qLow = q.toLowerCase().trim();
            return all.filter((b) => b.toLowerCase().includes(qLow)).slice(0, 20);

        } catch (e) {
            console.warn("[Step3] PSGC barangays failed — falling back to backend", e);
            try {
                const url = `${API_BASE}/locations/barangays?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q || "")}`;
                const res = await fetch(url, { cache: "no-store" });
                const data = await res.json().catch(() => ({}));
                return Array.isArray(data?.barangays) ? data.barangays : [];
            } catch { return []; }
        }
    }

    function debouncedBarangaySuggest({ force = false } = {}) {
        clearTimeout(brgyTimer);
        brgyTimer = setTimeout(async () => {
            try {
                if (!els.barangay || !els.brgySuggest) return;
                const city = (els.city.value || "").trim();
                if (!city) return hideBrgySuggest();
                const q = (els.barangay.value || "").trim();
                if (!force && q.length < 1) return hideBrgySuggest();
                const items = await fetchBarangays(city, q);
                renderBrgySuggest(items);
            } catch { /* silent */ }
        }, 160);
    }

    function selectBarangay(value) {
        if (!els.barangay) return;
        els.barangay.value = value || "";
        hideBrgySuggest();
        lastQueryKey = "";
        syncUIAndDraft({ geocode: true });
    }

    function bindBarangaySuggest() {
        if (!els.barangay || !els.brgySuggest) return;

        els.barangay.addEventListener("focus", () => debouncedBarangaySuggest({ force: true }));
        els.barangay.addEventListener("input", () => {
            debouncedBarangaySuggest({ force: false });
            lastQueryKey = "";
            syncUIAndDraft({ geocode: true });
        });
        els.brgySuggest.addEventListener("click", (e) => {
            const btn = e.target.closest(".suggestItem");
            if (!btn) return;
            const i = Number(btn.dataset.i);
            if (Number.isFinite(i)) selectBarangay(brgyItems[i]);
        });
        els.barangay.addEventListener("keydown", (e) => {
            if (els.brgySuggest.classList.contains("hidden")) return;
            if (e.key === "Escape") return hideBrgySuggest();
            if (e.key === "ArrowDown") { e.preventDefault(); setBrgyActive(Math.min(brgyActive + 1, brgyItems.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setBrgyActive(Math.max(brgyActive - 1, 0)); }
            if (e.key === "Enter" && brgyActive >= 0 && brgyActive < brgyItems.length) {
                e.preventDefault();
                selectBarangay(brgyItems[brgyActive]);
            }
        });
        els.barangay.addEventListener("blur", () => setTimeout(hideBrgySuggest, 120));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reverse Geocode — Nominatim (pin drag → auto-fill fields)
    // Fixes the original bug: was looking for "streetAddress" ID which doesn't
    // exist. The correct field ID is "street". Also now fills barangay + city.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Given a Nominatim address object, find the best matching NCR city name
     * from our loaded city list (cityCodeMap keys).
     */
    function resolveCity(addr) {
        // Nominatim returns city/town/municipality/suburb in different fields
        const candidates = [
            addr.city, addr.town, addr.municipality,
            addr.county, addr.state_district,
        ].filter(Boolean).map((s) => s.toLowerCase());

        const knownCities = Object.keys(cityCodeMap).map((c) => c.toLowerCase());

        for (const candidate of candidates) {
            // Exact match first
            const exact = knownCities.find((c) => c === candidate);
            if (exact) return Object.keys(cityCodeMap).find((c) => c.toLowerCase() === exact);

            // Partial match (e.g. "quezon" matches "Quezon City")
            const partial = knownCities.find((c) => c.includes(candidate) || candidate.includes(c));
            if (partial) return Object.keys(cityCodeMap).find((c) => c.toLowerCase() === partial);
        }
        return null;
    }

    /**
     * Given a Nominatim address object and a resolved city, find the best
     * matching barangay from our PSGC cache.
     *
     * Strategy: EXACT match only — no partial matching.
     * Nominatim often returns generic fallback names like "Barangay 1",
     * "Poblacion", or "Barangay 1 (Poblacion)" especially in Caloocan.
     * These are NOT real barangay names — OSM placeholders lang.
     * We blacklist them so we never autofill a wrong barangay.
     * Better to fill nothing than to fill the wrong one.
     */
    async function resolveBarangay(addr, city) {
        const cityCode = cityCodeMap[city];
        if (!cityCode) return null;

        if (!psgcBrgyCache[cityCode]) {
            await fetchBarangays(city, ""); // populates the cache
        }

        const barangays = psgcBrgyCache[cityCode] || [];

        // Generic Nominatim fallback names — never trust these as real barangays
        const GENERIC_BLACKLIST = new Set([
            "barangay 1", "barangay 1 (poblacion)", "poblacion",
            "barangay i", "barangay ii", "barangay iii",
            "zone 1", "zone 2", "zone 3", "zone 4", "zone 5",
            "district 1", "district 2", "district 3",
        ]);

        // Nominatim puts barangay in suburb, neighbourhood, village, quarter
        const candidates = [
            addr.suburb, addr.neighbourhood, addr.village, addr.quarter, addr.hamlet,
        ].filter(Boolean).map((s) => s.toLowerCase().trim());

        for (const candidate of candidates) {
            // Skip known generic fallbacks
            if (GENERIC_BLACKLIST.has(candidate)) {
                console.log(`[Step3] Skipping generic barangay from Nominatim: "${candidate}"`);
                continue;
            }

            // Exact match only — prevents "Grace Park" matching both "Grace Park East" and "Grace Park West"
            const exact = barangays.find((b) => b.toLowerCase() === candidate);
            if (exact) return exact;

            // Safe partial: candidate must START WITH the PSGC name (handles trailing "(Poblacion)" suffixes)
            // e.g. Nominatim "Bagong Barrio, Caloocan" -> matches PSGC "Bagong Barrio"
            const startsWithMatch = barangays.find(
                (b) => candidate.startsWith(b.toLowerCase()) && b.toLowerCase().length > 6
            );
            if (startsWithMatch) return startsWithMatch;
        }

        return null; // No confident match — user picks manually via dropdown
    }

    async function reverseGeocodePin(lat, lng) {
        // ── Call Nominatim reverse geocode ──────────────────────────────────
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
            {
                headers: {
                    "Accept-Language": "en-PH,en",
                    "User-Agent": "VISTA-HR/1.0 (capstone project)",
                },
            }
        );
        if (!res.ok) throw new Error("Nominatim reverse geocode failed: " + res.status);
        const data = await res.json();
        if (!data?.address) return;

        const addr = data.address;

        // ── Build street string ──────────────────────────────────────────────
        const streetParts = [
            addr.house_number,
            addr.road || addr.pedestrian || addr.footway || addr.path,
        ].filter(Boolean);
        const street = streetParts.join(" ").trim();

        // ── Resolve city from NCR list ───────────────────────────────────────
        const resolvedCity = resolveCity(addr);

        // ── Resolve barangay from PSGC cache ────────────────────────────────
        const resolvedBarangay = resolvedCity
            ? await resolveBarangay(addr, resolvedCity)
            : null;

        // ── Track what actually got filled ───────────────────────────────────
        const filled = [];

        if (street && els.street) {
            els.street.value = street;
            els.street.dispatchEvent(new Event("input", { bubbles: true }));
            filled.push("street");
        }

        if (resolvedCity) {
            setCity(resolvedCity);
            filled.push("city");
        }

        if (resolvedBarangay && els.barangay) {
            els.barangay.value = resolvedBarangay;
            els.barangay.dispatchEvent(new Event("input", { bubbles: true }));
            filled.push("barangay");
        }

        if (filled.length) {
            const label = filled.join(", ");
            showAutofillToast(`📍 Auto-filled from map pin: ${label}`);
            if (els.mapHint) els.mapHint.textContent = `Pin moved — auto-filled: ${label}`;
        } else {
            if (els.mapHint) els.mapHint.textContent = "Pin moved. Address not recognized — fill manually.";
        }

        // ── Sync draft with new values ───────────────────────────────────────
        syncUIAndDraft({ geocode: false }); // no re-geocode needed — we already have the pin
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Map — Leaflet + OpenStreetMap tiles (free, no API key)
    // ─────────────────────────────────────────────────────────────────────────
    let map = null;
    let marker = null;
    let lastQueryKey = "";
    let geoTimer = null;
    const geoCache = new Map();

    function ensureMap() {
        if (!els.mapEl) return false;
        if (!window.L) {
            if (els.mapHint) els.mapHint.textContent = "Map is unavailable (Leaflet not loaded).";
            return false;
        }
        if (map) return true;

        map = window.L.map(els.mapEl, { zoomControl: true }).setView([14.5995, 120.9842], 11);
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
        }).addTo(map);

        marker = window.L.marker([14.5995, 120.9842], { draggable: true }).addTo(map);

        // ── Pin drag → reverse geocode → auto-fill ──────────────────────────
        marker.on("dragend", async () => {
            const p = marker.getLatLng();

            // Save lat/lng as precise immediately
            const loc = readLocFromUI();
            ListingStore.saveDraft({ location: { ...loc, lat: p.lat, lng: p.lng, precise: true } });

            if (els.mapHint) els.mapHint.textContent = "Looking up address from pin…";

            try {
                await reverseGeocodePin(p.lat, p.lng);
            } catch (e) {
                console.warn("[Step3] reverse geocode failed", e);
                if (els.mapHint) els.mapHint.textContent = "Pin moved. Could not auto-fill address (offline?).";
            }

            SidePanel.refresh();
        });

        return true;
    }

    function makeQueryKey(loc) {
        return [
            norm(loc.street), norm(loc.barangay), norm(loc.city),
            norm(loc.zip), norm(loc.province), norm(loc.country),
        ].join("|");
    }

    async function geocodeAddress(loc) {
        const key = makeQueryKey(loc);
        if (geoCache.has(key)) return geoCache.get(key);

        let q = buildAddressLine(loc);
        const ql = q.toLowerCase();
        if (!norm(loc.street) && !norm(loc.zip)) {
            if (!ql.includes("metro manila")) q += ", Metro Manila";
            if (!ql.includes("philippines")) q += ", Philippines";
        }

        const url = `${API_BASE}/geocode?q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (data?.throttled) return { throttled: true };

        const hit = data?.hit;
        if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return null;

        geoCache.set(key, hit);
        return hit;
    }

    function applyMapPoint(lat, lng, message) {
        if (!ensureMap()) return;
        map.setView([lat, lng], 16, { animate: true });
        marker.setLatLng([lat, lng]);
        setTimeout(() => map.invalidateSize(), 60);
        if (els.mapHint) els.mapHint.textContent = message || "Map updated.";
    }

    function debouncedGeocode() {
        clearTimeout(geoTimer);
        geoTimer = setTimeout(async () => {
            try {
                const loc = readLocFromUI();

                const hasCity = !!loc.city;
                const hasBarangay = !!loc.barangay;
                const hasStreet = (loc.street || "").trim().length >= 3;
                const hasZip = zipValid(loc.zip);

                let geocodeLoc = null;

                if (hasCity && hasStreet && hasZip) {
                    geocodeLoc = loc;
                    if (els.mapHint) els.mapHint.textContent = "Searching exact address…";
                } else if (hasCity && hasBarangay) {
                    geocodeLoc = { ...loc, street: "", zip: "" };
                    if (els.mapHint) els.mapHint.textContent = "Previewing barangay area…";
                } else if (hasCity) {
                    geocodeLoc = { ...loc, street: "", barangay: "", zip: "" };
                    if (els.mapHint) els.mapHint.textContent = "Previewing city…";
                } else {
                    if (els.mapHint) els.mapHint.textContent = "Select a city to preview the map.";
                    return;
                }

                const key = makeQueryKey(geocodeLoc);
                if (key === lastQueryKey) return;

                const hit = await geocodeAddress(geocodeLoc);

                if (hit?.throttled) {
                    lastQueryKey = "";
                    if (els.mapHint) els.mapHint.textContent = "Map service busy. Try again in a moment.";
                    return;
                }
                if (!hit) {
                    lastQueryKey = "";
                    if (els.mapHint) els.mapHint.textContent = "No map preview available for this address.";
                    return;
                }

                lastQueryKey = key;

                const current = readLocFromDraft();
                const userPinned = current?.precise && Number.isFinite(current?.lat) && Number.isFinite(current?.lng);

                applyMapPoint(hit.lat, hit.lng, "Map preview updated.");

                if (!userPinned) {
                    ListingStore.saveDraft({ location: { ...loc, lat: hit.lat, lng: hit.lng, precise: false } });
                }
            } catch (e) {
                console.warn("[Step3] geocode failed", e);
                if (els.mapHint) els.mapHint.textContent = "Map preview failed (offline / blocked).";
            }
        }, 1200);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────────────────
    (async function init() {
        await loadCities();     // builds cityCodeMap + populates dropdown
        bindCityDropdown();
        bindZipGuard();
        bindBarangaySuggest();

        paintFromDraft();
        ensureMap();

        // Leaflet needs a few frames after CSS settles to render correctly
        setTimeout(() => map?.invalidateSize?.(), 100);
        setTimeout(() => map?.invalidateSize?.(), 400);

        const loc = readLocFromDraft();
        if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
            applyMapPoint(loc.lat, loc.lng, loc.precise ? "Loaded saved pin." : "Loaded preview point.");
        } else {
            debouncedGeocode();
        }

        SidePanel.setTips({
            selectedLabel: "Location",
            tips: [
                "Choose your city + barangay to improve accuracy.",
                "ZIP must be 4 digits.",
                "Map preview appears when street + city + ZIP are filled.",
                "Drag the pin to auto-fill your address 📍",
            ],
        });
        SidePanel.refresh();
    })();

    // Input bindings
    [els.unit, els.building, els.street].filter(Boolean).forEach((node) => {
        node.addEventListener("input", () => syncUIAndDraft({ geocode: true }));
    });

    if (els.country) els.country.addEventListener("change", () => syncUIAndDraft({ geocode: true }));

    if (els.city) {
        els.city.addEventListener("change", () => {
            if (els.barangay) els.barangay.value = "";
            if (els.brgySuggest) els.brgySuggest.classList.add("hidden");
            lastQueryKey = "";
            syncUIAndDraft({ geocode: true });
        });
    }
};