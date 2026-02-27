/**
 * Atomic — Student Landing Page (student-kimia-v1)
 *
 * Flow:
 * 1. Fetch plans from API → render pricing cards
 * 2. User clicks plan → register modal opens
 * 3. User submits register → auto login → auto checkout
 * 4. Redirect to Xendit payment page
 */

// ── CONFIG ─────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8080/api';
const UTM_SOURCE = 'student-kimia-v1';
const TARGET_SEGMENT = 'student';

// ── STATE ──────────────────────────────────────────────────────────
let selectedPlan = null;
let authToken = null;

// ── DOM REFS ───────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const pricingGrid = $('#pricing-cards');
const overlay = $('#register-overlay');
const stepRegister = $('#step-register');
const stepLogin = $('#step-login');
const stepCheckout = $('#step-checkout');
const registerForm = $('#register-form');
const loginForm = $('#login-form');
const selectedPlanInfo = $('#selected-plan-info');
const registerError = $('#register-error');
const loginError = $('#login-error');

// ── INIT ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchPlans();
    setupEventListeners();
});

// ── FETCH PLANS ────────────────────────────────────────────────────
async function fetchPlans() {
    try {
        const res = await fetch(`${API_BASE}/plans`);
        const json = await res.json();

        if (!json.data) throw new Error('No plans data');

        // Filter to student segment only
        const plans = json.data.filter(p => p.segment === TARGET_SEGMENT);

        if (plans.length === 0) {
            pricingGrid.innerHTML = '<p style="text-align:center;color:var(--text-muted);grid-column:1/-1">Belum ada paket untuk pelajar.</p>';
            return;
        }

        // Sort by price ascending
        plans.sort((a, b) => a.price_idr - b.price_idr);

        // Find the best value (lowest per-month cost) for "popular" badge
        const withMonthly = plans.map(p => ({
            ...p,
            durationMonths: Math.round(p.duration_days / 30),
            monthlyRate: p.price_idr / Math.round(p.duration_days / 30)
        }));
        const bestValue = withMonthly.reduce((best, p) =>
            p.monthlyRate < best.monthlyRate ? p : best
        );

        renderPricingCards(plans, bestValue.id);
    } catch (err) {
        console.error('Failed to fetch plans:', err);
        pricingGrid.innerHTML = `
            <p style="text-align:center;color:var(--accent-rose);grid-column:1/-1">
                Gagal memuat harga. Pastikan server API berjalan.<br>
                <small style="color:var(--text-muted)">${err.message}</small>
            </p>`;
    }
}

// ── RENDER PRICING CARDS ───────────────────────────────────────────
function renderPricingCards(plans, popularId) {
    pricingGrid.innerHTML = plans.map(plan => {
        const isPopular = plan.id === popularId;
        const months = Math.round(plan.duration_days / 30);
        const monthlyRate = Math.round(plan.price_idr / months);
        const dailyRate = Math.round(plan.price_idr / plan.duration_days);
        const durationLabel = getDurationLabel(months);

        // Anchor pricing: show "original" price (monthly plan × months)
        // Use actual base monthly rate for honest comparison
        const baseMonthly = plans[0].price_idr; // first plan = monthly baseline
        const anchorPrice = baseMonthly * months;
        const discount = months > 1 ? Math.round((1 - plan.price_idr / anchorPrice) * 100) : 0;

        // Coffee comparison — compare MONTHLY price to cafe coffee (~35k/cup)
        const coffeePerMonth = Math.round(plan.price_idr / months / 35000 * 10) / 10;
        const monthlyAnalogy = coffeePerMonth <= 2
            ? `Cuma seharga ${coffeePerMonth <= 1.5 ? '1–2' : '2'} gelas kopi café ☕`
            : `≈ ${Math.ceil(coffeePerMonth)} gelas kopi café per bulan`;

        return `
            <div class="price-card ${isPopular ? 'popular' : ''}">
                <div class="price-label">${durationLabel}</div>
                ${months > 1 ? `<div class="price-original">Rp ${formatNumber(anchorPrice)}</div>` : ''}
                <div class="price-amount">
                    <span class="price-currency">Rp</span>
                    <span class="price-value">${formatNumber(plan.price_idr)}</span>
                </div>
                <div class="price-period">
                    ${months > 1
                ? `Rp ${formatNumber(monthlyRate)}/bulan`
                : `per bulan`}
                </div>
                <div class="price-daily">${monthlyAnalogy}</div>
                ${months > 1
                ? `<div class="price-save">Hemat ${discount}%</div>`
                : '<div style="height:28px"></div>'}
                <ul class="price-features">
                    <li>Akses semua 118 elemen</li>
                    <li>Model atom 3D interaktif</li>
                    <li>Molecule Builder</li>
                    <li>Bilingual ID/EN</li>
                    <li>Akses ${durationLabel.toLowerCase()}</li>
                </ul>
                <button class="btn-plan" onclick="selectPlan('${plan.id}', '${durationLabel}', ${plan.price_idr})">
                    Mulai Belajar
                </button>
            </div>
        `;
    }).join('');
}

