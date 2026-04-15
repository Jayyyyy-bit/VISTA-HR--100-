/**
 * avatar-validator.js
 * Validates a profile photo before upload using:
 *   1. Canvas heuristics — brightness, blur (Laplacian variance)
 *   2. face-api.js TinyFaceDetector — face presence + minimum size
 *
 * Usage:
 *   const { valid, reason } = await AvatarValidator.validateFaceInImage(file);
 *   if (!valid) { showError(reason); return; }
 */

const AvatarValidator = (() => {
    const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";
    let _modelsLoaded = false;
    let _loading = false;
    let _loadPromise = null;

    // ── Thresholds (tuned for profile photos) ────────────────
    const BRIGHTNESS_MIN = 40;   // 0–255 — below this = too dark
    const BRIGHTNESS_MAX = 230;  // above this = overexposed / washed out
    const BLUR_MIN = 60;   // Laplacian variance — below this = too blurry
    const FACE_SCORE_MIN = 0.7;  // confidence threshold — stricter than default
    const FACE_SIZE_MIN = 0.10; // face must occupy at least 10% of image width

    // ── Model loader ─────────────────────────────────────────
    async function _loadModels() {
        if (_modelsLoaded) return;
        if (_loading) return _loadPromise;
        _loading = true;
        _loadPromise = (async () => {
            if (typeof faceapi === "undefined") {
                throw new Error("face-api.js not loaded.");
            }
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            _modelsLoaded = true;
        })();
        try { await _loadPromise; } finally { _loading = false; }
    }

    // ── File → HTMLImageElement ──────────────────────────────
    function _fileToImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cannot read image.")); };
            img.src = url;
        });
    }

    // ── Draw image to offscreen canvas → get pixel data ─────
    function _getPixelData(img, size = 200) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        return ctx.getImageData(0, 0, size, size);
    }

    // ── Brightness check (average luminance) ─────────────────
    function _checkBrightness(imageData) {
        const d = imageData.data;
        let total = 0;
        const pixels = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
            // Perceptual luminance
            total += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        return total / pixels;
    }

    // ── Blur check (Laplacian variance) ─────────────────────
    // Converts to grayscale, applies 3x3 Laplacian kernel, computes variance.
    // Low variance = blurry image.
    function _checkBlur(imageData, width, height) {
        const d = imageData.data;

        // Grayscale
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const p = i * 4;
            gray[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        }

        // Laplacian kernel: [0,1,0, 1,-4,1, 0,1,0]
        const lap = new Float32Array(width * height);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                lap[idx] =
                    gray[(y - 1) * width + x] +
                    gray[(y + 1) * width + x] +
                    gray[y * width + (x - 1)] +
                    gray[y * width + (x + 1)] -
                    4 * gray[idx];
            }
        }

        // Variance of Laplacian
        let mean = 0;
        for (let i = 0; i < lap.length; i++) mean += lap[i];
        mean /= lap.length;

        let variance = 0;
        for (let i = 0; i < lap.length; i++) {
            variance += (lap[i] - mean) ** 2;
        }
        return variance / lap.length;
    }

    // ── Main validator ────────────────────────────────────────
    async function validateFaceInImage(file) {
        // Step 1: Read image
        let img;
        try {
            img = await _fileToImage(file);
        } catch {
            return { valid: false, reason: "Could not read the selected image. Please try another file." };
        }

        // Step 2: Canvas heuristics
        const size = 200;
        const imageData = _getPixelData(img, size);

        const brightness = _checkBrightness(imageData);
        if (brightness < BRIGHTNESS_MIN) {
            return { valid: false, reason: "Photo is too dark. Please use a well-lit photo." };
        }
        if (brightness > BRIGHTNESS_MAX) {
            return { valid: false, reason: "Photo is overexposed or too bright. Please use a clearer photo." };
        }

        const blurScore = _checkBlur(imageData, size, size);
        if (blurScore < BLUR_MIN) {
            return { valid: false, reason: "Photo is too blurry. Please use a sharper, clearer photo." };
        }

        // Step 3: Face detection
        try {
            await _loadModels();
        } catch {
            // Model load failed (e.g. offline) — skip ML check, rely on backend
            console.warn("[AvatarValidator] Model load failed — skipping face check.");
            return { valid: true, reason: "" };
        }

        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,          // higher = more accurate (was 320)
            scoreThreshold: FACE_SCORE_MIN,
        });

        const detections = await faceapi.detectAllFaces(img, options);

        if (!detections || detections.length === 0) {
            return {
                valid: false,
                reason: "No face detected. Please upload a clear photo of yourself facing the camera.",
            };
        }

        // Step 4: Minimum face size check
        // Reject if the detected face is tiny relative to image (e.g. background person)
        const imgWidth = img.naturalWidth || img.width;
        const largestFace = detections.reduce((best, d) =>
            d.box.width > best.box.width ? d : best, detections[0]
        );
        const faceRatio = largestFace.box.width / imgWidth;
        if (faceRatio < FACE_SIZE_MIN) {
            return {
                valid: false,
                reason: "Face is too small or far away. Please take a closer selfie-style photo.",
            };
        }

        // Step 5: Only one face (optional — warn if multiple detected)
        if (detections.length > 1) {
            return {
                valid: false,
                reason: "Multiple faces detected. Please upload a photo with only yourself.",
            };
        }

        return { valid: true, reason: "" };
    }

    return { validateFaceInImage };
})();