// ==========================================
// APLIKASI JAVASCRIPT KEDAI KOPI SENJA
// ==========================================
// Fitur:
// 1. Integrasi REST API (Login, Register, Menu, Status)
// 2. Autentikasi Pengguna & Sesi (localStorage)
// 3. Manajemen Navigasi Halaman SPA (Single Page Application)
// 4. Pengambilan Data Menu Dinamis dari Server / Database JSON
// 5. Pencarian & Filter Menu Minuman
// ==========================================

// Konfigurasi endpoint API
const API_BASE_URL = window.location.origin.includes('http') ? window.location.origin : 'http://localhost:3000';

// State aplikasi
const state = {
    currentUser: null,
    menuList: [],
    activeTab: 'login' // 'login' | 'register'
};

// ==========================================
// INISIALISASI SAAT HALAMAN DIMUAT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initAuth();
    initMenu();
    checkServerStatus();
    setupEventListeners();
});

// ==========================================
// 1. MANAJEMEN NAVIGASI HALAMAN
// ==========================================
function initNavigation() {
    // Dengarkan perubahan hash URL (#home, #menu, #login, #profile)
    window.addEventListener('hashchange', handleRoute);
    
    // Tampilkan halaman sesuai hash awal atau default ke #home
    const initialHash = window.location.hash || '#home';
    navigateTo(initialHash);
}

function handleRoute() {
    const hash = window.location.hash || '#home';
    showPage(hash.replace('#', ''));
}

function navigateTo(hash) {
    window.location.hash = hash;
    showPage(hash.replace('#', ''));
}

function showPage(pageId) {
    // Tangani jika user membuka #login tapi sudah login -> arahkan ke #profile
    if (pageId === 'login' && state.currentUser) {
        pageId = 'profile';
        window.location.hash = '#profile';
    }

    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    } else {
        // Fallback ke home jika hash tidak ditemukan
        const homePage = document.getElementById('home');
        if (homePage) homePage.classList.add('active');
    }

    // Perbarui active state di navbar
    const navLinks = document.querySelectorAll('.navbar a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === `#${pageId}` || (pageId === 'profile' && href === '#login')) {
            link.classList.add('active');
        }
    });

    // Scroll ke atas dengan halus
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 2. CEK STATUS KONEKSI SERVER & API
// ==========================================
async function checkServerStatus() {
    const statusBadge = document.getElementById('server-status');
    if (!statusBadge) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (response.ok) {
            const data = await response.json();
            statusBadge.innerHTML = `<span class="dot online"></span> API Server Terhubung (JSON DB)`;
            statusBadge.classList.add('online');
            statusBadge.classList.remove('offline');
        } else {
            throw new Error('Server non-OK response');
        }
    } catch (err) {
        statusBadge.innerHTML = `<span class="dot offline"></span> API Server Offline (Jalankan 'npm start')`;
        statusBadge.classList.add('offline');
        statusBadge.classList.remove('online');
    }
}

