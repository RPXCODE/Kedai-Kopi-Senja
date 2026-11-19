const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function run() {
    console.log('1. Memulai server Node.js...');
    const serverProc = spawn('node', ['server.js'], { cwd: __dirname, stdio: 'pipe' });
    
    // Tunggu server berjalan
    await sleep(2000);

    const tempProfile = path.join(__dirname, '.temp-chrome-profile');
    const chromeProc = spawn(CHROME_PATH, [
        '--headless=new',
        '--remote-debugging-port=9222',
        `--user-data-dir=${tempProfile}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        'http://localhost:3000/#home'
    ]);

    await sleep(3000);

    try {
        console.log('2. Menghubungi Chrome DevTools Protocol...');
        const versionRes = await fetch('http://127.0.0.1:9222/json');
        const tabs = await versionRes.json();
        const tab = tabs.find(t => t.type === 'page');
        if (!tab || !tab.webSocketDebuggerUrl) {
            throw new Error('Tidak dapat menemukan WebSocket URL dari Chrome');
        }

        const ws = new WebSocket(tab.webSocketDebuggerUrl);

        let msgId = 1;
        const pendingCallbacks = new Map();

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && pendingCallbacks.has(data.id)) {
                const cb = pendingCallbacks.get(data.id);
                pendingCallbacks.delete(data.id);
                cb(data);
            }
        };

        await new Promise(resolve => ws.onopen = resolve);

        function sendCommand(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                pendingCallbacks.set(id, (res) => {
                    if (res.error) reject(res.error);
                    else resolve(res.result);
                });
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        async function setViewport(width, height, mobile = false) {
            await sendCommand('Emulation.setDeviceMetricsOverride', {
                width,
                height,
                deviceScaleFactor: 2,
                mobile,
                screenOrientation: { angle: 0, type: 'portraitPrimary' }
            });
            await sendCommand('Emulation.setVisibleSize', { width, height });
        }

        async function evaluate(code) {
            const res = await sendCommand('Runtime.evaluate', {
                expression: `(() => { ${code} })()`,
                awaitPromise: true,
                returnByValue: true
            });
            if (res.exceptionDetails) {
                console.error('JS Evaluation Error:', res.exceptionDetails.text, res.exceptionDetails.exception);
            }
            return res;
        }

        async function takeScreenshot(fileName) {
            const data = await sendCommand('Page.captureScreenshot', { format: 'png' });
            const buffer = Buffer.from(data.data, 'base64');
            const dest = path.join(SCREENSHOT_DIR, fileName);
            fs.writeFileSync(dest, buffer);
            console.log(`✓ Tersimpan: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
        }

        await sendCommand('Page.enable');
        await sendCommand('Runtime.enable');

        // Pastikan bersih dari sesi sebelumnya
        await evaluate(`
            localStorage.clear();
            sessionStorage.clear();
            if (typeof navigateTo === 'function') navigateTo('#home');
        `);
        await sleep(1000);

        // 1. Beranda Desktop (1280x820)
        console.log('Mengambil screenshot Beranda...');
        await setViewport(1280, 820);
        await evaluate(`
            window.scrollTo(0, 0);
            navigateTo('#home');
        `);
        await sleep(1200);
        await takeScreenshot('01_beranda.png');

        // 2. Daftar Menu Dinamis dari REST API
        console.log('Mengambil screenshot Daftar Menu...');
        await evaluate(`
            window.scrollTo(0, 0);
            navigateTo('#menu');
        `);
        await sleep(1500);
        await takeScreenshot('02_daftar_menu.png');

        // 3. Pencarian Menu (Live Search)
        console.log('Mengambil screenshot Pencarian Menu...');
        await evaluate(`
            const input = document.getElementById('menu-search');
            if (input) {
                input.value = 'kopi';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        `);
        await sleep(1000);
        await takeScreenshot('03_pencarian_menu.png');

        // Reset search input
        await evaluate(`
            const input = document.getElementById('menu-search');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        `);

        // 4. Form Login
        console.log('Mengambil screenshot Form Login...');
        await evaluate(`
            window.scrollTo(0, 0);
            navigateTo('#login');
            switchAuthTab('login');
        `);
        await sleep(1200);
        await takeScreenshot('04_halaman_login.png');

        // 5. Form Register
        console.log('Mengambil screenshot Form Register...');
        await evaluate(`
            switchAuthTab('register');
        `);
        await sleep(1200);
        await takeScreenshot('05_form_register.png');

        // 6. Login & Halaman Profil
        console.log('Mengambil screenshot Profil setelah login...');
        await evaluate(`
            switchAuthTab('login');
            autoFillDemo('admin', 'admin123');
            const submitBtn = document.getElementById('btn-login-submit');
            if (submitBtn) submitBtn.click();
        `);
        await sleep(2200);
        await takeScreenshot('06_profil_pengguna.png');

        // 7. Responsif Mobile View
        console.log('Mengambil screenshot Tampilan Mobile...');
        await setViewport(390, 844, true);
        await evaluate(`
            window.scrollTo(0, 0);
            navigateTo('#home');
        `);
        await sleep(1500);
        await takeScreenshot('07_tampilan_mobile.png');

        console.log('Semua screenshot berhasil dibuat dengan resolusi tinggi!');
        ws.close();
    } catch (e) {
        console.error('Error saat capture screenshot:', e);
    } finally {
        try { chromeProc.kill(); } catch (err) {}
        try { serverProc.kill(); } catch (err) {}
        try {
            fs.rmSync(tempProfile, { recursive: true, force: true });
        } catch (err) {}
        process.exit(0);
    }
}

run();
