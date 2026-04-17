const members = [
    {
        initials: 'M1',
        name: 'MJAY G. CABUG-OS',
        role: 'Project Manager',
        bio: 'Leads the team\'s direction and ensures every feature ships on time.',
        tags: ['Leadership', 'Full-stack', 'Git'],
        photo: 'images/cabug-os.png',
    },
    {
        initials: 'M2',
        name: 'LEOMAR B. DACAYANAN',
        role: 'Business Analyst',
        bio: 'Crafts every screen with intention — balancing aesthetics with usability.',
        tags: ['Requirements', 'Workflows', 'User Stories'],
        photo: 'images/dacayanan.png'
    },
    {
        initials: 'M3',
        name: 'CHRISTIAN E. REPOSO',
        role: 'Backend Developer',
        bio: 'Architects the server infrastructure and keeps data flowing reliably.',
        tags: ['Python', 'Flask', 'Auth'],
        photo: 'images/reposo.png',
    },
    {
        initials: 'M4',
        name: 'ANGELO JOHN N. IGNACIO',
        role: 'Frontend Developer',
        bio: 'Turns designs into pixel-perfect, performant React components.',
        tags: ['HTML', 'CSS', 'REACT JS'],
        photo: 'images/ignacio.png',
    },
    {
        initials: 'M5',
        name: 'KHING CLARENCE G. MAGTALAS',
        role: 'Quality Assurance',
        bio: 'Ensures code quality through rigorous testing and bug reporting.',
        tags: ['Manual Testing', 'Bug Hunting', 'QA'],
        photo: 'images/magtalas.png',
    },
    {
        initials: 'M6',
        name: 'STEVEN GLEINS D. CATARATA',
        role: 'Quality Assurance',
        bio: 'Develops test cases and validates features for a seamless experience.',
        tags: ['Test Cases', 'Automation', 'Unit Testing'],
        photo: 'images/catarata.png',
    },
];

/* ── CAROUSEL SETUP ── */
const PER_SLIDE = 3;
const slides = [];
for (let i = 0; i < members.length; i += PER_SLIDE) {
    slides.push(members.slice(i, i + PER_SLIDE));
}

const track = document.getElementById('track');
const dotsEl = document.getElementById('dots');
const fillEl = document.getElementById('progress-fill');

function makePhotoContent(m) {
    if (m.photo) {
        return `<img src="${m.photo}" alt="Photo of ${m.name}" />`;
    }
    // Placeholder 
    return `
    <div class="avatar-wrap">
      <div class="avatar-head"></div>
      <div class="avatar-body"></div>
    </div>
    <div class="initials-badge">${m.initials}</div>
  `;
}

function makeCard(m) {
    const chips = m.tags.map(t => `<span class="ov-tag">${t}</span>`).join('');
    return `
    <div class="member-card">
      <div class="card-photo">
        ${makePhotoContent(m)}
        <div class="card-hover-overlay">
          <div class="ov-role">${m.role}</div>
          <div class="ov-name">${m.name}</div>
          <div class="ov-bio">${m.bio}</div>
          <div class="ov-tags">${chips}</div>
        </div>
      </div>
      <div class="card-footer-bar">
        <div class="footer-name">${m.name}</div>
        <div class="footer-role">${m.role}</div>
      </div>
    </div>
  `;
}

slides.forEach((sm, si) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    sm.forEach(m => { slide.innerHTML += makeCard(m); });
    track.appendChild(slide);

    const dot = document.createElement('div');
    dot.className = 'dot' + (si === 0 ? ' active' : '');
    dot.onclick = () => goTo(si);
    dotsEl.appendChild(dot);
});

/* ── CAROUSEL LOGIC ── */
let cur = 0, autoTimer;
const DURATION = 4500;

function goTo(idx) {
    cur = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${cur * 100}%)`;
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === cur));
    clearTimeout(autoTimer);
    fillEl.style.transition = 'none';
    fillEl.style.width = '0%';
    setTimeout(() => {
        fillEl.style.transition = `width ${DURATION}ms linear`;
        fillEl.style.width = '100%';
    }, 30);
    autoTimer = setTimeout(() => goTo(cur + 1), DURATION);
}

document.getElementById('btn-prev').onclick = () => goTo(cur - 1);
document.getElementById('btn-next').onclick = () => goTo(cur + 1);
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') goTo(cur - 1);
    if (e.key === 'ArrowRight') goTo(cur + 1);
});

goTo(0);

/* ── ENTRANCE ANIMATIONS ── */
(function initEntrance() {
    const SEQUENCE = [
        { id: 'au1', delay: 0 },
        { id: 'au2', delay: 180 },
        { id: 'au3', delay: 320 },
        { id: 'au4', delay: 420 },
        { id: 'au5', delay: 540 },
        { id: 'au6', delay: 660 },
    ];

    SEQUENCE.forEach(({ id, delay }) => {
        setTimeout(() => {
            document.getElementById(id)?.classList.add('in');
        }, 120 + delay);
    });
})();

/* ── CARD TILT ── */
(function initTilt() {
    document.querySelectorAll('.member-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const r = card.getBoundingClientRect();
            const rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
            const ry = ((e.clientX - r.left) / r.width - 0.5) * 8;
            card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
        });
    });
})();

/* ── STAT COUNTER ── */
(function initCounters() {
    function countUp(el, target, dur = 900) {
        if (!el) return;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / dur, 1);
            el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    setTimeout(() => {
        document.querySelectorAll('.stat-num').forEach(el => {
            const val = parseInt(el.textContent);
            if (!isNaN(val)) countUp(el, val);
        });
    }, 300);
})();