// ==========================================
// 3. PENGAMBILAN DATA MENU DARI REST API
// ==========================================
async function initMenu() {
    const tableBody = document.getElementById('menu-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; padding: 25px;">
                <div class="spinner"></div>
                <p style="margin-top: 10px; color: #7f5539;">Memuat menu dari database JSON...</p>
            </td>
        </tr>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/menu`);
        if (!response.ok) throw new Error('Gagal memuat menu');
        
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
            state.menuList = result.data;
            renderMenuTable(state.menuList);
        } else {
            throw new Error('Format data tidak sesuai');
        }
    } catch (error) {
        console.warn('Gagal fetch menu dari API, menggunakan fallback lokal:', error);
        // Fallback menu jika API offline
        state.menuList = [
            { id: 1, name: "Kopi Hitam", category: "Minuman Kopi", description: "Kopi hitam asli tanpa gula yang pekat.", price: 15000, badge: "Klasik" },
            { id: 2, name: "Kopi Susu Aren", category: "Minuman Kopi", description: "Campuran espresso, susu segar, dan gula aren asli.", price: 20000, badge: "Terlaris" },
            { id: 3, name: "Cappuccino", category: "Minuman Kopi", description: "Espresso dengan campuran susu dan busa tebal.", price: 25000, badge: "Favorit" },
            { id: 4, name: "Es Teh Manis", category: "Non-Kopi", description: "Teh segar dengan es batu dan gula.", price: 10000, badge: "Segar" }
        ];
        renderMenuTable(state.menuList);
    }
}

function renderMenuTable(items) {
    const tableBody = document.getElementById('menu-table-body');
    const menuCount = document.getElementById('menu-count');
    if (!tableBody) return;

    if (menuCount) {
        menuCount.textContent = `(${items.length} item)`;
    }

    if (items.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 30px; color: #888;">
                    Tidak ada menu yang sesuai dengan pencarian.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = items.map((item, index) => `
        <tr>
            <td style="font-weight: 600;">
                <div class="menu-name">${escapeHtml(item.name)}</div>
                ${item.badge ? `<span class="badge ${item.badge.includes('Promo') ? 'badge-promo' : 'badge-gold'}">${escapeHtml(item.badge)}</span>` : ''}
            </td>
            <td><span class="category-tag">${escapeHtml(item.category || 'Minuman')}</span></td>
            <td>${escapeHtml(item.description)}</td>
            <td class="menu-price">${formatRupiah(item.price)}</td>
        </tr>
    `).join('');
}

// ==========================================
// 4. AUTENTIKASI: LOGIN, REGISTER, & SESI
// ==========================================
function initAuth() {
    // Cek apakah ada sesi tersimpan di localStorage
    const savedUser = localStorage.getItem('senja_currentUser');
    if (savedUser) {
        try {
            state.currentUser = JSON.parse(savedUser);
            updateAuthUI();
        } catch (e) {
            localStorage.removeItem('senja_currentUser');
        }
    }
}

function updateAuthUI() {
    const navLoginLink = document.getElementById('nav-login-link');
    const userBar = document.getElementById('navbar-user');
    const profileContainer = document.getElementById('profile-content');

    if (state.currentUser) {
        // User telah login
        if (navLoginLink) {
            navLoginLink.textContent = state.currentUser.name.split(' ')[0];
            navLoginLink.setAttribute('href', '#profile');
        }

        if (userBar) {
            userBar.style.display = 'flex';
            userBar.innerHTML = `
                <span class="nav-user-greeting">Hai, <strong>${escapeHtml(state.currentUser.name)}</strong></span>
                <button type="button" id="btn-nav-logout" class="btn-logout-small" title="Keluar dari Akun" onclick="handleLogout(event)">Keluar</button>
            `;
            const btnLogout = document.getElementById('btn-nav-logout');
            if (btnLogout) {
                btnLogout.onclick = handleLogout;
            }
        }

        // Render data profil
        if (profileContainer) {
            profileContainer.innerHTML = `
                <div class="profile-card">
                    <div class="profile-avatar">${escapeHtml(state.currentUser.name.charAt(0).toUpperCase())}</div>
                    <div class="profile-header-info">
                        <h3>${escapeHtml(state.currentUser.name)}</h3>
                        <p class="role-badge ${state.currentUser.role === 'admin' ? 'role-admin' : 'role-customer'}">
                            ${state.currentUser.role === 'admin' ? 'Administrator / Barista' : 'Pelanggan Setia'}
                        </p>
                    </div>
                    <hr class="divider">
                    <div class="profile-details">
                        <div class="profile-row">
                            <span class="label">ID Pengguna:</span>
                            <span class="value">#${state.currentUser.id}</span>
                        </div>
                        <div class="profile-row">
                            <span class="label">Username:</span>
                            <span class="value"><strong>@${escapeHtml(state.currentUser.username)}</strong></span>
                        </div>
                        <div class="profile-row">
                            <span class="label">Email:</span>
                            <span class="value">${escapeHtml(state.currentUser.email || '-')}</span>
                        </div>
                        <div class="profile-row">
                            <span class="label">Status:</span>
                            <span class="value status-active">● Aktif Terhubung ke Database JSON</span>
                        </div>
                    </div>
                    <div class="profile-actions">
                        <button class="btn btn-primary" onclick="window.location.hash='#menu'">Pesan Kopi Sekarang</button>
                        <button class="btn btn-secondary" onclick="handleLogout()">Keluar (Logout)</button>
                    </div>
                </div>
            `;
        }
    } else {
        // User belum login (Guest)
        if (navLoginLink) {
            navLoginLink.textContent = 'Login / Masuk';
            navLoginLink.setAttribute('href', '#login');
        }
        if (userBar) {
            userBar.style.display = 'none';
            userBar.innerHTML = '';
        }
    }
}

// Handler Submit Login Form (POST ke API /api/login)
async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('btn-login-submit');
    const alertBox = document.getElementById('login-alert');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        showAlert(alertBox, 'Silakan isi username dan password!', 'error');
        return;
    }

    // Set status loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Memverifikasi...';
    hideAlert(alertBox);

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showAlert(alertBox, result.message, 'success');
            
            // Simpan sesi login
            state.currentUser = result.user;
            localStorage.setItem('senja_currentUser', JSON.stringify(result.user));
            
            updateAuthUI();

            // Reset form
            usernameInput.value = '';
            passwordInput.value = '';

            // Redirect ke halaman profil / beranda setelah 800ms
            setTimeout(() => {
                navigateTo('#profile');
            }, 800);
        } else {
            showAlert(alertBox, result.message || 'Login gagal! Periksa kembali username & password.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert(alertBox, 'Gagal terhubung ke server API. Pastikan server Node.js aktif di port 3000.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Masuk Sekarang';
    }
}

// Handler Submit Register Form (POST ke API /api/register)
async function handleRegister(e) {
    e.preventDefault();
    const nameInput = document.getElementById('reg-name');
    const usernameInput = document.getElementById('reg-username');
    const emailInput = document.getElementById('reg-email');
    const passwordInput = document.getElementById('reg-password');
    const submitBtn = document.getElementById('btn-register-submit');
    const alertBox = document.getElementById('register-alert');

    const name = nameInput.value.trim();
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!name || !username || !password) {
        showAlert(alertBox, 'Nama, Username, dan Password wajib diisi!', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Menyimpan data ke JSON...';
    hideAlert(alertBox);

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, username, email, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showAlert(alertBox, result.message, 'success');

            // Reset form
            nameInput.value = '';
            usernameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';

            // Otomatis pindah ke tab Login setelah 1.2 detik dan isi username
            setTimeout(() => {
                switchAuthTab('login');
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').focus();
                showAlert(document.getElementById('login-alert'), 'Akun Anda telah tersimpan di database JSON! Silakan masukkan password untuk login.', 'info');
            }, 1200);
        } else {
            showAlert(alertBox, result.message || 'Pendaftaran gagal.', 'error');
        }
    } catch (error) {
        console.error('Register error:', error);
        showAlert(alertBox, 'Gagal terhubung ke API Server. Pastikan server Node.js aktif.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Daftar Akun';
    }
}

// Handler Logout
function handleLogout(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    state.currentUser = null;
    localStorage.removeItem('senja_currentUser');
    sessionStorage.clear();
    updateAuthUI();
    showToast('Berhasil keluar dari akun (Logout).');
    navigateTo('#home');
}

// Beralih antara tab Login dan Register
function switchAuthTab(tab) {
    state.activeTab = tab;
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('form-login-container');
    const formRegister = document.getElementById('form-register-container');

    if (tab === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.style.display = 'block';
        formRegister.style.display = 'none';
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.style.display = 'block';
        formLogin.style.display = 'none';
    }
}

// Helper isi otomatis akun demo
function autoFillDemo(username, password) {
    switchAuthTab('login');
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    uInput.value = username;
    pInput.value = password;
    showToast(`Akun demo '${username}' berhasil diisikan ke form.`);
}

// Toggle lihat / sembunyikan password
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Sembunyikan';
        btn.setAttribute('title', 'Sembunyikan password');
    } else {
        input.type = 'password';
        btn.textContent = 'Lihat';
        btn.setAttribute('title', 'Lihat password');
    }
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Form Login Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // Form Register Submit
    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    // Tab Toggle Login / Register
    const tabLogin = document.getElementById('tab-btn-login');
    const tabReg = document.getElementById('tab-btn-register');
    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
    if (tabReg) tabReg.addEventListener('click', () => switchAuthTab('register'));

    // Search input untuk Menu
    const searchInput = document.getElementById('menu-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const filtered = state.menuList.filter(item => 
                item.name.toLowerCase().includes(query) ||
                (item.description && item.description.toLowerCase().includes(query)) ||
                (item.category && item.category.toLowerCase().includes(query))
            );
            renderMenuTable(filtered);
        });
    }

    // Refresh Menu Button
    const refreshMenuBtn = document.getElementById('btn-refresh-menu');
    if (refreshMenuBtn) {
        refreshMenuBtn.addEventListener('click', () => {
            initMenu();
            showToast('Memperbarui daftar menu dari database...');
        });
    }

    // Delegasi klik global untuk tombol logout navbar
    document.addEventListener('click', (e) => {
        const logoutTarget = e.target.closest('#btn-nav-logout, .btn-logout-small');
        if (logoutTarget) {
            e.preventDefault();
            e.stopPropagation();
            handleLogout(e);
        }
    });
}

// ==========================================
// 6. HELPER UTILITIES
// ==========================================
function showAlert(element, message, type = 'info') {
    if (!element) return;
    element.innerHTML = message;
    element.className = `alert-box alert-${type}`;
    element.style.display = 'block';
}

function hideAlert(element) {
    if (!element) return;
    element.style.display = 'none';
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast show';
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function formatRupiah(number) {
    return 'Rp ' + Number(number).toLocaleString('id-ID');
}

function escapeHtml(string) {
    if (!string) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Expose fungsi ke window agar dapat dipanggil dari inline HTML onClick
window.handleLogout = handleLogout;
window.autoFillDemo = autoFillDemo;
window.togglePasswordVisibility = togglePasswordVisibility;
window.switchAuthTab = switchAuthTab;
