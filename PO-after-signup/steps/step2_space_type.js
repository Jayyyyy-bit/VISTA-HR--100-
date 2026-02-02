lucide.createIcons();

/* ===== Draft storage (shared schema) ===== */
const LS_DRAFT_KEY = "vista_listing_draft";

function readDraft() {
    try { return JSON.parse(localStorage.getItem(LS_DRAFT_KEY)) || {}; }
    catch { return {}; }
}
function saveDraft(patch) {
    const draft = readDraft();
    const next = {
        id: draft.id || ("draft-" + Date.now()),
        status: "DRAFT",
        placeType: draft.placeType ?? null,      // Step 1
        spaceType: draft.spaceType ?? null,      // Step 2
        location: draft.location ?? { lat: null, lng: null },
        amenities: draft.amenities ?? [],
        photos: draft.photos ?? [],
        pricing: draft.pricing ?? { nightly: null },
        rules: draft.rules ?? null,
        ...draft,
        ...patch,
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(next));
    return next;
}

/* ===== Progress readiness ===== */
const PROGRESS_SCHEMA = [
    { step: 1, label: "Place type", weight: 15, isDone: d => !!d.placeType },
    { step: 2, label: "Guest space", weight: 15, isDone: d => !!d.spaceType },
    { step: 3, label: "Location", weight: 20, isDone: d => !!d.location?.lat && !!d.location?.lng },
    { step: 4, label: "Photos & amenities", weight: 25, isDone: d => (d.photos?.length >= 5) && (d.amenities?.length >= 1) },
    { step: 5, label: "Pricing & rules", weight: 20, isDone: d => !!d.pricing?.nightly && !!d.rules },
    { step: 6, label: "Review & publish", weight: 5, isDone: _ => false }
];

function computeProgress(draft, opts = { verified: false }) {
    const verified = !!opts.verified;

    const steps = PROGRESS_SCHEMA.map(s => {
        const done = s.step === 6 ? false : !!s.isDone(draft);
        return { ...s, done, locked: false };
    });

    const ready = steps.slice(0, 5).every(s => s.done);
    const publishAllowed = verified && ready;

    const step6 = steps.find(s => s.step === 6);
    step6.locked = !verified;
    step6.done = publishAllowed;

    let percent = 0;
    for (const s of steps) {
        if (s.step === 6) {
            if (publishAllowed) percent += s.weight;
        } else if (s.done) {
            percent += s.weight;
        }
    }

    const nextStep = steps.find(s => !s.done && !s.locked)?.step ?? 6;
    return { percent, steps, nextStep, publishAllowed };
}

/* ===== Step 2 cards ===== */
const SPACE_TYPES = [
    {
        key: "ENTIRE_PLACE",
        label: "Entire place",
        icon: "home",
        desc: "Guests get the whole unit—private entrance, no shared rooms."
    },
    {
        key: "PRIVATE_ROOM",
        label: "Private room",
        icon: "door-closed",
        desc: "Guests have their own bedroom but share common spaces (e.g., kitchen)."
    },
    {
        key: "SHARED_ROOM",
        label: "Shared room",
        icon: "users",
        desc: "Guests sleep in a shared area with others; shared access around the home."
    }
];

const TIPS = {
    ENTIRE_PLACE: [
        "Best for renters who want privacy.",
        "Make sure photos match the exact areas included.",
        "Clarify if any spaces are off-limits."
    ],
    PRIVATE_ROOM: [
        "Say what’s shared: kitchen, bath, living room.",
        "Set clear house rules and quiet hours.",
        "Add privacy details (lock, divider, etc.)."
    ],
    SHARED_ROOM: [
        "Be specific about number of beds/people in the room.",
        "Explain privacy level upfront to avoid complaints.",
        "Highlight safety and storage options."
    ]
};

const spaceGrid = document.getElementById("spaceGrid");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const selectedPill = document.getElementById("selectedPill");
const quickTips = document.getElementById("quickTips");

function renderCards() {
    const draft = readDraft();
    const selected = draft.spaceType;

    spaceGrid.innerHTML = SPACE_TYPES.map(s => {
        const isSel = selected === s.key ? "selected" : "";
        return `
      <button class="card ${isSel}" type="button" data-key="${s.key}">
        <i class="icon" data-lucide="${s.icon}"></i>
        <div class="label">${s.label}</div>
        <div class="desc">${s.desc}</div>
      </button>
    `;
    }).join("");

    lucide.createIcons();

    spaceGrid.querySelectorAll(".card").forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.key;
            saveDraft({ spaceType: key });

            spaceGrid.querySelectorAll(".card").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");

            updateTips(key);
            refreshReadiness();
            nextBtn.disabled = false;
        });
    });

    nextBtn.disabled = !selected;
    updateTips(selected);
}

function updateTips(spaceTypeKey) {
    if (!spaceTypeKey || !TIPS[spaceTypeKey]) {
        selectedPill.textContent = "Selected: —";
        quickTips.innerHTML = `
      <li>Pick what guests can use privately vs shared.</li>
      <li>This affects expectations and search filters.</li>
      <li>You can refine details later.</li>
    `;
        return;
    }
    const label = SPACE_TYPES.find(s => s.key === spaceTypeKey)?.label || "—";
    selectedPill.textContent = `Selected: ${label}`;
    quickTips.innerHTML = TIPS[spaceTypeKey].map(t => `<li>${t}</li>`).join("");
}

function refreshReadiness() {
    const draft = readDraft();
    const verified = false;

    const progress = computeProgress(draft, { verified });
    document.getElementById("percentLabel").textContent = `${progress.percent}%`;
    document.getElementById("progressBar").style.width = `${progress.percent}%`;

    const sideChecklist = document.getElementById("sideChecklist");
    sideChecklist.innerHTML = progress.steps.map(s => {
        const state = s.done ? "done" : s.locked ? "locked" : (s.step === progress.nextStep ? "active" : "");
        const right = s.done ? "Done" : s.locked ? "Locked" : (s.step === progress.nextStep ? "Next" : "Pending");
        return `
      <div class="cl-item ${state}">
        <div class="cl-left">
          <span class="cl-dot"></span>
          <div class="cl-text">
            <div class="cl-t">Step ${s.step}</div>
            <div class="cl-s">${s.label}</div>
          </div>
        </div>
        <div class="cl-state">${right}</div>
      </div>
    `;
    }).join("");
}

function goTo(url) {
    if (window.Transition && typeof window.Transition.go === "function") {
        window.Transition.go(url);
    } else {
        window.location.href = url;
    }
}

/* ===== Nav actions ===== */
backBtn.addEventListener("click", () => {
    // optional: reset Step 2 selection when going back
    const draft = readDraft();
    saveDraft({ ...draft, spaceType: null }); // or saveDraft({ spaceType: null });

    goTo("step1_unit_category.html");
});


nextBtn.addEventListener("click", () => {
    // Step 2 -> Step 3 (placeholder now)
    // Transition.go("step3_location.html");
    alert("Next: Step 3 page (location) — wire later.");
});

document.getElementById("saveExitBtn").addEventListener("click", () => {
    alert("Saved as draft. (Redirect later to dashboard)");
});
document.getElementById("questionsBtn").addEventListener("click", () => {
    alert("FAQ coming soon.");
});

/* ===== Init ===== */
renderCards();
refreshReadiness();
