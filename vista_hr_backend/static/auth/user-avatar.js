/**
 * avatar-validator.js
 * Loads face-api.js models from CDN and exposes a single async function:
 *   validateFaceInImage(file) → Promise<{ valid: boolean, reason: string }>
 *
 * Usage (in account-settings.js):
 *   const { valid, reason } = await validateFaceInImage(file);
 *   if (!valid) { showToast(reason, "error"); return; }
 *
 * Models used:
 *   - tinyFaceDetector  (fastest, ~190 KB, no landmark dependency)
 *
 * CDN: jsDelivr (free, no API key, no rate limit for static assets)
 */

const AvatarValidator = (() => {
    const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model";
    let _modelsLoaded = false;
    let _loading = false;
    let _loadPromise = null;

    /**
     * Loads the TinyFaceDetector model once.
     * Subsequent calls return immediately (already loaded).
     */
    async function _loadModels() {
        if (_modelsLoaded) return;
        if (_loading) return _loadPromise;

        _loading = true;
        _loadPromise = (async () => {
            // face-api.js must be loaded as a script tag before this file.
            // account-settings.html already adds it via CDN.
            if (typeof faceapi === "undefined") {
                throw new Error("face-api.js is not loaded. Check script tags.");
            }
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            _modelsLoaded = true;
        })();

        try {
            await _loadPromise;
        } finally {
            _loading = false;
        }
    }

    /**
     * Draws a File/Blob into an offscreen HTMLImageElement.
     * @param {File} file
     * @returns {Promise<HTMLImageElement>}
     */
    function _fileToImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image.")); };
            img.src = url;
        });
    }

    /**
     * Validates that the given image file contains at least one human face.
     *
     * @param {File} file  — the image file selected by the user
     * @returns {Promise<{ valid: boolean, reason: string }>}
     *   valid  = true  → face detected, proceed with upload
     *   valid  = false → no face detected, block upload and show reason
     */
    async function validateFaceInImage(file) {
        try {
            await _loadModels();
        } catch {
            // If model fails to load (e.g. offline), fail open — backend will re-validate.
            console.warn("[AvatarValidator] Model load failed — skipping frontend check.");
            return { valid: true, reason: "" };
        }

        let img;
        try {
            img = await _fileToImage(file);
        } catch (e) {
            return { valid: false, reason: "Could not read the selected image." };
        }

        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 320,   // balance speed vs accuracy
            scoreThreshold: 0.5,
        });

        const detections = await faceapi.detectAllFaces(img, options);

        if (!detections || detections.length === 0) {
            return {
                valid: false,
                reason: "No face detected. Please upload a clear photo of yourself.",
            };
        }

        return { valid: true, reason: "" };
    }

    return { validateFaceInImage };
})();