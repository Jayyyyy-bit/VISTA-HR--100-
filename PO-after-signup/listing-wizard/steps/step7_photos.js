// steps/step7.js

window.Step7Init = function Step7Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const uploadZone = document.getElementById("uploadZone");
    const photoInput = document.getElementById("photoInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const thumbGrid = document.getElementById("thumbGrid");
    const photoCountLabel = document.getElementById("photoCountLabel");

    const vtToggle = document.getElementById("vtToggle");
    const vtBody = document.getElementById("vtBody");
    const vtUrl = document.getElementById("vtUrl");

    const MIN_PHOTOS = 5;

    if (!thumbGrid || !photoInput) {
        console.error("[Step7] Missing required elements (#thumbGrid or #photoInput).");
        return;
    }

    const uid = () => "ph_" + Math.random().toString(16).slice(2) + Date.now().toString(16);

    function read() {
        const d = ListingStore.readDraft();
        return {
            photos: Array.isArray(d.photos) ? d.photos : [],
            vt: d.virtualTour || { enabled: false, panoUrl: "" },
        };
    }

    function savePhotos(photos) {
        ListingStore.saveDraft({ photos });
    }

    function saveVT(vt) {
        ListingStore.saveDraft({ virtualTour: vt });
    }

    function ensureCover(photos) {
        if (!photos.length) return photos;
        const hasCover = photos.some((p) => p.isCover);
        if (hasCover) return photos;
        return photos.map((p, i) => ({ ...p, isCover: i === 0 }));
    }

    function setCover(id) {
        const { photos } = read();
        const next = photos.map((p) => ({ ...p, isCover: p.id === id }));
        savePhotos(next);
        render();
    }

    function removePhoto(id) {
        const { photos } = read();
        let next = photos.filter((p) => p.id !== id);
        next = ensureCover(next);
        savePhotos(next);
        render();
    }

    async function filesToPhotos(fileList) {
        const files = Array.from(fileList || []);
        const out = [];

        for (const f of files) {
            if (!f.type.startsWith("image/")) continue;

            const url = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.readAsDataURL(f);
            });

            out.push({ id: uid(), url, name: f.name || "photo", isCover: false });
        }

        return out;
    }

    async function addFiles(fileList) {
        const { photos } = read();
        const added = await filesToPhotos(fileList);
        let next = ensureCover([...photos, ...added]);
        savePhotos(next);
        render();
    }

    function updateNextAndSide() {
        const { photos } = read();
        const count = photos.length;

        if (photoCountLabel) photoCountLabel.textContent = `${count} / ${MIN_PHOTOS} minimum`;
        if (nextBtn) nextBtn.disabled = count < MIN_PHOTOS;

        SidePanel.setTips({
            selectedLabel: "Photos",
            tips: [
                "Use bright photos: living area, sleeping area, bathroom, and entrance.",
                "Set a strong cover photo—this shows in search results.",
                "Add a 360 tour later for extra approval points.",
            ],
        });
        SidePanel.refresh();
    }

    function render() {
        const { photos, vt } = read();

        thumbGrid.innerHTML = photos
            .map((p) => {
                const cover = p.isCover ? `<div class="coverTag">Cover</div>` : "";
                return `
          <div class="thumb">
            ${cover}
            <img src="${p.url}" alt="${p.name}" />
            <div class="thumbBar">
              <button class="tBtn" type="button" data-act="cover" data-id="${p.id}">Set cover</button>
              <button class="tBtn danger" type="button" data-act="remove" data-id="${p.id}">Remove</button>
            </div>
          </div>
        `;
            })
            .join("");

        // bind thumb actions
        thumbGrid.querySelectorAll("[data-act]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const act = btn.dataset.act;
                if (act === "cover") setCover(id);
                if (act === "remove") removePhoto(id);
            });
        });

        // VT UI
        const on = !!vt.enabled;
        if (vtToggle) {
            vtToggle.setAttribute("aria-pressed", on ? "true" : "false");
            vtToggle.classList.toggle("on", on);
        }
        if (vtBody) vtBody.hidden = !on;
        if (vtUrl) vtUrl.value = vt.panoUrl || "";

        if (window.lucide?.createIcons) window.lucide.createIcons();

        updateNextAndSide();
    }

    // Upload behaviors
    if (uploadBtn && photoInput) uploadBtn.addEventListener("click", () => photoInput.click());

    if (uploadZone && photoInput) {
        uploadZone.addEventListener("click", (e) => {
            if (e.target.closest("#uploadBtn")) return;
            photoInput.click();
        });

        uploadZone.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") photoInput.click();
        });

        uploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadZone.classList.add("drag");
        });
        uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag"));
        uploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadZone.classList.remove("drag");
            addFiles(e.dataTransfer.files);
        });
    }

    if (photoInput) {
        photoInput.addEventListener("change", async () => {
            await addFiles(photoInput.files);
            photoInput.value = "";
        });
    }

    // Virtual tour toggle
    if (vtToggle) {
        vtToggle.addEventListener("click", () => {
            const { vt } = read();
            saveVT({ ...vt, enabled: !vt.enabled });
            render();
        });
    }

    if (vtUrl) {
        vtUrl.addEventListener("input", () => {
            const { vt } = read();
            saveVT({ ...vt, panoUrl: vtUrl.value.trim() });
            SidePanel.refresh();
        });
    }

    // normalize cover once
    const d = ListingStore.readDraft();
    if (Array.isArray(d.photos)) ListingStore.saveDraft({ photos: ensureCover(d.photos) });

    // initial render
    render();

    // ✅ Sync Step 7 to backend on Next

};
