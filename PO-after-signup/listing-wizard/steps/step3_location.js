// steps/step3.js

window.Step3Init = function Step3Init() {
    const { ListingStore, SidePanel } = window;
    const API_BASE = "http://127.0.0.1:5000/api";
    const $ = (id) => document.getElementById(id);

    const els = {
        country: $("country"),
        unit: $("unit"),
        building: $("building"),
        street: $("street"),
        barangay: $("barangay"),
        city: $("city"),
        province: $("province"),
        zip: $("zip"),
        preview: $("addrPreview"),
        nextBtn: $("nextBtn"),
    };

    // Guard (same intent as your original)
    if (!els.street || !els.city || !els.province || !els.zip || !els.preview || !els.nextBtn || !els.barangay) return;

    const METRO_MANILA_CITIES = [
        "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong",
        "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque",
        "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan",
        "Taguig", "Valenzuela"
    ];

    const norm = (s) => (s || "").toLowerCase().trim();

    function buildAddressLine(loc) {
        return [
            loc.unit,
            loc.building,
            loc.street,
            loc.barangay,
            loc.city,
            loc.province,
            loc.zip,
            loc.country,
        ].filter(Boolean).join(", ");
    }

    // ✅ Now includes barangay as required (since you want selection + better data)
    function isValid(loc) {
        return !!(loc.street && loc.city && loc.province && loc.zip && loc.barangay);
    }

    // Force province always
    els.province.value = "Metro Manila";
    try { els.province.readOnly = true; } catch { /* ignore */ }

    // Inject city options once (if select)
    if (els.city.tagName === "SELECT") {
        const existing = els.city.querySelectorAll("option").length;
        if (existing <= 1) {
            els.city.insertAdjacentHTML(
                "beforeend",
                METRO_MANILA_CITIES.map(c => `<option value="${c}">${c}</option>`).join("")
            );
        }
    }

    // -------------------------
    // Barangay searchable suggestions (backend dataset)
    // GET /api/locations/barangays?city=<City>&q=<query>
    // -------------------------
    function ensureSuggestContainer() {
        let wrap = document.getElementById("brgySuggest");
        if (wrap) return wrap;

        wrap = document.createElement("div");
        wrap.id = "brgySuggest";
        wrap.style.position = "relative";

        const dd = document.createElement("div");
        dd.className = "brgySuggestDD";
        dd.style.position = "absolute";
        dd.style.left = "0";
        dd.style.right = "0";
        dd.style.top = "100%";
        dd.style.zIndex = "50";
        dd.style.marginTop = "6px";
        dd.style.borderRadius = "12px";
        dd.style.border = "1px solid rgba(0,0,0,.08)";
        dd.style.background = "#fff";
        dd.style.boxShadow = "0 10px 30px rgba(0,0,0,.08)";
        dd.style.overflow = "hidden";
        dd.style.display = "none";

        wrap.appendChild(dd);

        // insert right after barangay input
        els.barangay.parentElement.insertBefore(wrap, els.barangay.nextSibling);
        return wrap;
    }

    const suggestWrap = ensureSuggestContainer();
    const suggestDD = suggestWrap.querySelector(".brgySuggestDD");

    function closeSuggest() {
        if (!suggestDD) return;
        suggestDD.innerHTML = "";
        suggestDD.style.display = "none";
    }

    function openSuggest() {
        if (!suggestDD) return;
        suggestDD.style.display = "block";
    }

    function renderSuggestions(items) {
        if (!suggestDD) return;

        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            suggestDD.innerHTML = `
                <div style="padding:12px 14px; font-size:14px; opacity:.7;">
                  No matching barangays.
                </div>`;
            openSuggest();
            return;
        }

        suggestDD.innerHTML = list.map((b) => `
            <button type="button" class="brgyItem"
              style="display:block; width:100%; text-align:left; padding:10px 14px; border:0; background:#fff; cursor:pointer;">
              ${b}
            </button>
        `).join("");

        suggestDD.querySelectorAll(".brgyItem").forEach((btn) => {
            btn.addEventListener("click", () => {
                const selected = btn.textContent.trim();
                els.barangay.value = selected;
                closeSuggest();
                syncUIAndDraft();
            });
        });

        openSuggest();
    }

    document.addEventListener("click", (e) => {
        if (!suggestWrap.contains(e.target) && e.target !== els.barangay) closeSuggest();
    });

    els.barangay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSuggest();
    });

    async function fetchBarangays(city, q) {
        if (!city) return [];
        const url = `${API_BASE}/locations/barangays?city=${encodeURIComponent(city)}&q=${encodeURIComponent(q || "")}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json().catch(() => ({}));
        return Array.isArray(data.barangays) ? data.barangays : [];
    }

    let brgyTimer = null;
    async function onBarangayInput() {
        // always save draft while typing
        syncUIAndDraft();

        const city = (els.city?.value || "").trim();
        const q = (els.barangay?.value || "").trim();

        if (!city) {
            closeSuggest();
            return;
        }

        clearTimeout(brgyTimer);
        brgyTimer = setTimeout(async () => {
            if (q.length < 2) {
                closeSuggest();
                return;
            }
            const items = await fetchBarangays(city, q);
            renderSuggestions(items.slice(0, 30));
        }, 250);
    }

    function onCityChange() {
        // clear barangay so it doesn't mismatch
        els.barangay.value = "";
        closeSuggest();
        syncUIAndDraft();
    }

    function paintFromDraft() {
        const draft = ListingStore.readDraft();
        const loc = draft.location || {};

        if (els.country) els.country.value = loc.country || "Philippines";
        if (els.unit) els.unit.value = loc.unit || "";
        if (els.building) els.building.value = loc.building || "";
        if (els.street) els.street.value = loc.street || "";
        if (els.barangay) els.barangay.value = loc.barangay || "";
        if (els.city) els.city.value = loc.city || "";
        els.province.value = "Metro Manila"; // always force
        if (els.zip) els.zip.value = loc.zip || "";

        const forcedLoc = { ...loc, province: "Metro Manila" };
        const line = forcedLoc.addressLine || buildAddressLine(forcedLoc) || "—";
        els.preview.textContent = line;

        els.nextBtn.disabled = !isValid(forcedLoc);
    }

    function readLoc() {
        const draft = ListingStore.readDraft();
        const loc = draft.location || {};

        const nextLoc = {
            lat: loc.lat ?? null,
            lng: loc.lng ?? null,
            precise: !!loc.precise,

            country: (els.country?.value || loc.country || "Philippines").trim() || "Philippines",
            unit: (els.unit?.value || "").trim(),
            building: (els.building?.value || "").trim(),
            street: (els.street?.value || "").trim(),
            barangay: (els.barangay?.value || "").trim(),
            city: (els.city?.value || "").trim(),

            // hard scope
            province: "Metro Manila",

            zip: (els.zip?.value || "").trim(),
            addressLine: "",
        };

        nextLoc.addressLine = buildAddressLine(nextLoc);
        return nextLoc;
    }

    function syncUIAndDraft() {
        const nextLoc = readLoc();
        ListingStore.saveDraft({ location: nextLoc });

        els.preview.textContent = nextLoc.addressLine || "—";
        els.nextBtn.disabled = !isValid(nextLoc);

        SidePanel.setTips({
            selectedLabel: "Location",
            tips: [
                "City selection is limited to Metro Manila (project scope).",
                "Type barangay to see suggestions (filtered by city).",
                "Exact map pin can be added later."
            ]
        });
        SidePanel.refresh();
    }

    // init
    paintFromDraft();

    // bind inputs (keep your original behavior)
    [els.unit, els.building, els.street, els.zip]
        .filter(Boolean)
        .forEach((node) => node.addEventListener("input", () => { closeSuggest(); syncUIAndDraft(); }));

    // city
    if (els.city) els.city.addEventListener("change", onCityChange);

    // barangay (searchable)
    els.barangay.addEventListener("input", onBarangayInput);
    els.barangay.addEventListener("focus", () => {
        const city = (els.city?.value || "").trim();
        const q = (els.barangay?.value || "").trim();
        if (!city || q.length < 2) return;
        onBarangayInput();
    });

    if (els.country) els.country.addEventListener("change", () => { closeSuggest(); syncUIAndDraft(); });

    SidePanel.setTips({
        selectedLabel: "Location",
        tips: [
            "City selection is limited to Metro Manila (project scope).",
            "Type barangay to see suggestions (filtered by city).",
            "Exact map pin can be added on the update."
        ]
    });
    SidePanel.refresh();


};