// ── SELECT PLAN → OPEN MODAL ───────────────────────────────────────
function selectPlan(planId, label, price) {
    selectedPlan = { id: planId, label, price };
    selectedPlanInfo.textContent = `${label} — Rp ${formatNumber(price)}`;

    // Reset modal state
    showStep('register');
    clearErrors();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// ── EVENT LISTENERS ────────────────────────────────────────────────
function setupEventListeners() {
    // Close modal
    $('#close-modal').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Toggle register/login
    $('#link-login').addEventListener('click', (e) => {
        e.preventDefault();
        showStep('login');
    });
    $('#link-register').addEventListener('click', (e) => {
        e.preventDefault();
        showStep('register');
    });

    // Register form submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleRegister();
    });

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });
}

// ── REGISTER → LOGIN → CHECKOUT ────────────────────────────────────
async function handleRegister() {
    const name = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim();
    const password = $('#reg-password').value;

    if (!name || !email || !password) return;

    setLoading('btn-register', true);
    clearErrors();

    try {
        // Step 1: Register
        const regRes = await apiPost('/auth/register', {
            name,
            email,
            password,
            utm_source: UTM_SOURCE
        });

        if (!regRes.ok) {
            const data = await regRes.json();
            throw new Error(data.message || 'Registrasi gagal');
        }

        // Step 2: Auto login
        await doLoginAndCheckout(email, password);

    } catch (err) {
        showError('register', err.message);
        setLoading('btn-register', false);
    }
}

async function handleLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;

    if (!email || !password) return;

    setLoading('btn-login', true);
    clearErrors();

    try {
        await doLoginAndCheckout(email, password);
    } catch (err) {
        showError('login', err.message);
        setLoading('btn-login', false);
    }
}

async function doLoginAndCheckout(email, password) {
    // Login
    const loginRes = await apiPost('/auth/login', { email, password });
    const loginData = await loginRes.json();

    if (!loginRes.ok) {
        throw new Error(loginData.message || 'Login gagal');
    }

    authToken = loginData.data?.access_token;
    if (!authToken) {
        throw new Error('Gagal mendapatkan token akses');
    }

    // Show checkout loading
    showStep('checkout');

    // Step 3: Checkout
    const checkoutRes = await apiPost('/checkout', {
        plan_id: selectedPlan.id,
        utm_source: UTM_SOURCE
    }, authToken);

    const checkoutData = await checkoutRes.json();

    if (!checkoutRes.ok) {
        showStep('register');
        throw new Error(checkoutData.message || 'Checkout gagal');
    }

    // Step 4: Redirect to Xendit payment page
    const checkoutUrl = checkoutData.data?.checkout_url;
    if (checkoutUrl) {
        window.location.href = checkoutUrl;
    } else {
        showStep('register');
        throw new Error('URL pembayaran tidak tersedia');
    }
}

// ── API HELPERS ────────────────────────────────────────────────────
async function apiPost(path, body, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'include'
    });
}

// ── UI HELPERS ─────────────────────────────────────────────────────
function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    setLoading('btn-register', false);
    setLoading('btn-login', false);
}

function showStep(step) {
    stepRegister.classList.toggle('hidden', step !== 'register');
    stepLogin.classList.toggle('hidden', step !== 'login');
    stepCheckout.classList.toggle('hidden', step !== 'checkout');
}

