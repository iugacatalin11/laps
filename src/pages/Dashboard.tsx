import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MonitorSmartphone, Server, AlertTriangle, Key, ChevronRight, X, Copy, CheckCircle2 } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../auth/msalConfig';

const Dashboard = () => {
    const [devices, setDevices] = useState<any[]>([]);
    const [isLoadingDevices, setIsLoadingDevices] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDevice, setSelectedDevice] = useState<any>(null);
    const [reason, setReason] = useState('');
    const [isRequesting, setIsRequesting] = useState(false);
    const [passwordData, setPasswordData] = useState<{ password?: string, validUntil?: string, error?: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const { instance, accounts } = useMsal();

    const getToken = async () => {
        const request = { ...loginRequest, account: accounts[0] };
        const response = await instance.acquireTokenSilent(request);
        return response.accessToken;
    };

    useEffect(() => {
        const loadDevices = async () => {
            try {
                const token = await getToken();
                const res = await fetch('/api/devices', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setDevices(data);
                setIsLoadingDevices(false);
            } catch (err) {
                console.error("Failed to load devices", err);
                setIsLoadingDevices(false);
            }
        };
        loadDevices();
    }, []);

    // Filter devices
    const filteredDevices = devices.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleRequestPassword = async () => {
        if (!reason || reason.length < 5) return;

        setIsRequesting(true);
        setPasswordData(null);

        try {
            const token = await getToken();
            const res = await fetch('/api/laps/reveal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ deviceId: selectedDevice.id, reason, isBreakGlass: selectedDevice.isBreakGlass })
            });
            const data = await res.json();

            setIsRequesting(false);

            if (!res.ok) {
                setPasswordData({ error: data.error || 'Server error occurred' });
                return;
            }

            setPasswordData({
                password: data.password,
                validUntil: data.validUntil
            });

            // Auto-hide the password after 30 seconds
            setTimeout(() => {
                setPasswordData(null);
                setSelectedDevice(null);
            }, 30000);

        } catch (err) {
            setIsRequesting(false);
            setPasswordData({ error: 'Network error occurred while fetching password.' });
        }
    };

    const copyToClipboard = () => {
        if (passwordData?.password) {
            navigator.clipboard.writeText(passwordData.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const closeModal = () => {
        setSelectedDevice(null);
        setReason('');
        setPasswordData(null);
    };

    return (
        <div className="container animate-fade-in pt-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2>Device Inventory</h2>
                    <p>Request Local Admin (LAPS) passwords for your authorized devices.</p>
                </div>

                <div style={{ position: 'relative', width: '300px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Search by hostname..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }}
                    />
                </div>
            </div>

            {isLoadingDevices ? (
                <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                    <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginBottom: '1rem', color: 'var(--brand-primary)' }}>
                        <Search size={32} />
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>Authenticating with Entra ID...</p>
                </div>
            ) : filteredDevices.length === 1 ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-panel"
                        style={{ width: '100%', maxWidth: '600px', padding: '3rem', position: 'relative', overflow: 'hidden' }}
                    >
                        {filteredDevices[0].isBreakGlass && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--status-error)' }} />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{ width: '80px', height: '80px', background: filteredDevices[0].isBreakGlass ? 'var(--status-error-bg)' : 'var(--brand-gradient)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                                {filteredDevices[0].type === 'server' ? <Server size={40} color={filteredDevices[0].isBreakGlass ? "var(--status-error)" : "white"} /> : <MonitorSmartphone size={40} color="white" />}
                            </div>
                            <h3 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{filteredDevices[0].name}</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}>
                                {filteredDevices[0].isBreakGlass ? (
                                    <span className="badge badge-error flex items-center gap-1"><AlertTriangle size={14} /> RESTRICTED SERVER</span>
                                ) : (
                                    <>Assigned Primary Device</>
                                )}
                            </p>

                            <div style={{ width: '100%', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-around', border: '1px solid var(--surface-border)' }}>
                                <div className="flex-col gap-2" style={{ alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>OS</span>
                                    <span style={{ fontWeight: 600 }}>{filteredDevices[0].os}</span>
                                </div>
                                <div className="flex-col gap-2" style={{ alignItems: 'center', borderLeft: '1px solid var(--surface-border)', borderRight: '1px solid var(--surface-border)', padding: '0 2rem' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Status</span>
                                    <span style={{ color: 'var(--status-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ width: '8px', height: '8px', background: 'var(--status-success)', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px var(--status-success)' }}></span>
                                        Online
                                    </span>
                                </div>
                                <div className="flex-col gap-2" style={{ alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Last Sync</span>
                                    <span style={{ fontWeight: 600 }}>{filteredDevices[0].lastSync}</span>
                                </div>
                            </div>

                            <button
                                className={`btn ${filteredDevices[0].isBreakGlass ? 'btn-danger' : 'btn-primary'}`}
                                style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', borderRadius: '12px' }}
                                onClick={() => setSelectedDevice(filteredDevices[0])}
                            >
                                {filteredDevices[0].isBreakGlass ? 'Request Break-Glass Access' : 'Request Local Admin Password'}
                                <Key size={20} style={{ marginLeft: '8px' }} />
                            </button>
                        </div>
                    </motion.div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    <AnimatePresence>
                        {filteredDevices.map(device => (
                            <motion.div
                                key={device.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                                className="glass-card"
                                style={{ display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer' }}
                                onClick={() => setSelectedDevice(device)}
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2" style={{ color: 'var(--brand-primary)' }}>
                                        {device.type === 'server' ? <Server size={24} /> : <MonitorSmartphone size={24} />}
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{device.name}</span>
                                    </div>
                                    {device.isBreakGlass && (
                                        <span className="badge badge-error flex items-center gap-1" style={{ fontSize: '0.65rem' }}>
                                            <AlertTriangle size={12} /> BREAK-GLASS
                                        </span>
                                    )}
                                </div>

                                <div className="flex-col gap-2 mb-6" style={{ flexGrow: 1 }}>
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--text-secondary)' }}>OS</span>
                                        <span style={{ fontWeight: 500 }}>{device.os}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mt-2">
                                        <span style={{ color: 'var(--text-secondary)' }}>Last Sync</span>
                                        <span>{device.lastSync}</span>
                                    </div>
                                </div>

                                <button className="btn btn-secondary w-full flex items-center justify-between group">
                                    Request Password
                                    <ChevronRight size={16} style={{ transition: 'transform 0.2s' }} />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {filteredDevices.length === 0 && (
                        <div className="glass-panel text-center" style={{ gridColumn: '1 / -1', padding: '3rem' }}>
                            <MonitorSmartphone size={48} color="var(--text-secondary)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                            <h3 style={{ marginBottom: '0.5rem' }}>No devices found</h3>
                            <p>We couldn't find any device matching "{searchTerm}"</p>
                        </div>
                    )}
                </div>
            )}

            {/* Modal / Request Panel overlay */}
            <AnimatePresence>
                {selectedDevice && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100 }}
                            onClick={closeModal}
                        />

                        <motion.div
                            initial={{ opacity: 0, y: 50, x: '-50%' }}
                            animate={{ opacity: 1, y: 0, x: '-50%' }}
                            exit={{ opacity: 0, y: 50, x: '-50%' }}
                            className="glass-panel"
                            style={{
                                position: 'fixed', left: '50%', top: '15%', width: '90%', maxWidth: '500px', zIndex: 101,
                                border: selectedDevice.isBreakGlass ? '1px solid var(--status-error)' : '1px solid var(--surface-border)'
                            }}
                        >
                            <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: 'var(--surface-border)' }}>
                                <div className="flex items-center gap-2">
                                    <Key size={20} color={selectedDevice.isBreakGlass ? "var(--status-error)" : "var(--brand-primary)"} />
                                    <h3 style={{ margin: 0 }}>Request Local Password</h3>
                                </div>
                                <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="mb-6">
                                <p style={{ marginBottom: '0.5rem' }}>Target Device:</p>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600 }}>{selectedDevice.name}</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{selectedDevice.os}</span>
                                </div>
                            </div>

                            {!passwordData ? (
                                <>
                                    {selectedDevice.isBreakGlass && (
                                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--status-error)', padding: '1rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
                                            <p style={{ color: 'var(--status-error)', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <AlertTriangle size={18} /> High Security Alert
                                            </p>
                                            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                                                This is a restricted server. Requesting this password triggers an immediate incident response alert on Slack and PagerDuty.
                                            </p>
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label htmlFor="reason">Business Justification (Required)</label>
                                        <textarea
                                            id="reason"
                                            rows={3}
                                            placeholder="e.g. Helpdesk Ticket INC12345 - Installing local drivers"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                        ></textarea>
                                        {reason.length > 0 && reason.length < 5 && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--status-warning)' }}>Reason must be at least 5 characters</span>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-4 mt-8">
                                        <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                        <button
                                            className={`btn ${selectedDevice.isBreakGlass ? 'btn-danger' : 'btn-primary'}`}
                                            onClick={handleRequestPassword}
                                            disabled={isRequesting || reason.length < 5}
                                        >
                                            {isRequesting ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span> Processing...
                                                </div>
                                            ) : (
                                                selectedDevice.isBreakGlass ? 'Confirm Break-Glass Access' : 'Reveal Password'
                                            )}
                                        </button>
                                    </div>
                                </>
                            ) : passwordData.error ? (
                                <div className="animate-fade-in text-center py-4">
                                    <div style={{ width: '48px', height: '48px', background: 'var(--status-error-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--status-error)' }}>
                                        <AlertTriangle size={24} />
                                    </div>
                                    <h4 style={{ color: 'var(--status-error)', marginBottom: '1rem' }}>Request Denied</h4>
                                    <p style={{ color: 'var(--text-secondary)' }}>{passwordData.error}</p>

                                    <button className="btn btn-secondary w-full mt-6" onClick={() => setPasswordData(null)}>
                                        Try Again
                                    </button>
                                </div>
                            ) : (
                                <div className="animate-fade-in text-center py-4">
                                    <div style={{ width: '48px', height: '48px', background: 'var(--status-success-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--status-success)' }}>
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <h4 style={{ color: 'var(--status-success)', marginBottom: '1rem' }}>Access Granted</h4>
                                    <p className="text-sm">Password retrieved securely from Entra ID.</p>

                                    <div className="password-box">
                                        <div className="password-text">{passwordData.password}</div>

                                        <button
                                            onClick={copyToClipboard}
                                            style={{
                                                position: 'absolute', right: '1rem', top: '1rem',
                                                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px',
                                                padding: '0.5rem', color: 'var(--text-primary)', cursor: 'pointer', transition: 'var(--transition-smooth)'
                                            }}
                                            title="Copy to clipboard"
                                        >
                                            {copied ? <CheckCircle2 size={16} color="var(--status-success)" /> : <Copy size={16} />}
                                        </button>

                                        <div className="progress-bar-container">
                                            <div className="progress-bar" style={{ width: '0%', transitionDuration: '30s' }}></div>
                                        </div>
                                    </div>

                                    <p className="text-sm mt-4" style={{ color: 'var(--status-warning)' }}>
                                        Auto-hiding in 30 seconds. Valid until {passwordData.validUntil}
                                    </p>

                                    <button className="btn btn-secondary w-full mt-6" onClick={closeModal}>
                                        Close & Clear Memory
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};

export default Dashboard;
