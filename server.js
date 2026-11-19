// Server Node.js untuk Kedai Kopi Senja
// Menyediakan REST API dan melayani file statis (HTML, CSS, JS)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Helper: Membaca database.json
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const defaultDb = { users: [], menu: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
            return defaultDb;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Gagal membaca database.json:', err);
        return { users: [], menu: [] };
    }
}

// Helper: Menyimpan ke database.json
function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Gagal menulis database.json:', err);
        return false;
    }
}

// Helper: Parsing JSON request body
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const parsed = body ? JSON.parse(body) : {};
                resolve(parsed);
            } catch (err) {
                reject(new Error('Format JSON tidak valid'));
            }
        });
        req.on('error', err => reject(err));
    });
}

// Helper: Mengirim response JSON
function sendJsonResponse(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data, null, 2));
}

// MIME types untuk static file server
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    // Handle Preflight CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // ==========================================
    // REST API ROUTES
    // ==========================================

    // 1. API: Cek status server
    if (pathname === '/api/status' && req.method === 'GET') {
        return sendJsonResponse(res, 200, {
            success: true,
            message: 'API Kedai Kopi Senja berjalan normal',
            database: 'database.json',
            timestamp: new Date().toISOString()
        });
    }

    // 2. API: Mengambil Daftar Menu (GET /api/menu)
    if (pathname === '/api/menu' && req.method === 'GET') {
        const db = readDatabase();
        return sendJsonResponse(res, 200, {
            success: true,
            total: db.menu.length,
            data: db.menu
        });
    }

    // 3. API: Login (POST /api/login)
    if (pathname === '/api/login' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { username, password } = body;

            if (!username || !password) {
                return sendJsonResponse(res, 400, {
                    success: false,
                    message: 'Username dan password wajib diisi!'
                });
            }

            const db = readDatabase();
            const user = db.users.find(
                u => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
            );

            if (!user) {
                return sendJsonResponse(res, 401, {
                    success: false,
                    message: 'Username atau password salah! Silakan coba lagi.'
                });
            }

            // Login Berhasil - jangan kirimkan password kembali ke client demi keamanan
            const userSafe = {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role
            };

            return sendJsonResponse(res, 200, {
                success: true,
                message: `Selamat datang kembali, ${user.name}!`,
                user: userSafe,
                token: 'senja-token-' + Date.now() // Token dummy simulasi
            });
        } catch (error) {
            return sendJsonResponse(res, 400, {
                success: false,
                message: error.message || 'Terjadi kesalahan pada data request'
            });
        }
    }

    // 4. API: Register Akun Baru (POST /api/register)
    if (pathname === '/api/register' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const { username, password, name, email } = body;

            if (!username || !password || !name) {
                return sendJsonResponse(res, 400, {
                    success: false,
                    message: 'Nama, username, dan password wajib diisi!'
                });
            }

            const db = readDatabase();
            const exists = db.users.some(
                u => u.username.toLowerCase() === username.trim().toLowerCase()
            );

            if (exists) {
                return sendJsonResponse(res, 409, {
                    success: false,
                    message: 'Username sudah digunakan, silakan pilih username lain.'
                });
            }

            const newUser = {
                id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
                username: username.trim(),
                password: password,
                name: name.trim(),
                email: email ? email.trim() : `${username.trim()}@kopi-senja.com`,
                role: 'customer'
            };

            db.users.push(newUser);
            writeDatabase(db);

            return sendJsonResponse(res, 201, {
                success: true,
                message: 'Pendaftaran berhasil! Silakan login.',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    name: newUser.name,
                    role: newUser.role
                }
            });
        } catch (error) {
            return sendJsonResponse(res, 400, {
                success: false,
                message: error.message || 'Terjadi kesalahan saat pendaftaran'
            });
        }
    }

    // 5. API: Mengambil daftar user (khusus demonstrasi tugas)
    if (pathname === '/api/users' && req.method === 'GET') {
        const db = readDatabase();
        // Sembunyikan password saat dikembalikan
        const safeUsers = db.users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role
        }));
        return sendJsonResponse(res, 200, {
            success: true,
            total: safeUsers.length,
            users: safeUsers
        });
    }

    // ==========================================
    // STATIC FILE SERVER
    // ==========================================
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

    // Cek keamanan path traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Jika file tidak ditemukan dan bukan route API
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(`
                <div style="font-family:sans-serif; text-align:center; padding:50px;">
                    <h2>404 - Halaman / File Tidak Ditemukan</h2>
                    <p><a href="/">Kembali ke Beranda</a></p>
                </div>
            `);
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`☕ Server Kedai Kopi Senja Berjalan!`);
    console.log(`🌐 Akses Website : http://localhost:${PORT}`);
    console.log(`📡 API Status    : http://localhost:${PORT}/api/status`);
    console.log(`📋 API Menu      : http://localhost:${PORT}/api/menu`);
    console.log(`🔑 API Login     : http://localhost:${PORT}/api/login (POST)`);
    console.log(`💾 Database      : database.json`);
    console.log(`===============================================`);
});
