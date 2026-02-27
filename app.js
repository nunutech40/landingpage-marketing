/**
 * Atomic — Student Landing Page (student-kimia-v1)
 *
 * Flow:
 * 1. Fetch plans from API → render pricing cards
 * 2. User clicks plan → register modal opens
 * 3. User submits register → auto login → auto checkout
 * 4. Redirect to Midtrans payment page
 */

// ── CONFIG ─────────────────────────────────────────────────────────
const API_BASE = '/api';
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

    // Step 4: Redirect to Midtrans payment page
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
// MOLECULE BUILDER — Now powered by real Kimia Lab demo (iframe)
// The old mock builder code has been removed.
// The real demo is loaded from: /#/molecule-demo
// ═══════════════════════════════════════════════════════════════════

