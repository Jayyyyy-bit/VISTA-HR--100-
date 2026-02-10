// steps/step3_location.js
console.log("[Step3] init loaded ✅");

window.Step3Init = function Step3Init() {
    const { ListingStore, SidePanel } = window;
    const $ = (id) => document.getElementById(id);

    const els = {
        form: $("locForm"),
        country: $("country"),
        unit: $("unit"),
        building: $("building"),
        street: $("street"),

        barangay: $("barangay"),
        brgySuggest: $("barangaySuggest"),

        // City: hidden native select + custom dropdown UI
        city: $("city"),
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
    };

    // Guard (required)
    if (!els.street || !els.city || !els.province || !els.zip || !els.preview || !els.nextBtn) {
        console.warn("[Step3] Missing required elements");
        return;
    }

    const API_BASE = "http://127.0.0.1:5000/api";
    const norm = (s) => (s || "").toLowerCase().trim();

    // Force province
    els.province.value = "Metro Manila";

    // -----------------------------
    // Helpers
    // -----------------------------
    function clearErrors() {
        [els.streetErr, els.barangayErr, els.cityErr, els.provinceErr, els.zipErr]
            .filter(Boolean)
            .forEach((el) => (el.textContent = ""));

        [els.street, els.barangay, els.zip].filter(Boolean).forEach((el) => el.classList.remove("inputInvalid"));
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
        const draft = ListingStore.readDraft();
        return draft.location || {};
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

        // 🔓 unlock auto-map if address changed
        const addrChanged =
            (prev.street || "") !== nextLoc.street ||
            (prev.barangay || "") !== nextLoc.barangay ||
            (prev.city || "") !== nextLoc.city ||
            (prev.zip || "") !== nextLoc.zip;

        if (addrChanged) {
            nextLoc.precise = false;
            lastQueryKey = ""; // important: allow new geocode
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
                "Drag the pin for a more precise point (optional).",
            ],
        });
        SidePanel.refresh();

        if (geocode) debouncedGeocode();
    }

    // -----------------------------
    // ZIP guard
    // -----------------------------
    function bindZipGuard() {
        els.zip.addEventListener("input", () => {
            const cleaned = els.zip.value.replace(/\D/g, "").slice(0, 4);
            if (els.zip.value !== cleaned) els.zip.value = cleaned;

            if (els.zipErr) {
                els.zipErr.textContent = cleaned.length === 0 || cleaned.length === 4 ? "" : "ZIP must be 4 digits.";
            }
            syncUIAndDraft({ geocode: true });
        });
    }

    // -----------------------------
    // City list + custom dropdown
    // -----------------------------
    async function loadCities() {
        try {
            const res = await fetch(`${API_BASE}/locations/cities`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            const cities = Array.isArray(data?.cities) ? data.cities : [];

            const current = els.city.value;
            els.city.innerHTML =
                `<option value="">Select a city</option>` + cities.map((c) => `<option value="${c}">${c}</option>`).join("");

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
        if (!els.cityDD || !els.cityBtn) return;
        els.cityDD.classList.add("open");
        els.cityBtn.setAttribute("aria-expanded", "true");
    }

    function closeDD() {
        if (!els.cityDD || !els.cityBtn) return;
        els.cityDD.classList.remove("open");
        els.cityBtn.setAttribute("aria-expanded", "false");
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

        // If no actual change, do nothing
        if ((els.city.value || "").trim() === v) {
            closeDD();
            return;
        }

        els.city.value = v;
        updateCityUIFromSelect();

        // Reset barangay when city changes
        if (els.barangay) els.barangay.value = "";
        hideBrgySuggest();

        // Allow geocode again
        lastQueryKey = "";

        // ✅ fire the same flow as native select changes
        els.city.dispatchEvent(new Event("change", { bubbles: true }));

        closeDD();
    }

    function bindCityDropdown() {
        if (!els.cityDD || !els.cityBtn || !els.cityMenu) return;

        els.cityBtn.addEventListener("click", () => {
            els.cityDD.classList.contains("open") ? closeDD() : openDD();
        });

        els.cityMenu.addEventListener("click", (e) => {
            const opt = e.target.closest(".ddOpt");
            if (!opt) return;
            setCity(opt.dataset.value || "");
        });

        document.addEventListener("click", (e) => {
            if (!els.cityDD.contains(e.target)) closeDD();
        });

        // keep UI synced if native select changes (fallback)
        els.city.addEventListener("change", () => updateCityUIFromSelect());
    }

    // -----------------------------
    // Barangay suggestions
    // -----------------------------
    let brgyTimer = null;
    let brgyItems = [];
    let brgyActive = -1;

    function showBrgySuggest() {
        if (!els.brgySuggest) return;
        els.brgySuggest.classList.remove("hidden");
    }

    function hideBrgySuggest() {
        if (!els.brgySuggest) return;
        els.brgySuggest.classList.add("hidden");
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
        const url = `${API_BASE}/locations/barangays?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q || "")}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        return Array.isArray(data?.barangays) ? data.barangays : [];
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
            } catch {
                // silent
            }
        }, 160);
    }

    function selectBarangay(value) {
        if (!els.barangay) return;
        els.barangay.value = value || "";
        hideBrgySuggest();

        lastQueryKey = ""; // allow new geocode even if only barangay changed
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
            if (!Number.isFinite(i)) return;
            selectBarangay(brgyItems[i]);
        });

        els.barangay.addEventListener("keydown", (e) => {
            if (els.brgySuggest.classList.contains("hidden")) return;

            if (e.key === "Escape") return hideBrgySuggest();
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setBrgyActive(Math.min(brgyActive + 1, brgyItems.length - 1));
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setBrgyActive(Math.max(brgyActive - 1, 0));
            }
            if (e.key === "Enter") {
                if (brgyActive >= 0 && brgyActive < brgyItems.length) {
                    e.preventDefault();
                    selectBarangay(brgyItems[brgyActive]);
                }
            }
        });

        els.barangay.addEventListener("blur", () => setTimeout(hideBrgySuggest, 120));
    }

    // -----------------------------
    // Map Preview
    // -----------------------------
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
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        marker = window.L.marker([14.5995, 120.9842], { draggable: true }).addTo(map);

        marker.on("dragend", () => {
            const p = marker.getLatLng();
            const loc = readLocFromUI();
            ListingStore.saveDraft({ location: { ...loc, lat: p.lat, lng: p.lng, precise: true } });
            if (els.mapHint) els.mapHint.textContent = "Pin moved. Saved precise map point.";
            SidePanel.refresh();
        });

        return true;
    }

    function makeQueryKey(loc) {
        return [
            norm(loc.street),
            norm(loc.barangay),
            norm(loc.city),
            norm(loc.zip),
            norm(loc.province),
            norm(loc.country),
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
        console.log("[Step3] geocode url =>", url);

        const res = await fetch(url, { cache: "no-store" });

        // ✅ if backend still returns non-200 sometimes, avoid throw
        const data = await res.json().catch(() => ({}));

        // ✅ handle throttling gracefully
        if (data?.throttled) {
            return { throttled: true };
        }

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

                // --- fallback build ---
                let geocodeLoc = null;

                // 1) Full exact
                if (hasCity && hasStreet && hasZip) {
                    geocodeLoc = loc;
                    if (els.mapHint) els.mapHint.textContent = "Searching exact address…";
                }
                // 2) City + barangay
                else if (hasCity && hasBarangay) {
                    geocodeLoc = { ...loc, street: "", zip: "" };
                    if (els.mapHint) els.mapHint.textContent = "Previewing barangay area…";
                }
                // 3) City only
                else if (hasCity) {
                    geocodeLoc = { ...loc, street: "", barangay: "", zip: "" };
                    if (els.mapHint) els.mapHint.textContent = "Previewing city…";
                } else {
                    if (els.mapHint) els.mapHint.textContent = "Select a city to preview the map.";
                    return;
                }

                // IMPORTANT: key must match what we geocode (not the raw loc)
                const key = makeQueryKey(geocodeLoc);
                if (key === lastQueryKey) return;

                const hit = await geocodeAddress(geocodeLoc);

                if (hit?.throttled) {
                    lastQueryKey = ""; // allow retry
                    if (els.mapHint) els.mapHint.textContent = "Map service busy (throttled). Try again in a moment.";
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

    // -----------------------------
    // Init
    // -----------------------------
    (async function init() {
        await loadCities();
        bindCityDropdown();
        bindZipGuard();
        bindBarangaySuggest();

        paintFromDraft();
        ensureMap();

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
                "Drag the pin for a more precise point (optional).",
            ],
        });
        SidePanel.refresh();
    })();

    // Bind basic inputs
    [els.unit, els.building, els.street].filter(Boolean).forEach((node) => {
        node.addEventListener("input", () => syncUIAndDraft({ geocode: true }));
    });

    if (els.country) els.country.addEventListener("change", () => syncUIAndDraft({ geocode: true }));

    // 🔥 trigger geocode when CITY changes
    if (els.city) {
        els.city.addEventListener("change", () => {
            if (els.barangay) els.barangay.value = "";
            if (els.brgySuggest) els.brgySuggest.classList.add("hidden");
            lastQueryKey = "";
            syncUIAndDraft({ geocode: true });
        });
    }
};
