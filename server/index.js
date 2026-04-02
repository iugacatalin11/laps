import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ClientSecretCredential, DefaultAzureCredential, ChainedTokenCredential } from '@azure/identity';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Azure App Service proxy
app.set('trust proxy', 1);

// Security headers - disable CSP so MSAL can reach login.microsoftonline.com
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
}));

// CORS - in production frontend & backend are same origin, only needed for dev
if (process.env.NODE_ENV !== 'production') {
    app.use(cors({
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Authorization', 'Content-Type'],
    }));
}

// Rate limiting - max 100 requests per 15 min per IP
// keyGenerator strips port from IP to fix Azure App Service proxy format (IP:port)
const ipKeyGenerator = (req) => (req.ip || '').replace(/:\d+$/, '').replace(/^::ffff:/, '');

app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: ipKeyGenerator,
    validate: { keyGeneratorIpFallback: false },
    message: { error: 'Too many requests, please try again later.' }
}));

// Stricter limit on LAPS reveal - max 10 per 15 min
app.use('/api/laps/reveal', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: ipKeyGenerator,
    validate: { keyGeneratorIpFallback: false },
    message: { error: 'Too many password requests. Please wait before trying again.' }
}));

app.use(express.json());

// Azure credential for Graph API calls
// In production: uses Managed Identity (no client secret needed - zero secret risk)
// In development: falls back to ClientSecretCredential from .env
let credential;
if (process.env.NODE_ENV === 'production') {
    credential = new DefaultAzureCredential();
    console.log('🔐 Using Managed Identity (no client secret)');
} else {
    credential = new ClientSecretCredential(
        process.env.AZURE_TENANT_ID,
        process.env.AZURE_CLIENT_ID,
        process.env.AZURE_CLIENT_SECRET
    );
    console.log('🔑 Using ClientSecretCredential (dev mode)');
}

// Get a Graph API token using backend service credentials
async function getGraphToken() {
    const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
    return tokenResponse.token;
}

// Call Microsoft Graph API (v1.0)
async function callGraph(endpoint) {
    const token = await getGraphToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Graph API error ${response.status}: ${text}`);
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
}

// Call Microsoft Graph API (beta) - GET
async function callGraphBeta(endpoint) {
    const token = await getGraphToken();
    const response = await fetch(`https://graph.microsoft.com/beta${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Graph API error ${response.status}: ${text}`);
    }
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
}

// Call Microsoft Graph API (beta) - POST action
async function callGraphBetaPost(endpoint) {
    const token = await getGraphToken();
    const response = await fetch(`https://graph.microsoft.com/beta${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Graph API error ${response.status}: ${text}`);
    }
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
}

// Validate user token by calling Graph /me endpoint
async function getUserFromToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No authorization token provided');
    }
    const token = authHeader.split(' ')[1];
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error('Invalid or expired token');
    }
    return response.json(); // { displayName, userPrincipalName, id, ... }
}

// Persistent audit log - saved to file so it survives restarts
const AUDIT_FILE = process.env.NODE_ENV === 'production'
    ? '/home/LogFiles/laps-audit.json'
    : path.join(__dirname, '../laps-audit.json');

const ensureAuditFile = () => {
    try {
        const dir = path.dirname(AUDIT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]', 'utf8');
    } catch {}
};

const loadAuditLogs = () => {
    try {
        ensureAuditFile();
        return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    } catch { return []; }
};

