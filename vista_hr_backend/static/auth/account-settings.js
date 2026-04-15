/* auth/account-settings.js */

/* ── Inline face validator — loads face-api lazily on demand ── */
const _FaceValidator = (() => {
    const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js";
    const MODEL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";
    let _state = "idle"; // idle | loading | ready | failed
    let _promise = null;

    function _loadScript() {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${CDN}"]`)) {
                // Already in DOM — wait for faceapi global
                const check = setInterval(() => {
                    if (window.faceapi) { clearInterval(check); resolve(); }
                }, 100);
                setTimeout(() => { clearInterval(check); reject(new Error("Timeout")); }, 10000);
                return;
            }
            const s = document.createElement("script");
            s.src = CDN;
            s.onload = resolve;
            s.onerror = () => reject(new Error("face-api.js failed to load"));
            document.head.appendChild(s);
        });
    }

    async function _init() {
        if (_state === "ready") return;
        if (_state === "loading") return _promise;
        _state = "loading";
        _promise = (async () => {
            await _loadScript();
            await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL);
            _state = "ready";
        })();
        try { await _promise; }
        catch (e) { _state = "failed"; throw e; }
    }

    function _fileToImg(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); res(img); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Cannot read image")); };
            img.src = url;
        });
    }

    function _brightness(data) {
        let t = 0;
        for (let i = 0; i < data.length; i += 4)
            t += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        return t / (data.length / 4);
    }

    function _blur(data, w, h) {
        const g = new Float32Array(w * h);
        for (let i = 0; i < g.length; i++)
            g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        const l = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                l[i] = g[(y - 1) * w + x] + g[(y + 1) * w + x] + g[y * w + (x - 1)] + g[y * w + (x + 1)] - 4 * g[i];
            }
        let m = 0; for (const v of l) m += v; m /= l.length;
        let v = 0; for (const val of l) v += (val - m) ** 2;
        return v / l.length;
    }

    async function validate(file) {
        // Canvas heuristics first (no network needed)
        const img = await _fileToImg(file);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 200;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 200, 200);
        const px = ctx.getImageData(0, 0, 200, 200);

        const bright = _brightness(px.data);
        if (bright < 40) return { valid: false, reason: "Photo is too dark. Please use a well-lit photo." };
        if (bright > 230) return { valid: false, reason: "Photo is overexposed. Please use a clearer photo." };

        const blur = _blur(px.data, 200, 200);
        if (blur < 60) return { valid: false, reason: "Photo is too blurry. Please use a sharper photo." };

        // Load face-api (lazy — only if heuristics pass)
        try { await _init(); }
        catch { return { valid: false, reason: "Face check unavailable. Check your connection and retry." }; }

        const opts = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 });
        const dets = await window.faceapi.detectAllFaces(img, opts);

        if (!dets || dets.length === 0)
            return { valid: false, reason: "No face detected. Please upload a clear photo of yourself." };

        if (dets.length > 1)
            return { valid: false, reason: "Multiple faces detected. Please upload a photo of only yourself." };

        const faceRatio = dets[0].box.width / (img.naturalWidth || img.width);
        if (faceRatio < 0.10)
            return { valid: false, reason: "Face is too small or far away. Please take a closer selfie-style photo." };

        return { valid: true, reason: "" };
    }

    // Expose warm() so boot can pre-load model silently
    async function warm() {
        try { await _init(); } catch { /* silent */ }
    }

    return { validate, warm };
})();

/* ── Document image validator (brightness + blur only, no face check) ── */
const _DocValidator = (() => {
    const BRIGHTNESS_MIN = 40;
    const BRIGHTNESS_MAX = 230;
    const BLUR_MIN = 40;  // slightly looser than avatar — docs can be flatter

    function _fileToImg(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); res(img); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Cannot read image")); };
            img.src = url;
        });
    }

    function _pixelData(img, size = 200) {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        return ctx.getImageData(0, 0, size, size);
    }

    function _brightness(data) {
        let t = 0;
        for (let i = 0; i < data.length; i += 4)
            t += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        return t / (data.length / 4);
    }

    function _blur(data, w, h) {
        const g = new Float32Array(w * h);
        for (let i = 0; i < g.length; i++)
            g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        const l = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                l[i] = g[(y - 1) * w + x] + g[(y + 1) * w + x] + g[y * w + (x - 1)] + g[y * w + (x + 1)] - 4 * g[i];
            }
        let m = 0; for (const v of l) m += v; m /= l.length;
        let v = 0; for (const val of l) v += (val - m) ** 2;
        return v / l.length;
    }

    async function validate(file, label) {
        let img;
        try { img = await _fileToImg(file); }
        catch { return { valid: false, reason: `Could not read the ${label} image.` }; }

        const px = _pixelData(img);
        const bright = _brightness(px.data);
        if (bright < BRIGHTNESS_MIN)
            return { valid: false, reason: `${label}: Photo is too dark. Please use a well-lit photo.` };
        if (bright > BRIGHTNESS_MAX)
            return { valid: false, reason: `${label}: Photo is overexposed. Please retake in better lighting.` };

        const blur = _blur(px.data, 200, 200);
        if (blur < BLUR_MIN)
            return { valid: false, reason: `${label}: Photo is too blurry. Please upload a sharper, clearer image.` };

        return { valid: true, reason: "" };
    }

    return { validate };
})();

function _warmFaceApi() { _FaceValidator.warm(); }

