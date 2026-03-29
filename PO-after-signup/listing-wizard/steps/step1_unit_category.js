window.Step1Init = function ({ nextBtn }) {
    const { readDraft, saveDraft, syncStep1 } = window.ListingStore;

    const PLACE_TYPES = [
        { key: "CONDO", label: "Condominium", icon: "building-2" },
        { key: "APARTMENT", label: "Apartment", icon: "building" },
        { key: "DORM", label: "Dormitory", icon: "bed-double" },
        { key: "BEDSPACE", label: "Bedspace", icon: "bed" },
        { key: "STUDIO", label: "Studio unit", icon: "layout-grid" },
        { key: "HOUSE", label: "House", icon: "home" },
        { key: "TOWNHOUSE", label: "Townhouse", icon: "rows-3" },
        { key: "ROOM", label: "Private room", icon: "door-closed" },
        { key: "GUESTHOUSE", label: "Guesthouse", icon: "hotel" },
    ];

    const GUIDANCE = {
        CONDO: {
            title: "Condominium",
            tips: ["Add building name/tower.", "Mention visitor/ID policy.", "Best photos: living+bed+bath."],
        },
        APARTMENT: {
            title: "Apartment",
            tips: ["Clarify elevator/walk-up.", "Utilities included/excluded.", "Add nearby landmark."],
        },
        DORM: {
            title: "Dormitory",
            tips: ["State curfew/visitor rules.", "Specify bed + locker.", "Highlight shared areas."],
        },
        BEDSPACE: {
            title: "Bedspace",
            tips: ["Beds per room + privacy.", "Include inclusions.", "Add schedule rules."],
        },
        STUDIO: {
            title: "Studio unit",
            tips: ["Show layout clearly.", "Furnished status.", "Wide shot + bathroom."],
        },
        HOUSE: {
            title: "House",
            tips: ["Rooms/floors included.", "Parking availability.", "Neighborhood landmark/safety."],
        },
        TOWNHOUSE: {
            title: "Townhouse",
            tips: ["Floors + stairs.", "Gate/guard/parking.", "Noise rules (shared walls)."],
        },
        ROOM: {
            title: "Private room",
            tips: ["Bathroom private/shared.", "Access to common areas.", "Clear house rules."],
        },
        GUESTHOUSE: {
            title: "Guesthouse",
            tips: ["Caretaker/front desk.", "Check-in/out rules.", "Room+entrance+bath photos."],
        },
    };

    const grid = document.getElementById("typeGrid");
    if (!grid) {
        console.error("[Step1] #typeGrid not found. Step HTML did not load correctly.");
        console.log("[Step1] stepHost HTML:", document.getElementById("stepHost")?.innerHTML?.slice(0, 200));
        return;
    }

    const draft = readDraft();
    const selected = draft.placeType || "";

    grid.innerHTML = PLACE_TYPES.map((t) => {
        const sel = selected === t.key ? "selected" : "";
        return `
      <button class="card ${sel}" type="button" data-key="${t.key}">
        <i class="card-ic" data-lucide="${t.icon}"></i>
        <div class="label">${t.label}</div>
      </button>
    `;
    }).join("");

    window.lucide?.createIcons?.();

    nextBtn.disabled = !selected;

    function applyTips(key) {
        const g = GUIDANCE[key];
        if (!g) {
            window.SidePanel?.setTips?.({ selectedLabel: "—" });
            return;
        }
        window.SidePanel?.setTips?.({ selectedLabel: g.title, tips: g.tips });
    }

    applyTips(selected);
    window.SidePanel?.refresh?.();

    grid.querySelectorAll(".card").forEach((btn) => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.key;
            saveDraft({ placeType: key });

            grid.querySelectorAll(".card").forEach((b) => b.classList.remove("selected"));
            btn.classList.add("selected");

            nextBtn.disabled = false;

            applyTips(key);
            window.SidePanel?.refresh?.();
        });
    });

    // Navigation is handled exclusively by router.js (nextBtn click → syncStep1 → setHash).
    // Step1Init must NOT attach its own onclick or set location.hash — doing so causes
    // a double-fire: router fires syncStep1 + navigates, then this handler fires syncStep1
    // again and navigates again, which jumps the user back to step-2 on every Next click.
    // The only job of StepNInit is: update nextBtn.disabled based on local selection state.
};