const saveAuditLog = (entry) => {
    try {
        ensureAuditFile();
        const logs = loadAuditLogs();
        logs.unshift(entry);
        const trimmed = logs.slice(0, 5000); // keep last 5000 entries
        fs.writeFileSync(AUDIT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save audit log:', err.message);
    }
};

// Admin UPNs - IT staff who can see all logs (comma-separated in env var)
const ADMIN_UPNS = (process.env.ADMIN_UPNS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// Middleware: validate user token
const requireAuth = async (req, res, next) => {
    try {
        const user = await getUserFromToken(req.headers.authorization);
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Unauthorized. Please sign in with your Microsoft account.' });
    }
};

// Endpoint: Get Intune managed devices with LAPS
app.get('/api/devices', requireAuth, async (req, res) => {
    try {
        // Get only devices assigned to the logged-in user
        const upn = req.user.userPrincipalName;
        const result = await callGraph(
            `/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,lastSyncDateTime,managedDeviceOwnerType&$filter=userPrincipalName eq '${upn}'&$top=50`
        );

        const devices = (result.value || []).map(device => {
            const lastSync = new Date(device.lastSyncDateTime);
            const now = new Date();
            const diffMs = now - lastSync;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            let lastSyncStr;
            if (diffMins < 60) lastSyncStr = `${diffMins} min ago`;
            else if (diffHours < 24) lastSyncStr = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            else lastSyncStr = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

            const name = device.deviceName || 'Unknown';
            const isServer = name.toLowerCase().includes('srv') || name.toLowerCase().includes('server');

            return {
                id: device.id,
                name: name,
                type: isServer ? 'server' : 'laptop',
                os: device.operatingSystem + (device.osVersion ? ` ${device.osVersion}` : ''),
                lastSync: lastSyncStr,
                isBreakGlass: isServer
            };
        });

        res.json(devices);
    } catch (err) {
        console.error('Error fetching devices:', err.message);
        res.status(500).json({ error: 'Failed to fetch devices from Microsoft Graph.' });
    }
});

// Endpoint: Reveal LAPS Password
app.post('/api/laps/reveal', requireAuth, async (req, res) => {
    const { deviceId, reason, isBreakGlass } = req.body;
    const user = req.user;
    const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);

    if (!reason || reason.length < 5) {
        saveAuditLog({ id: Date.now().toString(), user: user.displayName, userEmail: user.userPrincipalName, device: deviceId, ip, status: 'DENIED', date: dateStr, reason, details: 'Invalid reason length' });
        return res.status(400).json({ error: 'Business justification must be at least 5 characters.' });
    }

    try {
        // Get Intune device details - OS type + Entra Device ID
        const intuneDevice = await callGraph(`/deviceManagement/managedDevices/${deviceId}?$select=id,deviceName,operatingSystem,azureADDeviceId`);
        const entraDeviceId = intuneDevice.azureADDeviceId;
        const os = (intuneDevice.operatingSystem || '').toLowerCase();

        console.log(`[AUDIT] LAPS request: ${intuneDevice.deviceName} by ${user.userPrincipalName}`);

        if (!entraDeviceId) {
            throw new Error('Device not found in Entra ID');
        }

        let password = null;

        // Helper to extract password from a deviceLocalCredentials result
        const extractPassword = (result) => {
            if (!result?.credentials?.length) return null;
            const latest = result.credentials.sort(
                (a, b) => new Date(b.backupDateTime) - new Date(a.backupDateTime)
            )[0];
            return latest.passwordBase64
                ? Buffer.from(latest.passwordBase64, 'base64').toString('utf-8')
                : latest.password || null;
        };

        console.log(`[LAPS ID] device=${intuneDevice.deviceName} intuneId=${deviceId} entraId=${entraDeviceId} os=${os}`);

        // Try v1.0 first (works in ms-sso-admin-viewer for both Windows and macOS)
        // then fall back to beta if needed
        let lapsResult = null;
        try {
            lapsResult = await callGraph(`/directory/deviceLocalCredentials/${entraDeviceId}?$select=credentials`);
        } catch (e) {
            console.log(`[LAPS v1.0 error] ${e.message}`);
            lapsResult = await callGraphBeta(`/directory/deviceLocalCredentials/${entraDeviceId}?$select=credentials`);
        }
        console.log(`[LAPS result] ${JSON.stringify(lapsResult)}`);
        password = extractPassword(lapsResult);

        if (!password) {
            saveAuditLog({ id: Date.now().toString(), user: user.displayName, userEmail: user.userPrincipalName, device: intuneDevice.deviceName, ip, status: 'ERROR', date: dateStr, reason, details: 'LAPS_NOT_CONFIGURED' });
            return res.status(404).json({ error: 'LAPS is not configured for this device.' });
        }

        const validUntil = new Date(Date.now() + 1000 * 60 * 30).toLocaleTimeString();

        saveAuditLog({ id: Date.now().toString(), user: user.displayName, userEmail: user.userPrincipalName, device: intuneDevice.deviceName, ip, status: 'SUCCESS', date: dateStr, reason });
        console.log(`[AUDIT] ${user.displayName} (${user.userPrincipalName}) requested LAPS for ${intuneDevice.deviceName}. Reason: ${reason}`);

        res.json({ password, validUntil });

    } catch (err) {
        console.error('Error fetching LAPS password:', err.message);
        saveAuditLog({ id: Date.now().toString(), user: user.displayName, userEmail: user.userPrincipalName, device: deviceId, ip, status: 'ERROR', date: dateStr, reason, details: err.message });
        res.status(500).json({ error: 'Failed to retrieve LAPS password. ' + err.message });
    }
});

// Endpoint: Get Audit Logs - only IT admins see all logs
app.get('/api/audit', requireAuth, async (req, res) => {
    const upn = req.user.userPrincipalName?.toLowerCase();
    const isAdmin = ADMIN_UPNS.length === 0 || ADMIN_UPNS.includes(upn);
    if (!isAdmin) {
        return res.status(403).json({ error: 'Access denied. Only IT administrators can view audit logs.' });
    }
    res.json(loadAuditLogs());
});

// Endpoint: Check if current user is admin
app.get('/api/me', requireAuth, async (req, res) => {
    const upn = req.user.userPrincipalName?.toLowerCase();
    const isAdmin = ADMIN_UPNS.length === 0 || ADMIN_UPNS.includes(upn);
    res.json({ ...req.user, isAdmin });
});


// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../dist')));
    app.get('/{*path}', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`🚀 LAPS Portal running on port ${PORT}`);
    console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
});
