import React from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, LayoutDashboard, History, LogOut } from 'lucide-react';
import { useMsal } from '@azure/msal-react';

const Navigation = () => {
    const { instance, accounts } = useMsal();
    const account = accounts[0];

    const displayName = account?.name || account?.username || 'User';
    const email = account?.username || '';
    const initials = displayName
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const handleLogout = () => {
        instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
    };

    return (
        <header className="app-header">
            <div className="header-content">
                <NavLink to="/dashboard" className="brand">
                    <Shield size={28} color="var(--brand-primary)" />
                    <span>LAPS <span style={{ color: 'var(--brand-primary)' }}>Portal</span></span>
                </NavLink>

                <nav className="nav-links">
                    <NavLink
                        to="/dashboard"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <LayoutDashboard size={18} />
                        My Devices
                    </NavLink>

                    <NavLink
                        to="/admin"
                        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <History size={18} />
                        Audit Logs
                    </NavLink>
                </nav>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{displayName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{email}</div>
                    </div>
                    <div className="avatar" title={displayName}>{initials}</div>
                    <button
                        onClick={handleLogout}
                        title="Sign out"
                        style={{
                            background: 'none',
                            border: '1px solid var(--surface-border)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'var(--transition-smooth)'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--status-error)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Navigation;
