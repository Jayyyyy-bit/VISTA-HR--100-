// steps/step8_details.js
window.Step8Init = function Step8Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const titleEl = document.getElementById("listingTitle");
    const descEl = document.getElementById("listingDesc");
    const titleCount = document.getElementById("titleCount");
    const descCount = document.getElementById("descCount");
    const pvTitle = document.getElementById("pvTitle");
    const pvDesc = document.getElementById("pvDesc");

    const TITLE_MAX = 50;
    const DESC_MAX = 500;

    // ✅ HARD requirements (for enabling Finish)
    // Keep these light so you can finish the wizard.
    const MIN_TITLE_HARD = 3;
    const MIN_DESC_HARD = 10;

    // ✅ Soft quality suggestions (won't block Finish)
    const MIN_TITLE_SOFT = 10;
    const MIN_DESC_SOFT = 40;

    if (!titleEl || !descEl) return;

    function readDetails() {
        const d = ListingStore.readDraft();
        const details = d.details || {};
        return {
            title: String(details.title || ""),
            description: String(details.description || "")
        };
    }

    function saveDetails(partial) {
        const d = ListingStore.readDraft();
        const details = d.details || {};
        ListingStore.saveDraft({ details: { ...details, ...partial } });
    }

    function clampToMax() {
        if (titleEl.value.length > TITLE_MAX) titleEl.value = titleEl.value.slice(0, TITLE_MAX);
        if (descEl.value.length > DESC_MAX) descEl.value = descEl.value.slice(0, DESC_MAX);
    }

    function hardValid(title, desc) {
        const t = (title || "").trim();
        const p = (desc || "").trim();
        return (t.length >= MIN_TITLE_HARD) && (p.length >= MIN_DESC_HARD);
    }

    function getSoftWarnings(title, desc) {
        const t = (title || "").trim();
        const p = (desc || "").trim();
        const warns = [];
        if (t.length && t.length < MIN_TITLE_SOFT) warns.push("Make your title a bit longer for better search results.");
        if (p.length && p.length < MIN_DESC_SOFT) warns.push("Add more details so guests know what to expect.");
        return warns;
    }

    function paint() {
        clampToMax();

        const title = titleEl.value || "";
        const desc = descEl.value || "";

        if (titleCount) titleCount.textContent = String(title.length);
        if (descCount) descCount.textContent = String(desc.length);

        if (pvTitle) pvTitle.textContent = title.trim() || "—";
        if (pvDesc) pvDesc.textContent = desc.trim() || "—";

        // ✅ Enable Finish using HARD rules only
        if (nextBtn) nextBtn.disabled = !hardValid(title, desc);

        const softWarns = getSoftWarnings(title, desc);

        SidePanel.setTips({
            selectedLabel: "Details",
            tips: [
                "Title idea: Place type + city + key feature (e.g., “Studio in Makati w/ Wi-Fi”).",
                "Describe what guests get + what's included (Wi-Fi, aircon, etc.).",
                "Avoid claims you can’t show in photos.",
                ...softWarns
            ]
        });
        SidePanel.refresh();
    }

    // initial fill
    const { title, description } = readDetails();
    titleEl.value = title.slice(0, TITLE_MAX);
    descEl.value = description.slice(0, DESC_MAX);

    // debounced save
    let tTimer = null;
    function debouncedSave() {
        clearTimeout(tTimer);
        tTimer = setTimeout(() => {
            saveDetails({
                title: titleEl.value.trim(),
                description: descEl.value.trim()
            });
        }, 120);
    }

    titleEl.addEventListener("input", () => { paint(); debouncedSave(); });
    descEl.addEventListener("input", () => { paint(); debouncedSave(); });

    paint();
};
