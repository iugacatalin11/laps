import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Download, Filter, Search, ShieldCheck } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../auth/msalConfig';

const Admin = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const { instance, accounts } = useMsal();

    const getToken = async () => {
        const request = { ...loginRequest, account: accounts[0] };
        const response = await instance.acquireTokenSilent(request);
        return response.accessToken;
    };

    useEffect(() => {
        const loadLogs = async () => {
            try {
                const token = await getToken();
                const res = await fetch('/api/audit', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setLogs(data);
                setIsLoading(false);
            } catch (err) {
                console.error("Failed to load audit logs", err);
                setIsLoading(false);
            }
        };
        loadLogs();
    }, []);

    const filteredLogs = logs.filter(log =>
        log.device?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const exportCSV = () => {
        const headers = ['Date', 'User', 'Email', 'Device', 'Status', 'IP', 'Justification', 'Details'];
        const rows = filteredLogs.map(l => [
            l.date, l.user, l.userEmail, l.device, l.status, l.ip,
            `"${(l.reason || '').replace(/"/g, '""')}"`,
            `"${(l.details || '').replace(/"/g, '""')}"`
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laps-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Detect suspicious: same user >3 requests in 10 minutes
    const suspiciousUsers = new Set(
        Object.entries(
            logs.reduce((acc: Record<string, number[]>, l) => {
                if (l.status === 'SUCCESS') {
                    if (!acc[l.userEmail]) acc[l.userEmail] = [];
                    acc[l.userEmail].push(new Date(l.date).getTime());
                }
                return acc;
            }, {})
        )
        .filter(([, times]) => {
            const sorted = (times as number[]).sort((a, b) => b - a);
            for (let i = 0; i < sorted.length - 2; i++) {
                if (sorted[i] - sorted[i + 2] < 10 * 60 * 1000) return true;
            }
            return false;
        })
        .map(([email]) => email)
    );

    return (
        <div className="container animate-fade-in pt-8">
            {suspiciousUsers.size > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--status-error)', borderRadius: '12px', padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldAlert size={20} color="var(--status-error)" />
                    <div>
                        <strong style={{ color: 'var(--status-error)' }}>Suspicious activity detected</strong>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Users with 3+ password requests in 10 min: {[...suspiciousUsers].join(', ')}
                        </p>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2>Audit & Forensics</h2>
                    <p>{logs.length} total records — persistent across restarts</p>
                </div>

                <div className="flex gap-4">
                    <button className="btn btn-secondary text-sm">
                        <Filter size={16} /> Filters
                    </button>
                    <button className="btn btn-secondary text-sm" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }} onClick={exportCSV}>
                        <Download size={16} /> Export CSV
                    </button>
                </div>
            </div>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="glass-panel"
                style={{ padding: '0', overflowX: 'auto' }}
            >
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Search size={16} color="var(--text-secondary)" />
                    <input
                        type="text"
                        placeholder="Search by User or Device..."
                        value={searchTerm}
                        style={{ border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date / Time</th>
                            <th>User (UPN)</th>
                            <th>Device / Hostname</th>
                            <th>Status</th>
                            <th>IP Origin</th>
                            <th>Justification</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                                    <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginBottom: '1rem', color: 'var(--brand-primary)' }}>
                                        <Search size={24} />
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)' }}>Loading logs securely...</p>
                                </td>
                            </tr>
                        ) : filteredLogs.map(log => (
                            <tr key={log.id} style={suspiciousUsers.has(log.userEmail) ? { background: 'rgba(239,68,68,0.05)' } : {}}>
                                <td style={{ fontSize: '0.875rem' }}>{log.date}</td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <div style={{ width: '24px', height: '24px', background: suspiciousUsers.has(log.userEmail) ? 'rgba(239,68,68,0.2)' : 'var(--surface-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                            {log.user?.charAt(0)}
                                        </div>
                                        <div>
                                            <div>{log.user}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.userEmail}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ fontWeight: 500 }}>{log.device}</td>
                                <td>
                                    {log.status === 'SUCCESS' && <span className="badge badge-success flex items-center gap-1 w-max"><ShieldCheck size={12} /> Granted</span>}
                                    {log.status === 'DENIED' && <span className="badge badge-error flex items-center gap-1 w-max"><ShieldAlert size={12} /> Denied</span>}
                                    {log.status === 'ERROR' && <span className="badge flex items-center gap-1 w-max" style={{ background: 'var(--status-warning)', color: '#000' }}><ShieldAlert size={12} /> Error</span>}
                                </td>
                                <td style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{log.ip}</td>
                                <td style={{ fontSize: '0.875rem', maxWidth: '300px' }}>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.reason}>
                                        {log.reason}
                                    </div>
                                    {log.details && (
                                        <div style={{ color: 'var(--status-error)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                            {log.details}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {!isLoading && filteredLogs.length === 0 && (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <p>No audit records found.</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Admin;
