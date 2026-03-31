// core/dom.js
window.Dom = (() => {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function on(el, evt, fn, opts) {
        if (!el) return;
        el.addEventListener(evt, fn, opts);
    }

    return { $, $$, on };
})();