(() => {
    const API = "/api";
    const MAX_FILE = 5 * 1024 * 1024;

    let currentUser = null;
    const uploads = { studentId: null, cor: null, kycFront: null, kycBack: null, kycSelfie: null };

    function el(id) { return document.getElementById(id); }

    // ── Safe localStorage wrapper (blocks in some privacy modes) ──
    const store = {
        get(key) { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, val) { try { localStorage.setItem(key, val); } catch { } },
    };

    // ── Sidebar navigation ──────────────────────────────────────
    function navigateTo(section) {
        if (!section) return;
        document.querySelectorAll(".sidebarNavItem").forEach(b => b.classList.remove("active"));
        const btn = document.querySelector(`.sidebarNavItem[data-section="${section}"]`);
        if (btn) btn.classList.add("active");
        document.querySelectorAll(".settingsPanel").forEach(p => p.classList.remove("active"));
        const panel = el(`panel-${section}`);
        if (panel) panel.classList.add("active");
        if (window.lucide?.createIcons) lucide.createIcons();
        // Update hash so URL reflects current section
        history.replaceState(null, "", `#${section}`);
    }

    document.querySelectorAll(".sidebarNavItem").forEach(btn => {
        btn.addEventListener("click", () => navigateTo(btn.dataset.section));
    });

    // ── Hash-based deep link on load ─────────────────────────────
    // Allows toast CTAs from the dashboard to land on the right section.
    // e.g. /auth/account-settings.html#verification → opens KYC panel
    //      /auth/account-settings.html#email        → opens email panel
    (function checkHash() {
        const hash = location.hash.replace(/^#/, "").trim();
        const valid = ["profile", "security", "verification"];
        // "email" deep-link still works — redirects into the verification panel
        const resolved = hash === "email" ? "verification" : hash;
        if (resolved && valid.includes(resolved)) {
            setTimeout(() => navigateTo(resolved), 80);
        }
    })();

    // ── Back button ─────────────────────────────────────────────
    el("backBtn")?.addEventListener("click", () => {
        const ref = document.referrer;
        if (ref && !ref.includes("account-settings")) {
            history.back();
        } else if (currentUser?.role === "OWNER") {
            location.href = "/Property-Owner/dashboard/property-owner-dashboard.html";
        } else if (currentUser?.role === "RESIDENT") {
            location.href = "/Resident/resident_home.html";
        } else {
            location.href = "/auth/login.html";
        }
    });



    // ── Boot — runs after DOM is ready ──────────────────────────
    async function init() {
        // Fetch current user directly — don't rely on AuthGuard being present
        // (defer load order isn't guaranteed across browsers)
        let user = null;
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (res.status === 401 || res.status === 403) {
                location.href = "/auth/login.html";
                return;
            }
            const data = await res.json().catch(() => ({}));
            user = data?.user || null;
        } catch {
            location.href = "/auth/login.html";
            return;
        }

        if (!user) { location.href = "/auth/login.html"; return; }

        currentUser = user;

        // Keep local cache in sync if AuthGuard is available
        if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user });

        fillProfile(user);
        showVerificationSection(user);
        showEmailVerificationState(user);

        // Show verification badge if action is needed
        if (
            (user.role === "OWNER" && user.kyc_status === "REJECTED") ||
            (user.role === "RESIDENT" && user.student_status === "REJECTED")
        ) {
            el("verifBadge").hidden = false;
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    (async function loadCitySuggestions() {
        try {
            const res = await fetch(`${API}/locations/cities`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const cities = data.cities || [];
            const datalist = document.getElementById("citySuggestions");
            if (!datalist || !cities.length) return;
            datalist.innerHTML = cities
                .map(c => `<option value="${c}">`)
                .join("");
        } catch {
            // Non-fatal — field still works as plain text input
        }
    })();

    // ── Fill profile ────────────────────────────────────────────
    function fillProfile(user) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
        const init = (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase();
        const roleLabel = { OWNER: "Property Owner", RESIDENT: "Resident", ADMIN: "Admin" };

        if (el("emailChangeSection")) el("emailChangeSection").hidden = true;

        // ── Text fields (name, role labels) ──────────────────────────
        if (el("sidebarUserName")) el("sidebarUserName").textContent = name;
        if (el("sidebarUserRole")) el("sidebarUserRole").textContent = roleLabel[user.role] || user.role;
        if (el("avatarName")) el("avatarName").textContent = name;
        if (el("avatarRole")) el("avatarRole").textContent = roleLabel[user.role] || user.role;

        // ── Avatar rendering — single source of truth ─────────────────
        // Always set initials text on both elements (hidden or not)
        if (el("avatarCircle")) el("avatarCircle").textContent = init;
        if (el("sidebarAvatar")) el("sidebarAvatar").textContent = init;

        // Now decide photo vs initials
        const avatarImg = el("avatarImg");
        const avatarCircle = el("avatarCircle");
        const sidebarImg = el("sidebarAvatarImg");
        const sidebarCircle = el("sidebarAvatar");
        const avatarRemoveBtn = el("avatarRemoveBtn");

        const uploadBtn = el("avatarUploadBtn");
        if (user.avatar_url) {
            // Main profile circle
            if (avatarImg) { avatarImg.src = user.avatar_url; avatarImg.hidden = false; }
            if (avatarCircle) { avatarCircle.hidden = true; }
            // Sidebar circle
            if (sidebarImg) { sidebarImg.src = user.avatar_url; sidebarImg.hidden = false; }
            if (sidebarCircle) { sidebarCircle.hidden = true; }
            if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
            // Update button label
            if (uploadBtn) uploadBtn.innerHTML = `<i data-lucide="camera"></i> Change photo`;
        } else {
            // Show initials, hide photos
            if (avatarImg) { avatarImg.hidden = true; avatarImg.src = ""; }
            if (avatarCircle) { avatarCircle.hidden = false; }
            if (sidebarImg) { sidebarImg.hidden = true; sidebarImg.src = ""; }
            if (sidebarCircle) { sidebarCircle.hidden = false; }
            if (avatarRemoveBtn) avatarRemoveBtn.hidden = true;
            // Reset button label
            if (uploadBtn) uploadBtn.innerHTML = `<i data-lucide="camera"></i> Upload photo`;
        }

        // Status badges in avatar row
        const badgesEl = el("avatarBadges");
        if (badgesEl) {
            const badges = [];
            if (user.email_verified)
                badges.push(`<span class="statusPill statusPill--verified"><i data-lucide="mail-check"></i>Email verified</span>`);
            else
                badges.push(`<span class="statusPill statusPill--unverified"><i data-lucide="mail-warning"></i>Email unverified</span>`);
            if (user.role === "OWNER") {
                const kyc = user.kyc_status || "NONE";
                if (kyc === "APPROVED")
                    badges.push(`<span class="statusPill statusPill--verified"><i data-lucide="shield-check"></i>KYC verified</span>`);
                else if (kyc === "PENDING")
                    badges.push(`<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>KYC pending</span>`);
            }
            if (user.role === "RESIDENT" && user.student_verified)
                badges.push(`<span class="statusPill statusPill--student"><i data-lucide="graduation-cap"></i>Student verified</span>`);
            badgesEl.innerHTML = badges.join("");
            if (window.lucide?.createIcons) lucide.createIcons();
        }

        if (el("inputFirstName")) el("inputFirstName").value = user.first_name || "";
        if (el("inputLastName")) el("inputLastName").value = user.last_name || "";
        if (el("inputEmail")) el("inputEmail").value = user.email || "";
        if (el("inputPhone")) el("inputPhone").value = user.phone || "";
        if (el("inputBasedIn")) el("inputBasedIn").value = user.based_in || "";

        // Phone lock: OWNER with KYC PENDING or APPROVED
        const phoneInput = el("inputPhone");
        const phoneLockNote = el("phoneLockNote");
        if (phoneInput && user.role === "OWNER" && ["PENDING", "APPROVED"].includes(user.kyc_status)) {
            phoneInput.disabled = true;
            phoneInput.classList.add("fieldInput--locked");
            if (phoneLockNote) phoneLockNote.hidden = false;
        } else if (phoneInput) {
            phoneInput.disabled = false;
            phoneInput.classList.remove("fieldInput--locked");
            if (phoneLockNote) phoneLockNote.hidden = true;
        }

        // Last login display (Security panel)
        if (el("lastLoginAt") && user.last_login_at) {
            const d = new Date(user.last_login_at);
            el("lastLoginAt").textContent = d.toLocaleString("en-PH", {
                dateStyle: "medium", timeStyle: "short"
            });
        }

        // ── Right panel population ──────────────────────────────


        // Account status pill
        const rpStatusPill = el("rpStatusPill");
        if (rpStatusPill) {
            if (user.is_suspended) {
                rpStatusPill.className = "statusPill statusPill--unverified";
                rpStatusPill.innerHTML = `<i data-lucide="ban"></i>Suspended`;
            } else {
                rpStatusPill.className = "statusPill statusPill--verified";
                rpStatusPill.innerHTML = `<i data-lucide="circle-check"></i>Active`;
            }
        }

        if (el("rpRole")) el("rpRole").textContent = roleLabel[user.role] || user.role;

        if (el("rpMemberSince") && user.created_at) {
            const d = new Date(user.created_at);
            el("rpMemberSince").textContent = d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        }

        if (el("rpLastLogin")) {
            if (user.last_login_at) {
                const d = new Date(user.last_login_at);
                el("rpLastLogin").textContent = d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
            } else {
                el("rpLastLogin").textContent = "—";
            }
        }

        // Strikes — show only if > 0
        const strikes = parseInt(user.strike_count || 0);
        const rpStrikeRow = el("rpStrikeRow");
        if (rpStrikeRow) {
            rpStrikeRow.hidden = strikes === 0;
            if (el("rpStrikes")) el("rpStrikes").textContent = `${strikes} / 5`;
        }

        // Verification rows
        const rpVerifRows = el("rpVerifRows");
        if (rpVerifRows) {
            const emailPill = user.email_verified
                ? `<span class="statusPill statusPill--verified"><i data-lucide="mail-check"></i>Verified</span>`
                : `<span class="statusPill statusPill--unverified"><i data-lucide="mail-warning"></i>Unverified</span>`;

            let verifRow2 = "";
            if (user.role === "OWNER") {
                const kyc = user.kyc_status || "NONE";
                const kycPill = kyc === "APPROVED"
                    ? `<span class="statusPill statusPill--verified"><i data-lucide="shield-check"></i>Approved</span>`
                    : kyc === "PENDING"
                        ? `<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>Pending</span>`
                        : kyc === "REJECTED"
                            ? `<span class="statusPill statusPill--unverified"><i data-lucide="x-circle"></i>Rejected</span>`
                            : `<span class="statusPill" style="background:rgba(3,3,3,0.05);color:var(--muted);">Not started</span>`;
                verifRow2 = `<div class="rpRow"><span class="rpKey">Identity (KYC)</span>${kycPill}</div>`;
            } else if (user.role === "RESIDENT") {
                const stu = user.student_status || "NONE";
                const stuPill = stu === "APPROVED"
                    ? `<span class="statusPill statusPill--student"><i data-lucide="graduation-cap"></i>Approved</span>`
                    : stu === "PENDING"
                        ? `<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>Pending</span>`
                        : stu === "REJECTED"
                            ? `<span class="statusPill statusPill--unverified"><i data-lucide="x-circle"></i>Rejected</span>`
                            : `<span class="statusPill" style="background:rgba(3,3,3,0.05);color:var(--muted);">Not started</span>`;
                verifRow2 = `<div class="rpRow"><span class="rpKey">Student status</span>${stuPill}</div>`;
            }

            rpVerifRows.innerHTML = `<div class="rpRow"><span class="rpKey">Email</span>${emailPill}</div>${verifRow2}`;
        }

        // Verif link label
        if (el("rpVerifLinkLabel")) {
            el("rpVerifLinkLabel").textContent = user.role === "OWNER" ? "Check KYC status" : "Verify student status";
        }

        // Tip text
        if (el("rpTipText")) {
            el("rpTipText").innerHTML = user.role === "OWNER"
                ? "<strong>Tip:</strong> Complete your KYC to publish listings to all residents."
                : "<strong>Tip:</strong> Verified students get exclusive discounts on eligible listings.";
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Brand link — navigates to dashboard based on role ───────
    el("brandLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentUser?.role === "OWNER") {
            location.href = "/Property-Owner/dashboard/property-owner-dashboard.html";
        } else if (currentUser?.role === "RESIDENT") {
            location.href = "/Resident/resident_home.html";
        } else {
            location.href = "/auth/login.html";
        }
    });

    // ── Right panel quick action buttons ────────────────────────
    el("rpGoSecurity")?.addEventListener("click", () => {
        document.querySelector('.sidebarNavItem[data-section="security"]')?.click();
    });
    el("rpGoVerification")?.addEventListener("click", () => {
        document.querySelector('.sidebarNavItem[data-section="verification"]')?.click();
    });
    el("rpGoLogoutAll")?.addEventListener("click", () => {
        el("logoutAllBtn")?.click();
    });

    // ── Email change toggle ─────────────────────────────────────
    // Only show the OTP + new-email fields when "Change email" is clicked
    el("changeEmailBtn")?.addEventListener("click", async () => {
        const section = el("emailChangeSection");
        if (!section) return;
        const isHidden = section.hidden;
        section.hidden = !isHidden;
        if (isHidden) {
            // Send OTP automatically when opening
            try {
                await fetch(`${API}/auth/send-otp`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: currentUser.email }),
                });
            } catch { /* non-fatal */ }
            el("inputNewEmail")?.focus();
        }
    });

    // ── Phone number validation (numbers only, PH format) ───────
    el("inputPhone")?.addEventListener("input", () => {
        const input = el("inputPhone");
        // Strip non-numeric except leading +
        let val = input.value;
        const hasPlus = val.startsWith("+");
        val = val.replace(/[^0-9]/g, "");
        if (hasPlus) val = "+" + val;
        input.value = val;

        const errEl = el("errPhone");
        if (!errEl) return;
        const digits = val.replace(/\D/g, "");
        if (digits.length > 0 && (digits.length < 10 || digits.length > 12)) {
            errEl.textContent = "Phone number must be 10–12 digits (e.g. +639XXXXXXXXX)";
        } else {
            errEl.textContent = "";
        }
    });

    // ── Avatar upload ───────────────────────────────────────────
    el("avatarUploadBtn")?.addEventListener("click", () => el("avatarFileInput")?.click());

    // Pre-load face-api models lazily in background after page settles
    setTimeout(() => _warmFaceApi(), 1500);

    // ── Crop modal engine ───────────────────────────────────────
    const cropState = {
        img: null,          // HTMLImageElement of the raw file
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        dragStart: null,    // { x, y, ox, oy }
        lastPinchDist: null,
        canvasSize: 320,    // logical size — canvas is square
        outputSize: 400,    // exported px (square, cropped to circle)
    };

    function openCropModal(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            cropState.img = img;

            // Reset to fit
            const cs = cropState.canvasSize;
            const scale = Math.max(cs / img.naturalWidth, cs / img.naturalHeight);
            cropState.scale = scale;
            cropState.offsetX = (cs - img.naturalWidth * scale) / 2;
            cropState.offsetY = (cs - img.naturalHeight * scale) / 2;

            const slider = el("cropZoomSlider");
            if (slider) { slider.min = scale; slider.max = scale * 4; slider.value = scale; }

            drawCrop();
            el("cropOverlay").hidden = false;
            if (window.lucide?.createIcons) lucide.createIcons();
        };
        img.onerror = () => { showToast?.("Could not load image.", "error"); };
        img.src = url;
    }

    function drawCrop() {
        const canvas = el("cropCanvas");
        if (!canvas || !cropState.img) return;
        const cs = cropState.canvasSize;
        canvas.width = cs;
        canvas.height = cs;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, cs, cs);
        ctx.drawImage(
            cropState.img,
            cropState.offsetX,
            cropState.offsetY,
            cropState.img.naturalWidth * cropState.scale,
            cropState.img.naturalHeight * cropState.scale,
        );
    }

    function clampOffset() {
        const { img, scale, canvasSize: cs } = cropState;
        if (!img) return;
        const iw = img.naturalWidth * scale;
        const ih = img.naturalHeight * scale;
        // Ensure image always covers the stage
        cropState.offsetX = Math.min(0, Math.max(cs - iw, cropState.offsetX));
        cropState.offsetY = Math.min(0, Math.max(cs - ih, cropState.offsetY));
    }

    // ── Drag ────────────────────────────────────────────────
    const stage = el("cropStage");

    stage?.addEventListener("mousedown", e => {
        e.preventDefault();
        cropState.dragStart = { x: e.clientX, y: e.clientY, ox: cropState.offsetX, oy: cropState.offsetY };
    });
    window.addEventListener("mousemove", e => {
        if (!cropState.dragStart) return;
        const dx = e.clientX - cropState.dragStart.x;
        const dy = e.clientY - cropState.dragStart.y;
        const rect = stage.getBoundingClientRect();
        const ratio = cropState.canvasSize / rect.width;
        cropState.offsetX = cropState.dragStart.ox + dx * ratio;
        cropState.offsetY = cropState.dragStart.oy + dy * ratio;
        clampOffset();
        drawCrop();
    });
    window.addEventListener("mouseup", () => { cropState.dragStart = null; });

    // ── Touch drag + pinch ──────────────────────────────────
    stage?.addEventListener("touchstart", e => {
        if (e.touches.length === 1) {
            const t = e.touches[0];
            cropState.dragStart = { x: t.clientX, y: t.clientY, ox: cropState.offsetX, oy: cropState.offsetY };
            cropState.lastPinchDist = null;
        } else if (e.touches.length === 2) {
            cropState.lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
        }
    }, { passive: true });

    stage?.addEventListener("touchmove", e => {
        e.preventDefault();
        if (e.touches.length === 1 && cropState.dragStart) {
            const t = e.touches[0];
            const dx = t.clientX - cropState.dragStart.x;
            const dy = t.clientY - cropState.dragStart.y;
            const rect = stage.getBoundingClientRect();
            const ratio = cropState.canvasSize / rect.width;
            cropState.offsetX = cropState.dragStart.ox + dx * ratio;
            cropState.offsetY = cropState.dragStart.oy + dy * ratio;
            clampOffset();
            drawCrop();
        } else if (e.touches.length === 2 && cropState.lastPinchDist !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            const delta = dist - cropState.lastPinchDist;
            cropState.lastPinchDist = dist;
            applyZoomDelta(delta * 0.005);
        }
    }, { passive: false });

    stage?.addEventListener("touchend", () => {
        cropState.dragStart = null;
        cropState.lastPinchDist = null;
    });

    // ── Scroll zoom ─────────────────────────────────────────
    stage?.addEventListener("wheel", e => {
        e.preventDefault();
        applyZoomDelta(-e.deltaY * 0.001);
    }, { passive: false });

    function applyZoomDelta(delta) {
        const slider = el("cropZoomSlider");
        const minScale = parseFloat(slider?.min || 1);
        const maxScale = parseFloat(slider?.max || 3);
        const cs = cropState.canvasSize;
        const cx = cs / 2, cy = cs / 2;

        const oldScale = cropState.scale;
        const newScale = Math.min(maxScale, Math.max(minScale, oldScale + delta * oldScale));
        const ratio = newScale / oldScale;

        // Zoom toward canvas centre
        cropState.offsetX = cx - (cx - cropState.offsetX) * ratio;
        cropState.offsetY = cy - (cy - cropState.offsetY) * ratio;
        cropState.scale = newScale;
        clampOffset();
        drawCrop();

        if (slider) slider.value = newScale;
    }

    // ── Zoom slider ─────────────────────────────────────────
    el("cropZoomSlider")?.addEventListener("input", () => {
        const slider = el("cropZoomSlider");
        const newScale = parseFloat(slider.value);
        const cs = cropState.canvasSize;
        const cx = cs / 2, cy = cs / 2;
        const ratio = newScale / cropState.scale;
        cropState.offsetX = cx - (cx - cropState.offsetX) * ratio;
        cropState.offsetY = cy - (cy - cropState.offsetY) * ratio;
        cropState.scale = newScale;
        clampOffset();
        drawCrop();
    });

    // ── Close modal ─────────────────────────────────────────
    function closeCropModal() {
        el("cropOverlay").hidden = true;
        cropState.img = null;
    }
    el("cropModalClose")?.addEventListener("click", closeCropModal);
    el("cropCancelBtn")?.addEventListener("click", closeCropModal);
    el("cropOverlay")?.addEventListener("click", e => {
        if (e.target === el("cropOverlay")) closeCropModal();
    });

    // ── Export cropped circle as Blob ────────────────────────
    function exportCroppedBlob() {
        return new Promise(resolve => {
            const out = cropState.outputSize;
            const tmpCanvas = document.createElement("canvas");
            tmpCanvas.width = out;
            tmpCanvas.height = out;
            const ctx = tmpCanvas.getContext("2d");

            // Clip to circle
            ctx.beginPath();
            ctx.arc(out / 2, out / 2, out / 2, 0, Math.PI * 2);
            ctx.clip();

            // Scale cropState coords from canvasSize → outputSize
            const ratio = out / cropState.canvasSize;
            ctx.drawImage(
                cropState.img,
                cropState.offsetX * ratio,
                cropState.offsetY * ratio,
                cropState.img.naturalWidth * cropState.scale * ratio,
                cropState.img.naturalHeight * cropState.scale * ratio,
            );

            tmpCanvas.toBlob(blob => resolve(blob), "image/jpeg", 0.92);
        });
    }

    // ── File input → open crop modal ────────────────────────
    el("avatarFileInput")?.addEventListener("change", async () => {
        const file = el("avatarFileInput").files?.[0];
        if (!file) return;
        el("avatarFileInput").value = "";

        if (!file.type.startsWith("image/")) {
            showToast?.("Only image files accepted.", "error");
            return;
        }
        if (file.size > MAX_FILE) {
            showToast?.("Image too large. Max 5 MB.", "error");
            return;
        }

        openCropModal(file);
    });

    // ── Apply & Upload (from crop modal) ────────────────────
    el("cropApplyBtn")?.addEventListener("click", async () => {
        const btn = el("cropApplyBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        // Capture clean state BEFORE any spinner changes
        const resetApplyBtn = () => {
            btn.disabled = false;
            if (label) { label.hidden = false; }
            if (spinner) { spinner.hidden = true; }
        };
        btn.disabled = true;
        if (label) label.hidden = true;
        if (spinner) spinner.hidden = false;

        try {
            // 1) Export cropped blob
            const croppedBlob = await exportCroppedBlob();
            const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });

            // 2) Face validation — validate on original image, NOT the circular crop
            // Circular clip makes corners black which confuses face-api
            if (label) { label.textContent = "Checking photo…"; label.hidden = false; }
            if (spinner) spinner.hidden = false;

            // Export a RECTANGULAR version of the crop for validation
            const rectBlob = await new Promise(res => {
                const rc = document.createElement("canvas");
                const out = cropState.outputSize;
                rc.width = rc.height = out;
                const rctx = rc.getContext("2d");
                const ratio = out / cropState.canvasSize;
                rctx.drawImage(
                    cropState.img,
                    cropState.offsetX * ratio,
                    cropState.offsetY * ratio,
                    cropState.img.naturalWidth * cropState.scale * ratio,
                    cropState.img.naturalHeight * cropState.scale * ratio,
                );
                rc.toBlob(b => res(b), "image/jpeg", 0.92);
            });
            const rectFile = new File([rectBlob], "validate.jpg", { type: "image/jpeg" });

            let faceDetected = false;
            try {
                const { valid, reason } = await _FaceValidator.validate(rectFile);
                faceDetected = valid;
                if (!valid) {
                    resetApplyBtn();
                    if (label) label.textContent = "Apply & upload";
                    if (window.showError) showError(reason);
                    else if (window.showToast) showToast(reason, "error");
                    return;
                }
            } catch (e) {
                resetApplyBtn();
                if (label) label.textContent = "Apply & upload";
                if (window.showError) showError("Photo check failed. Please retry.");
                return;
            }

            closeCropModal();

            // Show uploading state on the Upload button with step progress
            const uploadBtn = el("avatarUploadBtn");
            const origLabel = uploadBtn.innerHTML;
            const setUploadStep = (msg) => {
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = `<i data-lucide="loader-2" style="animation:spin 1s linear infinite"></i> ${msg}`;
                if (window.lucide?.createIcons) lucide.createIcons();
            };
            setUploadStep("Preparing…");

            // 3) Get Cloudinary signature
            setUploadStep("Signing upload…");
            const sigRes = await fetch(`${API}/uploads/sign`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: "vista_hr/avatars" }),
            });
            const sig = await sigRes.json().catch(() => ({}));
            if (!sigRes.ok) throw new Error(sig.error || "Signature failed.");

            // 4) Upload cropped blob directly to Cloudinary
            setUploadStep("Uploading to cloud…");
            const fd = new FormData();
            fd.append("file", croppedFile);
            fd.append("api_key", sig.apiKey);
            fd.append("timestamp", sig.timestamp);
            fd.append("signature", sig.signature);
            fd.append("folder", sig.folder);

            const upRes = await fetch(
                `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
                { method: "POST", body: fd }
            );
            const upData = await upRes.json().catch(() => ({}));
            if (!upRes.ok) throw new Error(upData.error?.message || "Upload failed.");

            const avatarUrl = upData.secure_url;

            // 5) Save URL to backend
            setUploadStep("Saving…");
            const saveRes = await fetch(`${API}/users/me/avatar`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar_url: avatarUrl, face_detected: faceDetected }),
            });
            const saveData = await saveRes.json().catch(() => ({}));
            if (!saveRes.ok) throw new Error(saveData.error || "Failed to save avatar.");

            // 6) Update UI
            currentUser = saveData.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            if (window.lucide?.createIcons) lucide.createIcons();
            showToast?.("Profile photo updated!", "success");

            uploadBtn.disabled = false;
            uploadBtn.innerHTML = origLabel;
            if (window.lucide?.createIcons) lucide.createIcons();

        } catch (err) {
            showMsg("saveMsg", err.message, true);
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Avatar remove ───────────────────────────────────────────
    el("avatarRemoveBtn")?.addEventListener("click", async () => {
        const btn = el("avatarRemoveBtn");
        btn.disabled = true;

        try {
            const res = await fetch(`${API}/users/me/avatar`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar_url: null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to remove avatar.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            if (window.lucide?.createIcons) lucide.createIcons();

        } catch (err) {
            showMsg("saveMsg", err.message, true);
        } finally {
            btn.disabled = false;
        }
    });

    // ── Save profile ────────────────────────────────────────────
    el("saveProfileBtn")?.addEventListener("click", async () => {
        const btn = el("saveProfileBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");

        const first = el("inputFirstName").value.trim();
        const last = el("inputLastName").value.trim();
        const phone = el("inputPhone").value.trim() || null;
        const basedIn = el("inputBasedIn") ? (el("inputBasedIn").value.trim() || null) : null;

        if (!first && !last) {
            showMsg("saveMsg", "Please enter at least your first or last name.", true);
            return;
        }

        // Phone validation: numbers only (with optional leading +), 10-12 digits
        if (phone) {
            const digits = phone.replace(/\D/g, "");
            if (digits.length < 10 || digits.length > 12) {
                const errEl = el("errPhone");
                if (errEl) errEl.textContent = "Phone number must be 10–12 digits (e.g. +639XXXXXXXXX)";
                return;
            }
        }

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            const res = await fetch(`${API}/users/me/profile`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: first, last_name: last, phone, based_in: basedIn }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to save.");
            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            showMsg("saveMsg", "Changes saved!", false);
        } catch (err) {
            showMsg("saveMsg", err.message, true);
        } finally {
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Password toggles ────────────────────────────────────────
    document.querySelectorAll(".pwToggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = el(btn.dataset.target);
            if (!input) return;
            const isText = input.type === "text";
            input.type = isText ? "password" : "text";
            btn.innerHTML = isText ? `<i data-lucide="eye"></i>` : `<i data-lucide="eye-off"></i>`;
            if (window.lucide?.createIcons) lucide.createIcons();
        });
    });

    // ── Password strength ───────────────────────────────────────
    el("inputNewPw")?.addEventListener("input", () => {
        const val = el("inputNewPw").value;
        const wrap = el("pwStrengthWrap");
        const fill = el("pwStrengthFill");
        const lbl = el("pwStrengthLabel");
        if (!val) { wrap.hidden = true; return; }
        wrap.hidden = false;

        let score = 0;
        if (val.length >= 8) score++;
        if (val.length >= 12) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { pct: "20%", color: "#ef4444", label: "Weak" },
            { pct: "40%", color: "#f97316", label: "Fair" },
            { pct: "60%", color: "#eab308", label: "Okay" },
            { pct: "80%", color: "#22c55e", label: "Good" },
            { pct: "100%", color: "#15803d", label: "Strong" },
        ];
        const lvl = levels[Math.max(0, Math.min(score - 1, 4))];
        fill.style.width = lvl.pct;
        fill.style.background = lvl.color;
        lbl.textContent = lvl.label;
        lbl.style.color = lvl.color;
    });

    // ── Change password ─────────────────────────────────────────
    el("changePasswordBtn")?.addEventListener("click", async () => {
        const btn = el("changePasswordBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");

        ["errCurrentPw", "errNewPw", "errConfirmPw"].forEach(id => { el(id).textContent = ""; });
        el("pwSaveMsg").hidden = true;

        const current = el("inputCurrentPw").value;
        const newPw = el("inputNewPw").value;
        const confirm = el("inputConfirmPw").value;

        let hasErr = false;
        if (!current) { el("errCurrentPw").textContent = "Current password is required."; hasErr = true; }
        if (!newPw) { el("errNewPw").textContent = "New password is required."; hasErr = true; }
        else if (newPw.length < 8) { el("errNewPw").textContent = "At least 8 characters."; hasErr = true; }
        if (newPw && confirm !== newPw) { el("errConfirmPw").textContent = "Passwords do not match."; hasErr = true; }
        if (hasErr) return;

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            const res = await fetch(`${API}/auth/me/password`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: current, new_password: newPw, confirm_password: confirm }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const fields = data.fields || {};
                if (fields.current_password) el("errCurrentPw").textContent = fields.current_password;
                if (fields.new_password) el("errNewPw").textContent = fields.new_password;
                if (fields.confirm_password) el("errConfirmPw").textContent = fields.confirm_password;
                if (!Object.keys(fields).length) throw new Error(data.error || "Failed to update password.");
                return;
            }
            el("inputCurrentPw").value = "";
            el("inputNewPw").value = "";
            el("inputConfirmPw").value = "";
            el("pwStrengthWrap").hidden = true;
            showMsg("pwSaveMsg", "Password updated successfully!", false);
        } catch (err) {
            showMsg("pwSaveMsg", err.message, true);
        } finally {
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Verification section ────────────────────────────────────
    function showVerificationSection(user) {
        if (user.role === "OWNER") {
            // Owner: KYC only — single column layout
            const grid = el("verifCardsGrid");
            if (grid) grid.style.gridTemplateColumns = "1fr";
            el("kycCard").hidden = false;
            const sub = el("kycCardSub");
            if (sub) sub.textContent = "Required to publish listings to all residents";
            // Show owner copy in kycStateNone
            if (el("kycNoneOwner")) el("kycNoneOwner").hidden = false;
            if (el("kycNoneResident")) el("kycNoneResident").hidden = true;
            showKycState(user.kyc_status || "NONE", user.kyc_reject_reason);

        } else if (user.role === "RESIDENT") {
            // Resident: 2-column grid — KYC left, student right
            // Show resident copy in kycStateNone
            if (el("kycNoneOwner")) el("kycNoneOwner").hidden = true;
            if (el("kycNoneResident")) el("kycNoneResident").hidden = false;
            el("kycCard").hidden = false;
            const sub = el("kycCardSub");
            if (sub) sub.textContent = "Required before making a booking";
            showKycState(user.kyc_status || "NONE", user.kyc_reject_reason);

            // Show student card — collapsed by default
            el("studentCard").hidden = false;
            const stu = user.student_status || "NONE";

            // showStudentState handles all visibility — no need to pre-set here
            showStudentState(stu, user.student_reject_reason);

            // Expand button with smooth animation
            el("studentExpandBtn")?.addEventListener("click", () => {
                const toggleRow = el("studentToggleRow");
                const form = el("studentStateForm");
                if (!form) return;

                // Prepare animation
                form.hidden = false;
                form.style.overflow = "hidden";
                form.style.maxHeight = "0";
                form.style.opacity = "0";
                form.style.transition = "max-height 0.35s ease, opacity 0.25s ease";

                // Fade out toggle row
                if (toggleRow) {
                    toggleRow.style.transition = "opacity 0.2s ease";
                    toggleRow.style.opacity = "0";
                    setTimeout(() => { toggleRow.style.display = "none"; }, 200);
                }

                // Animate form open
                requestAnimationFrame(() => {
                    form.style.maxHeight = form.scrollHeight + 500 + "px";
                    form.style.opacity = "1";
                });

                setTimeout(() => {
                    form.style.maxHeight = "none";
                    form.style.overflow = "";
                }, 400);

                setupStudentDropzones();
                if (window.lucide?.createIcons) lucide.createIcons();
            });
        }
        // Admin: show placeholder
        if (user.role === "ADMIN") {
            const ph = el("adminVerifPlaceholder");
            if (ph) ph.hidden = false;
        }
    }

    function showKycState(status, reason) {
        el("kycStateNone").hidden = status !== "NONE";
        el("kycStatePending").hidden = status !== "PENDING";
        el("kycStateApproved").hidden = status !== "APPROVED";
        el("kycStateRejected").hidden = status !== "REJECTED";
        el("kycStateForm").hidden = true;
        if (status === "REJECTED" && reason) el("kycRejectReason").textContent = `Reason: ${reason}`;

        // "Verify my identity" button in NONE state
        el("kycStartBtn")?.addEventListener("click", () => {
            el("kycStateNone").hidden = true;
            el("kycStateForm").hidden = false;
            setupKycDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        // "Re-submit documents" button in REJECTED state
        el("kycResubmitBtn")?.addEventListener("click", () => {
            el("kycStateRejected").hidden = true;
            el("kycStateForm").hidden = false;
            setupKycDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function showStudentState(status, reason) {
        const toggleRow = el("studentToggleRow");
        const form = el("studentStateForm");

        // Upload form: only visible when NONE (collapsed toggle) or actively resubmitting
        // Status banners: PENDING, APPROVED, REJECTED shown separately
        const showForm = status === "NONE" || status === "REJECTED_RESUBMIT";
        if (toggleRow) toggleRow.style.display = (status === "NONE") ? "" : "none";
        if (form) form.hidden = !showForm;

        el("studentStatePending").hidden = status !== "PENDING";
        el("studentStateApproved").hidden = status !== "APPROVED";
        el("studentStateRejected").hidden = !(status === "REJECTED" || status === "REJECTED_RESUBMIT");

        if ((status === "REJECTED" || status === "REJECTED_RESUBMIT") && reason)
            el("studentRejectReason").textContent = `Reason: ${reason}`;

        // Resubmit button — with 15min cooldown check
        el("studentResubmitBtn")?.addEventListener("click", () => {
            const lastSubmit = localStorage.getItem("vista_student_submitted_at");
            if (lastSubmit) {
                const elapsed = (Date.now() - Number(lastSubmit)) / 1000 / 60;
                if (elapsed < 15) {
                    const remaining = Math.ceil(15 - elapsed);
                    openStudentCooldownModal(remaining);
                    return;
                }
            }
            showStudentState("REJECTED_RESUBMIT", reason);
            setupStudentDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        if (status === "NONE") setupStudentDropzones();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Email verification ──────────────────────────────────────
    function showEmailVerificationState(user) {
        const verified = !!user.email_verified;
        el("emailVerifiedState").hidden = !verified;
        el("emailUnverifiedState").hidden = verified;
        if (verified && el("emailVerifiedAddress")) {
            el("emailVerifiedAddress").textContent = user.email;
        } else if (!verified) {
            // email tab removed — surface warning on the Verification nav badge instead
            if (el("verifBadge")) el("verifBadge").hidden = false;
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── OTP send helper (shared by both send + resend buttons) ─────────────
    async function sendOtpCode() {
        const errEl = el("resendErr");
        errEl.hidden = true;
        el("resendMsg").hidden = true;

        const res = await fetch(`${API}/auth/send-otp`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentUser.email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to send code.");
        return data;
    }

    function startResendCooldown() {
        const resendAgainBtn = el("resendOtpAgainBtn");
        const cooldownEl = el("resendCooldown");
        const secsEl = el("cooldownSecs");
        if (!resendAgainBtn || !cooldownEl) return;

        resendAgainBtn.hidden = true;
        cooldownEl.hidden = false;
        let secs = 60;
        secsEl.textContent = secs;
        const t = setInterval(() => {
            secs--;
            secsEl.textContent = secs;
            if (secs <= 0) {
                clearInterval(t);
                cooldownEl.hidden = true;
                resendAgainBtn.hidden = false;
            }
        }, 1000);
    }

    // ── Send code button (Step 1) ────────────────────────────────────────────
    el("resendOtpBtn")?.addEventListener("click", async () => {
        const btn = el("resendOtpBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("resendErr");

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            await sendOtpCode();
            // Transition to Step 2: show OTP input, hide send button
            el("otpSendStep").hidden = true;
            el("otpEnterStep").hidden = false;
            el("otpCodeInput")?.focus();
            showMsg("resendMsg", "Code sent! Check your inbox.", false);
            startResendCooldown();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── OTP input: enable verify button when 6 digits entered ───────────────
    el("otpCodeInput")?.addEventListener("input", () => {
        const val = (el("otpCodeInput").value || "").replace(/\D/g, "").slice(0, 6);
        el("otpCodeInput").value = val;
        if (el("verifyOtpBtn")) el("verifyOtpBtn").disabled = val.length !== 6;
    });

    // ── Verify button (Step 2) ───────────────────────────────────────────────
    el("verifyOtpBtn")?.addEventListener("click", async () => {
        const btn = el("verifyOtpBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("resendErr");
        const otp = (el("otpCodeInput")?.value || "").trim();

        if (otp.length !== 6) return;

        btn.disabled = true; label.hidden = true; spinner.hidden = false;
        errEl.hidden = true;

        try {
            const res = await fetch(`${API}/auth/verify-email`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentUser.email, otp }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Incorrect code. Please try again.");

            // Update local session with fresh user data
            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
                currentUser = data.user;
            }
            // Hide badge + switch to verified state
            if (el("verifBadge") && currentUser.email_verified) el("verifBadge").hidden = true;
            showMsg("resendMsg", "Email verified successfully!", false);
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Resend code (Step 2 — inside OTP entry view) ─────────────────────────
    el("resendOtpAgainBtn")?.addEventListener("click", async () => {
        const errEl = el("resendErr");
        errEl.hidden = true;
        el("resendMsg").hidden = true;
        el("otpCodeInput").value = "";
        if (el("verifyOtpBtn")) el("verifyOtpBtn").disabled = true;

        try {
            await sendOtpCode();
            showMsg("resendMsg", "New code sent!", false);
            startResendCooldown();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
        }
    });

    // ── KYC dropzones ────────────────────────────────────────────
    function setupKycDropzones() {
        setupDropzone("dropKycFront", "inputKycFront", "dropContentKycFront", "previewKycFront", "previewImgKycFront", "removeKycFront", "errKycFront", "kycFront");
        setupDropzone("dropKycBack", "inputKycBack", "dropContentKycBack", "previewKycBack", "previewImgKycBack", "removeKycBack", "errKycBack", "kycBack");
        setupDropzone("dropKycSelfie", "inputKycSelfie", "dropContentKycSelfie", "previewKycSelfie", "previewImgKycSelfie", "removeKycSelfie", "errKycSelfie", "kycSelfie");
        el("submitKycBtn")?.addEventListener("click", handleKycSubmit, { once: true });
    }

    function updateKycBtn() {
        const btn = el("submitKycBtn");
        if (btn) btn.disabled = !uploads.kycFront || !uploads.kycBack;
    }

    async function handleKycSubmit() {
        const btn = el("submitKycBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("kycGlobalErr");

        if (!uploads.kycFront || !uploads.kycBack) return;
        errEl.hidden = true; btn.disabled = true; label.hidden = true; spinner.hidden = false;

        // Validate image quality before uploading
        const frontCheck = await _DocValidator.validate(uploads.kycFront, "ID Front");
        if (!frontCheck.valid) {
            if (window.showError) showError(frontCheck.reason);
            el("errKycFront").textContent = frontCheck.reason;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleKycSubmit, { once: true });
            return;
        }
        const backCheck = await _DocValidator.validate(uploads.kycBack, "ID Back");
        if (!backCheck.valid) {
            if (window.showError) showError(backCheck.reason);
            el("errKycBack").textContent = backCheck.reason;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleKycSubmit, { once: true });
            return;
        }
        if (uploads.kycSelfie) {
            const selfieCheck = await _DocValidator.validate(uploads.kycSelfie, "Selfie");
            if (!selfieCheck.valid) {
                if (window.showError) showError(selfieCheck.reason);
                el("errKycSelfie").textContent = selfieCheck.reason;
                btn.disabled = false; label.hidden = false; spinner.hidden = true;
                btn.addEventListener("click", handleKycSubmit, { once: true });
                return;
            }
        }

        try {
            let frontUrl, backUrl, selfieUrl = null;

            try { frontUrl = await uploadToCloudinary(uploads.kycFront, "vista_hr/kyc"); }
            catch { el("errKycFront").textContent = "ID front upload failed."; throw new Error("upload_failed"); }

            try { backUrl = await uploadToCloudinary(uploads.kycBack, "vista_hr/kyc"); }
            catch { el("errKycBack").textContent = "ID back upload failed."; throw new Error("upload_failed"); }

            if (uploads.kycSelfie) {
                try { selfieUrl = await uploadToCloudinary(uploads.kycSelfie, "vista_hr/kyc"); }
                catch { el("errKycSelfie").textContent = "Selfie upload failed."; throw new Error("upload_failed"); }
            }

            const endpoint = currentUser?.role === "RESIDENT" ? "/resident/kyc/submit" : "/kyc/submit";
            const res = await fetch(`${API}${endpoint}`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_front_url: frontUrl, id_back_url: backUrl, selfie_url: selfieUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Submission failed.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            // Reset KYC upload state
            uploads.kycFront = null; uploads.kycBack = null; uploads.kycSelfie = null;
            el("kycStateForm").hidden = true;
            showKycState("PENDING");
            fillProfile(currentUser);
        } catch (err) {
            if (err.message !== "upload_failed") { errEl.textContent = err.message; errEl.hidden = false; }
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleKycSubmit, { once: true });
        }
    }

    // ── Student dropzones ───────────────────────────────────────
    function setupStudentDropzones() {
        setupDropzone("dropStudentId", "inputStudentId", "dropContentStudentId", "previewStudentId", "previewImgStudentId", "removeStudentId", "errStudentId", "studentId");
        setupDropzone("dropCor", "inputCor", "dropContentCor", "previewCor", "previewImgCor", "removeCor", "errCor", "cor");
        el("submitStudentBtn")?.addEventListener("click", handleStudentSubmit, { once: true });
    }

    function setupDropzone(dropId, inputId, contentId, previewId, imgId, removeId, errId, slot) {
        const drop = el(dropId), input = el(inputId),
            content = el(contentId), preview = el(previewId),
            img = el(imgId), remove = el(removeId),
            errEl = errId ? el(errId) : null;
        if (!drop || !input) return;

        drop.addEventListener("click", e => { if (e.target.closest(".removeBtn")) return; input.click(); });
        drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
        drop.addEventListener("drop", e => {
            e.preventDefault(); drop.classList.remove("dragover");
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f, slot, img, content, preview, drop, errEl);
        });
        input.addEventListener("change", () => {
            const f = input.files?.[0];
            if (f) handleFile(f, slot, img, content, preview, drop, errEl);
            input.value = "";
        });
        remove?.addEventListener("click", e => {
            e.stopPropagation();
            uploads[slot] = null;
            if (preview) preview.hidden = true;
            if (content) content.hidden = false;
            drop.classList.remove("hasFile");
            if (img) img.src = "";
            if (errEl) errEl.textContent = "";
            if (slot.startsWith("kyc")) updateKycBtn();
            else updateStudentBtn();
        });
    }

    function handleFile(file, slot, img, content, preview, drop, errEl) {
        if (errEl) errEl.textContent = "";
        if (!file.type.startsWith("image/")) { if (errEl) errEl.textContent = "Only image files accepted."; return; }
        if (file.size > MAX_FILE) { if (errEl) errEl.textContent = "File too large. Max 5 MB."; return; }
        const reader = new FileReader();
        reader.onload = e => {
            if (img) img.src = e.target.result;
            if (preview) preview.hidden = false;
            if (content) content.hidden = true;
            drop.classList.add("hasFile");
        };
        reader.readAsDataURL(file);
        uploads[slot] = file;
        if (slot.startsWith("kyc")) updateKycBtn();
        else updateStudentBtn();
    }

    function updateStudentBtn() {
        const btn = el("submitStudentBtn");
        if (btn) btn.disabled = !uploads.studentId || !uploads.cor;
    }

    async function getSignature(folder) {
        const res = await fetch(`${API}/uploads/sign`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload signature failed.");
        return data;
    }

    async function uploadToCloudinary(file, folder) {
        const sig = await getSignature(folder);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sig.apiKey);
        fd.append("timestamp", sig.timestamp);
        fd.append("signature", sig.signature);
        fd.append("folder", sig.folder);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: fd });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error?.message || "Upload failed.");
        return out.secure_url;
    }

    // ── Student resubmit cooldown modal ──────────────────────
    function openStudentCooldownModal(minutesLeft) {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;";
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:28px 24px 24px;max-width:340px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;">
                <div style="width:48px;height:48px;border-radius:50%;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;">
                    <i data-lucide="clock" style="width:22px;height:22px;"></i>
                </div>
                <div style="font-size:17px;font-weight:700;">Please wait</div>
                <div style="font-size:13px;color:#6b7280;line-height:1.6;">
                    You can resubmit your student documents in <strong>${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}</strong>.
                </div>
                <button style="margin-top:8px;width:100%;padding:10px 0;border-radius:10px;border:none;background:#1a1a1a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">OK</button>
            </div>`;
        overlay.querySelector("button").addEventListener("click", () => document.body.removeChild(overlay));
        overlay.addEventListener("click", e => { if (e.target === overlay) document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    async function handleStudentSubmit() {
        const btn = el("submitStudentBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("studentGlobalErr");

        if (!uploads.studentId || !uploads.cor) return;
        errEl.hidden = true;

        // Validate image quality before locking the form
        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        const idCheck = await _DocValidator.validate(uploads.studentId, "School ID");
        if (!idCheck.valid) {
            if (window.showError) showError(idCheck.reason);
            el("errStudentId").textContent = idCheck.reason;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleStudentSubmit, { once: true });
            return;
        }
        const corCheck = await _DocValidator.validate(uploads.cor, "Certificate of Registration");
        if (!corCheck.valid) {
            if (window.showError) showError(corCheck.reason);
            el("errCor").textContent = corCheck.reason;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleStudentSubmit, { once: true });
            return;
        }

        // Lock entire form — disable dropzones + remove buttons
        const dropzones = ["dropStudentId", "dropCor"];
        dropzones.forEach(id => {
            const dz = el(id);
            if (dz) {
                dz.style.pointerEvents = "none";
                dz.style.opacity = "0.6";
                const removeBtn = dz.querySelector(".removeBtn");
                if (removeBtn) removeBtn.hidden = true;
            }
        });

        // Show PENDING state immediately — close the form right away
        showStudentState("PENDING");

        // Upload in background
        try {
            let idUrl, corUrl;
            try { idUrl = await uploadToCloudinary(uploads.studentId, "vista_hr/student_docs"); }
            catch { throw new Error("School ID upload failed. Please try again."); }

            try { corUrl = await uploadToCloudinary(uploads.cor, "vista_hr/student_docs"); }
            catch { throw new Error("CoR upload failed. Please try again."); }

            const res = await fetch(`${API}/student/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id_url: idUrl, cor_url: corUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Submission failed.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            // Save timestamp for cooldown tracking
            localStorage.setItem("vista_student_submitted_at", String(Date.now()));
            // Already showing PENDING — just update currentUser
        } catch (err) {
            // Upload failed after form was closed — show error in pending state
            if (window.showError) showError(err.message);
            // Revert to form so user can retry
            showStudentState("NONE");
            // Re-enable dropzones
            dropzones.forEach(id => {
                const dz = el(id);
                if (dz) { dz.style.pointerEvents = ""; dz.style.opacity = ""; }
            });
            // Re-expand form
            const toggleRow = el("studentToggleRow");
            const form = el("studentStateForm");
            if (toggleRow) toggleRow.style.display = "none";
            if (form) { form.hidden = false; }
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleStudentSubmit, { once: true });
        }
    }

    // ── Logout from all devices (modal) ────────────────────────
    el("logoutAllBtn")?.addEventListener("click", () => {
        el("logoutAllOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    });
    el("logoutAllCancelBtn")?.addEventListener("click", () => {
        el("logoutAllOverlay").hidden = true;
    });
    el("logoutAllOverlay")?.addEventListener("click", (e) => {
        if (e.target === el("logoutAllOverlay")) el("logoutAllOverlay").hidden = true;
    });
    el("logoutAllConfirmBtn")?.addEventListener("click", async () => {
        const btn = el("logoutAllConfirmBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
        try {
            const res = await fetch(`${API}/users/me/logout-all`, {
                method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed.");
            sessionStorage.setItem("loadingDest", "/auth/login.html");
            sessionStorage.setItem("loadingMsg", "Logging you out…");
            location.href = "/auth/loading.html";
        } catch (err) {
            el("logoutAllOverlay").hidden = true;
            showMsg("pwSaveMsg", err.message, true);
            btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
        }
    });

    // ── Deactivate account ─────────────────────────────────────
    el("deactivateBtn")?.addEventListener("click", async () => {
        const blockedMsg = el("deactivateBlockedMsg");
        const confirmBtn = el("deactivateConfirmBtn");
        if (blockedMsg) { blockedMsg.hidden = true; blockedMsg.textContent = ""; }
        if (el("deactivateErr")) el("deactivateErr").textContent = "";
        if (el("deactivatePw")) el("deactivatePw").value = "";
        if (confirmBtn) confirmBtn.disabled = false;

        // Check for active bookings that would block deactivation
        try {
            const res = await fetch(`${API}/bookings`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const bookings = data.bookings || [];
                const active = bookings.filter(b =>
                    ["PENDING", "APPROVED", "ACTIVE"].includes(b.status)
                );
                if (active.length > 0) {
                    const counts = {};
                    active.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
                    const parts = [];
                    if (counts.PENDING) parts.push(`${counts.PENDING} pending`);
                    if (counts.APPROVED) parts.push(`${counts.APPROVED} approved`);
                    if (counts.ACTIVE) parts.push(`${counts.ACTIVE} active`);
                    if (blockedMsg) {
                        blockedMsg.innerHTML = `<strong>Cannot deactivate:</strong> You have ${parts.join(", ")} booking(s) that must be resolved first. Please cancel or complete them before deactivating.`;
                        blockedMsg.hidden = false;
                    }
                    if (confirmBtn) confirmBtn.disabled = true;
                }
            }
        } catch { /* non-fatal — allow modal to open, backend will also guard */ }

        el("deactivateOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    });

    el("deactivateCancelBtn")?.addEventListener("click", () => {
        el("deactivateOverlay").hidden = true;
    });
    el("deactivateOverlay")?.addEventListener("click", (e) => {
        if (e.target === el("deactivateOverlay")) el("deactivateOverlay").hidden = true;
    });

    el("deactivateConfirmBtn")?.addEventListener("click", async () => {
        const pw = el("deactivatePw")?.value || "";
        const errEl = el("deactivateErr");
        if (!pw) { errEl.textContent = "Password is required."; return; }

        const btn = el("deactivateConfirmBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
        errEl.textContent = "";

        try {
            // Verify password first
            const verifyRes = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentUser.email, password: pw }),
                credentials: "include",
            });
            if (!verifyRes.ok) {
                errEl.textContent = "Incorrect password.";
                btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
                return;
            }

            // Self-service deactivation (checks for active bookings on backend)
            const res = await fetch(`${API}/users/me/deactivate`, {
                method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to deactivate.");
            sessionStorage.setItem("loadingDest", "/auth/login.html");
            sessionStorage.setItem("loadingMsg", "Account deactivated.");
            location.href = "/auth/loading.html";
        } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
        }
    });

    // ── Util ────────────────────────────────────────────────────
    function showMsg(id, msg, isError) {
        const msgEl = el(id);
        if (!msgEl) return;
        msgEl.textContent = (isError ? "⚠ " : "✓ ") + msg;
        msgEl.className = "saveMsg" + (isError ? " error" : "");
        msgEl.hidden = false;
        setTimeout(() => { msgEl.hidden = true; }, 4000);
    }

})();