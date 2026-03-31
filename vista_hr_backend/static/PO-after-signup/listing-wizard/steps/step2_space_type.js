// steps/step2.js

window.Step2Init = function ({ nextBtn }) {
    const { readDraft, saveDraft, syncStep2 } = window.ListingStore;

    const OPTIONS = [
        { key: "ENTIRE_PLACE", label: "Entire place", icon: "home", desc: "Guests get the whole unit—no shared rooms." },
        { key: "PRIVATE_ROOM", label: "Private room", icon: "door-closed", desc: "Guests have their own bedroom; common areas may be shared." },
        { key: "SHARED_ROOM", label: "Shared room", icon: "users", desc: "Guests share the sleeping area with others." },
    ];

    const TIPS = {
        ENTIRE_PLACE: [
            "Best for renters who want privacy.",
            "Clarify areas included/excluded.",
            "Make photos match included rooms."
        ],
        PRIVATE_ROOM: [
            "List what’s shared (kitchen/bath).",
            "Set clear house rules.",
            "Mention privacy (lock, divider)."
        ],
        SHARED_ROOM: [
            "Be specific about beds & people.",
            "Explain privacy level clearly.",
            "Highlight storage/safety."
        ]
    };

    const grid = document.getElementById("spaceGrid");
    if (!grid) {
        console.error("[Step2] #spaceGrid not found.");
        return;
    }

    const draft = readDraft();
    const selected = draft.spaceType;

    // Render options
    grid.innerHTML = OPTIONS.map(o => {
        const sel = selected === o.key ? "selected" : "";
        return `
      <button class="card card-row ${sel}" type="button" data-key="${o.key}">
        <div class="card-left">
          <div class="label">${o.label}</div>
          <div class="desc">${o.desc}</div>
        </div>
        <i class="card-ic right" data-lucide="${o.icon}"></i>
      </button>
    `;
    }).join("");

    lucide.createIcons();

    // Disable next until selection
    nextBtn.disabled = !selected;

    function applyTips(key) {
        if (!key || !TIPS[key]) {
            window.SidePanel.setTips({ selectedLabel: "—" });
            return;
        }
        const label = OPTIONS.find(o => o.key === key)?.label || "—";
        window.SidePanel.setTips({ selectedLabel: label, tips: TIPS[key] });
    }

    applyTips(selected);
    window.SidePanel.refresh();

    // Handle selection
    grid.querySelectorAll(".card").forEach(btn => {
        btn.addEventListener("click", () => {
            saveDraft({ spaceType: btn.dataset.key });

            grid.querySelectorAll(".card").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");

            nextBtn.disabled = false;

            applyTips(btn.dataset.key);
            window.SidePanel.refresh();
        });
    });

    // ✅ Sync Step 2 to backend on Next

};
