window.Step3Init = function Step3Init() {
    const { ListingStore, SidePanel } = window;
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

    // Guard
    if (!els.street || !els.city || !els.province || !els.zip || !els.preview) return;

    const METRO_MANILA_CITIES = [
        "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong",
        "Manila", "Marikina", "Muntinlupa", "Navotas", "Parañaque",
        "Pasay", "Pasig", "Pateros", "Quezon City", "San Juan",
        "Taguig", "Valenzuela"
    ];

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

    function isValid(loc) {
        return !!(loc.street && loc.city && loc.province && loc.zip);
    }

    // Force province always
    els.province.value = "Metro Manila";

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

        if (els.nextBtn) els.nextBtn.disabled = !isValid(forcedLoc);
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

    function sync() {
        const nextLoc = readLoc();
        ListingStore.saveDraft({ location: nextLoc });

        els.preview.textContent = nextLoc.addressLine || "—";
        if (els.nextBtn) els.nextBtn.disabled = !isValid(nextLoc);

        SidePanel.setTips({
            selectedLabel: "Location",
            tips: [
                "City selection is limited to Metro Manila (project scope).",
                "Exact map pin can be added later."
            ]
        });
        SidePanel.refresh();
    }

    // init
    paintFromDraft();

    // bind
    [els.unit, els.building, els.street, els.barangay, els.city, els.zip]
        .filter(Boolean)
        .forEach((node) => node.addEventListener("input", sync));

    if (els.country) els.country.addEventListener("change", sync);

    SidePanel.setTips({
        selectedLabel: "Location",
        tips: [
            "City selection is limited to Metro Manila (project scope).",
            "Exact map pin can be added later."
        ]
    });
    SidePanel.refresh();
};