function setLoading(btnId, loading) {
    const btn = $(`#${btnId}`);
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loading');
    if (text) text.classList.toggle('hidden', loading);
    if (loader) loader.classList.toggle('hidden', !loading);
    btn.disabled = loading;
}

function showError(type, msg) {
    const el = type === 'register' ? registerError : loginError;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearErrors() {
    registerError.classList.add('hidden');
    loginError.classList.add('hidden');
}

function getDurationLabel(months) {
    if (months === 1) return '1 Bulan';
    if (months === 3) return '3 Bulan';
    if (months === 6) return '6 Bulan';
    if (months === 12) return '1 Tahun';
    return `${months} Bulan`;
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num);
}

// ═══════════════════════════════════════════════════════════════════
// MOLECULE BUILDER — Interactive Landing Page Demo
// ═══════════════════════════════════════════════════════════════════

(function () {
    // ── Molecule database (matching atomic app data) ──────────────
    const MOLECULES = {
        'H2O1': {
            formula: 'H₂O', name: 'Air', emoji: '💧',
            desc: 'Satu-satunya zat yang ditemukan di alam dalam tiga wujud: padat, cair, dan gas. Tanpanya, tidak ada kehidupan.',
            funFact: 'Air yang kamu minum hari ini mungkin pernah mengisi dinosaurus — atom tidak pernah musnah.',
            shape: 'Bengkok (bent) — 104.5°', bondType: 'Kovalen polar',
        },
        'C1O2': {
            formula: 'CO₂', name: 'Karbon Dioksida', emoji: '🌿',
            desc: 'Dihasilkan dari respirasi dan pembakaran. Gas ini yang membuat tanaman bisa berfotosintesis.',
            funFact: 'CO₂ yang kamu hembuskan setiap detik akan diserap pohon dan diubah menjadi oksigen dan glukosa — siklus karbon yang sempurna.',
            shape: 'Linear — 180°', bondType: 'Kovalen polar',
        },
        'Na1Cl1': {
            formula: 'NaCl', name: 'Garam Dapur', emoji: '🧂',
            desc: 'Natrium adalah logam reaktif yang meledak di air. Klorin adalah gas beracun. Keduanya bergabung jadi bumbu masak yang aman.',
            funFact: 'Garam pernah bernilai setara emas — kata "salary" berasal dari "salarium" (pembayaran garam). Pekerja Romawi digaji dengan garam.',
            shape: 'Kubik (kristal)', bondType: 'Ionik',
        },
        'C1H4': {
            formula: 'CH₄', name: 'Metana', emoji: '🔥',
            desc: 'Komponen utama gas alam. Kompor di dapurmu pakai ini. Juga gas rumah kaca 80× lebih kuat dari CO₂.',
            funFact: 'Di bulan Titan milik Saturnus, ada danau metana cair — seperti samudra, tapi bukan air.',
            shape: 'Tetrahedral — 109.5°', bondType: 'Kovalen nonpolar',
        },
        'N1H3': {
            formula: 'NH₃', name: 'Amonia', emoji: '🌾',
            desc: 'Bau tajam pembersih toilet? Itu amonia. Juga bahan baku 80% pupuk nitrogen di dunia.',
            funFact: 'Sintesis amonia (Haber-Bosch) menghidupi ~4 miliar orang — penemuan paling berdampak pada populasi manusia.',
            shape: 'Piramida trigonal', bondType: 'Kovalen polar',
        },
        'H2S1O4': {
            formula: 'H₂SO₄', name: 'Asam Sulfat', emoji: '⚗️',
            desc: 'Asam paling banyak diproduksi di dunia. Baterai aki, pupuk, detergen — semua pakai ini.',
            funFact: 'Lebih dari 200 juta ton H₂SO₄ diproduksi tiap tahun — produksinya jadi indikator kekuatan industri suatu negara.',
            shape: 'Tetrahedral', bondType: 'Kovalen polar',
        },
    };

    // ── Atom palette colors (CPK convention) ─────────────────────
    const ATOM_COLORS = {
        H: '#60a5fa', O: '#f87171', C: '#6b7280', N: '#818cf8',
        Na: '#a78bfa', Cl: '#34d399', S: '#fbbf24', Fe: '#f97316',
        Ca: '#4ade80', K: '#c084fc', Mg: '#86efac', Al: '#d1d5db',
    };
    const ATOM_NAMES = {
        H: 'Hidrogen', O: 'Oksigen', C: 'Karbon', N: 'Nitrogen',
        Na: 'Natrium', Cl: 'Klorin', S: 'Sulfur', Fe: 'Besi',
        Ca: 'Kalsium', K: 'Kalium', Mg: 'Magnesium', Al: 'Aluminium',
    };

    // ── Atom palettes per challenge ──────────────────────────────
    const CHALLENGE_PALETTES = {
        'H2O1': ['H', 'O', 'N', 'C'],
        'C1O2': ['C', 'O', 'H', 'N'],
        'Na1Cl1': ['Na', 'Cl', 'K', 'H', 'O'],
        'C1H4': ['C', 'H', 'O', 'N', 'S'],
        'N1H3': ['N', 'H', 'O', 'C'],
        'H2S1O4': ['H', 'S', 'O', 'N', 'C', 'Cl'],
    };

    // ── State ────────────────────────────────────────────────────
    let currentTarget = { H: 2, O: 1 };
    let currentKey = 'H2O1';
    let isFree = true;
    let atoms = []; // [{ sym: 'H', id: uid }]
    let uid = 0;

    // ── DOM refs ─────────────────────────────────────────────────
    const canvas = document.getElementById('mol-canvas');
    const placeholder = document.getElementById('mol-placeholder');
    const formulaEl = document.getElementById('mol-formula');
    const resetBtn = document.getElementById('mol-reset');
    const palette = document.getElementById('mol-palette');
    const result = document.getElementById('mol-result');
    const overlay = document.getElementById('mol-locked-overlay');
    const challengeBtns = document.querySelectorAll('.mol-challenge-btn');

    if (!canvas) return; // guard if DOM not ready

    // ── Helpers ──────────────────────────────────────────────────
    function compKey(comp) {
        return Object.keys(comp).sort().map(k => k + comp[k]).join('');
    }

    function currentComposition() {
        const c = {};
        atoms.forEach(a => { c[a.sym] = (c[a.sym] || 0) + 1; });
        return c;
    }

    function formulaString(comp) {
        const order = ['C', 'H', 'N', 'Na', 'K', 'Ca', 'Mg', 'Fe', 'Al', 'S', 'Cl', 'O'];
        const keys = Object.keys(comp).sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        const subs = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return keys.map(k => {
            const n = comp[k];
            if (n === 1) return k;
            return k + String(n).split('').map(d => subs[d] || d).join('');
        }).join('');
    }

    // ── Render palette ───────────────────────────────────────────
    function renderPalette() {
        const atoms_list = CHALLENGE_PALETTES[currentKey] || ['H', 'O', 'C', 'N'];
        palette.innerHTML = atoms_list.map(sym => `
            <button class="mol-palette-btn" data-sym="${sym}">
                <span class="mol-palette-sym" style="color: ${ATOM_COLORS[sym] || '#ccc'}">${sym}</span>
                <span class="mol-palette-name">${ATOM_NAMES[sym] || sym}</span>
            </button>
        `).join('');

        palette.querySelectorAll('.mol-palette-btn').forEach(btn => {
            btn.addEventListener('click', () => addAtom(btn.dataset.sym));
        });
    }

    // ── Add atom ─────────────────────────────────────────────────
    function addAtom(sym) {
        if (atoms.length >= 12) return; // safety cap
        const id = ++uid;
        atoms.push({ sym, id });
        renderCanvas();
        checkMatch();
    }

    // ── Remove atom ──────────────────────────────────────────────
    function removeAtom(id) {
        atoms = atoms.filter(a => a.id !== id);
        renderCanvas();
        result.style.display = 'none';
        result.innerHTML = '';
        checkMatch();
    }

    // ── Render canvas ────────────────────────────────────────────
    function renderCanvas() {
        const comp = currentComposition();
        const hasAtoms = atoms.length > 0;

        placeholder.style.display = hasAtoms ? 'none' : 'block';
        formulaEl.textContent = hasAtoms ? formulaString(comp) : '';

        // Remove old bubbles but keep placeholder
        canvas.querySelectorAll('.mol-atom-bubble, .mol-bond-line').forEach(el => el.remove());

        atoms.forEach((atom, i) => {
            // Bond line between atoms (except first)
            if (i > 0) {
                const bond = document.createElement('div');
                bond.className = 'mol-bond-line';
                canvas.appendChild(bond);
            }

            const bubble = document.createElement('div');
            bubble.className = 'mol-atom-bubble';
            bubble.style.background = `radial-gradient(circle at 35% 35%, ${lighten(ATOM_COLORS[atom.sym] || '#888')}, ${ATOM_COLORS[atom.sym] || '#888'})`;
            bubble.style.boxShadow = `0 0 16px ${ATOM_COLORS[atom.sym] || '#888'}44`;
            bubble.textContent = atom.sym;
            bubble.title = `Klik untuk hapus ${ATOM_NAMES[atom.sym] || atom.sym}`;

            const xBtn = document.createElement('span');
            xBtn.className = 'mol-atom-x';
            xBtn.textContent = '✕';
            bubble.appendChild(xBtn);

            bubble.addEventListener('click', () => removeAtom(atom.id));
            canvas.appendChild(bubble);
        });
    }

    function lighten(hex) {
        // Simple lighten for gradient highlight
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const mix = (c) => Math.min(255, c + 80);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    // ── Check for match ──────────────────────────────────────────
    function checkMatch() {
        const comp = currentComposition();
        const key = compKey(comp);
        const mol = MOLECULES[key];

        if (mol) {
            showResult(mol);
            spawnConfetti();
        }
    }

    // ── Show result ──────────────────────────────────────────────
    function showResult(mol) {
        result.style.display = 'block';
        result.innerHTML = `
            <div class="mol-result-header">
                <span class="mol-result-emoji">${mol.emoji}</span>
                <div>
                    <div class="mol-result-title">✅ ${mol.name}</div>
                    <div class="mol-result-formula">${mol.formula} · ${mol.shape} · ${mol.bondType}</div>
                </div>
            </div>
            <p class="mol-result-desc">${mol.desc}</p>
            <div class="mol-result-funfact">💡 ${mol.funFact}</div>
        `;
    }

    // ── Confetti burst ───────────────────────────────────────────
    function spawnConfetti() {
        const colors = ['#6366f1', '#a78bfa', '#10b981', '#f59e0b', '#f87171', '#60a5fa'];
        for (let i = 0; i < 24; i++) {
            const dot = document.createElement('div');
            dot.className = 'mol-confetti';
            dot.style.background = colors[Math.floor(Math.random() * colors.length)];
            dot.style.left = '50%';
            dot.style.top = '50%';
            const angle = (Math.PI * 2 * i) / 24;
            const dist = 60 + Math.random() * 80;
            dot.style.setProperty('--cx', `${Math.cos(angle) * dist}px`);
            dot.style.setProperty('--cy', `${Math.sin(angle) * dist}px`);
            canvas.appendChild(dot);
            setTimeout(() => dot.remove(), 900);
        }
    }

    // ── Reset ────────────────────────────────────────────────────
    function reset() {
        atoms = [];
        uid = 0;
        renderCanvas();
        result.style.display = 'none';
        result.innerHTML = '';
    }

    // ── Challenge switching ──────────────────────────────────────
    function switchChallenge(btn) {
        const target = JSON.parse(btn.dataset.target);
        const free = btn.dataset.free === 'true';

        challengeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentTarget = target;
        currentKey = compKey(target);
        isFree = free;

        reset();
        renderPalette();

        if (!free) {
            overlay.style.display = 'flex';
        } else {
            overlay.style.display = 'none';
        }
    }

    // ── Wire up events ───────────────────────────────────────────
    challengeBtns.forEach(btn => {
        btn.addEventListener('click', () => switchChallenge(btn));
    });

    resetBtn.addEventListener('click', reset);

    // ── Init ─────────────────────────────────────────────────────
    renderPalette();
    renderCanvas();
})();
