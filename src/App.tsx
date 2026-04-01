import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { loginRequest } from './auth/msalConfig';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import { Shield, LogIn } from 'lucide-react';

function LoginPage() {
    const { instance } = useMsal();

    const handleLogin = () => {
        instance.loginRedirect(loginRequest);
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '2rem'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '80px', height: '80px',
                    background: 'var(--brand-gradient)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem',
                    boxShadow: '0 10px 40px rgba(14, 165, 233, 0.3)'
                }}>
                    <Shield size={40} color="white" />
                </div>
                <h1 style={{ marginBottom: '0.5rem' }}>
                    LAPS <span style={{ color: 'var(--brand-primary)' }}>Portal</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px' }}>
                    Secure access to Local Administrator Password Solution.
                    Sign in with your company account to continue.
                </p>
            </div>

            <button
                className="btn btn-primary"
                onClick={handleLogin}
                style={{ padding: '1rem 2.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
                <LogIn size={20} />
                Sign in with Microsoft
            </button>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                Protected by Microsoft Entra ID
            </p>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <AuthenticatedTemplate>
                <div className="min-h-screen bg-transparent flex flex-col">
                    <Navigation />
                    <main className="flex-1">
                        <Routes>
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/admin" element={<Admin />} />
                            <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                    </main>
                </div>
            </AuthenticatedTemplate>
            <UnauthenticatedTemplate>
                <LoginPage />
            </UnauthenticatedTemplate>
        </BrowserRouter>
    );
}

export default App;
