// core/store.js
window.ListingStore = (() => {
    const KEY = "vista_listing_draft";

    function readDraft() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
        catch { return {}; }
    }

    function saveDraft(patch) {
        const d = readDraft();

        const defaultLocation = {
            lat: null,
            lng: null,
            country: "Philippines",
            unit: "",
            building: "",
            street: "",
            barangay: "",
            city: "",
            province: "",
            zip: "",
            precise: false,
            addressLine: ""
        };

        const next = {
            id: d.id || ("draft-" + Date.now()),
            status: "DRAFT",

            // Step 1–3
            placeType: d.placeType ?? null,
            spaceType: d.spaceType ?? null,
            location: { ...defaultLocation, ...(d.location || {}) },

            // Future steps (safe defaults)
            capacity: d.capacity ?? { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 },
            amenities: d.amenities ?? { appliances: [], activities: [], safety: [] },
            highlights: d.highlights ?? [],
            photos: d.photos ?? [],
            virtualTour: d.virtualTour ?? { enabled: false, panoUrl: "" },

            verified: d.verified ?? false,

            ...d,
            ...patch,
            updatedAt: new Date().toISOString()
        };

        // If patch has nested location, merge it properly
        if (patch && patch.location) {
            next.location = { ...next.location, ...patch.location };
        }

        localStorage.setItem(KEY, JSON.stringify(next));
        return next;
    }

    function clearDraft() {
        localStorage.removeItem(KEY);
    }

    // ✅ For now: Step 1–3 only (since that’s what you built)
    // Later: expand to Step 4–8 without breaking anything.
    const SCHEMA = [
        { step: 1, label: "Place type", weight: 12, isDone: d => !!d.placeType },
        { step: 2, label: "Guest space", weight: 12, isDone: d => !!d.spaceType },
        {
            step: 3, label: "Location", weight: 16,
            isDone: d => {
                const loc = d.location || {};
                return !!(loc.street && loc.city && loc.province && loc.zip);
            }
        },

        // Future-proof steps (not built yet = will stay Pending)
        {
            step: 4, label: "Capacity", weight: 12,
            isDone: d => {
                const c = d.capacity || {};
                return Number(c.guests) >= 1; // later add stricter rules
            }
        },
        {
            step: 5, label: "Amenities", weight: 12,
            isDone: d => {
                const a = d.amenities || {};
                const count =
                    (a.appliances?.length || 0) +
                    (a.activities?.length || 0) +
                    (a.safety?.length || 0);
                return count > 0;
            }
        },
        {
            step: 6, label: "Highlights", weight: 10,
            isDone: d => (d.highlights?.length || 0) > 0
        },
        {
            step: 7, label: "Photos & virtual tour", weight: 16,
            isDone: d => (d.photos?.length || 0) >= 5 // + virtual tour optional later
        },
        {
            step: 8, label: "Title & description", weight: 10,
            isDone: d => !!d.title && !!d.description
        }
    ];


    function computeProgress(draft) {
        const verified = !!draft?.verified;

        const steps = SCHEMA.map(s => {
            const done = !!s.isDone(draft || {});
            return { ...s, done, locked: false };
        });

        // If later you add step6 publish gate, safe guard remains
        const ready = steps.every(s => s.done);
        const publishAllowed = verified && ready;

        let percent = 0;
        for (const s of steps) {
            if (s.done) percent += s.weight;
        }

        const nextStep = steps.find(s => !s.done && !s.locked)?.step ?? steps[steps.length - 1]?.step ?? 1;

        return { percent, steps, nextStep, publishAllowed };
    }

    return { readDraft, saveDraft, clearDraft, computeProgress };
})();
