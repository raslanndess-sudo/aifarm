'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
      {/* Content — above noise overlay */}
      <div className="relative z-[1] w-full max-w-lg px-6 text-center">
        {/* Eyebrow */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          letterSpacing: '0.20em',
          textTransform: 'uppercase',
          color: 'rgba(245,230,211,0.3)',
          display: 'block',
          marginBottom: '32px',
        }}>
          The Studio
        </span>

        {/* Title */}
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontStyle: 'italic',
          fontSize: '64px',
          lineHeight: 0.95,
          letterSpacing: '-0.03em',
          color: '#f5e6d3',
          marginBottom: '16px',
        }}>
          Welcome to the <em style={{ color: '#ff3344', fontStyle: 'italic' }}>studio</em>.
        </h1>

        {/* Sub */}
        <p style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '16px',
          fontStyle: 'italic',
          color: 'rgba(245,230,211,0.45)',
          marginBottom: '48px',
        }}>
          Sign in to direct what hasn&apos;t yet been imagined.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="text-left max-w-sm mx-auto">
          <div className="mb-6">
            <label htmlFor="username" className="section-label block mb-2">Operator Handle</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="input-inline w-full"
              style={{ fontSize: '15px', padding: '12px 0' }}
              placeholder="admin"
            />
          </div>

          <div className="mb-8">
            <label htmlFor="password" className="section-label block mb-2">Master Key</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="input-inline w-full"
              style={{ fontSize: '15px', padding: '12px 0' }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="reel-error-row mb-6">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: '18px', padding: '16px 32px', justifyContent: 'center' }}
          >
            {loading ? 'Signing in\u2026' : <>Take the <em>first</em> take &rarr;</>}
          </button>
        </form>
      </div>

      {/* Corner badge */}
      <span
        className="badge absolute bottom-6 right-6 z-[1]"
        style={{ color: 'rgba(245,230,211,0.2)', borderColor: 'rgba(245,230,211,0.1)' }}
      >
        Runtime &middot; Private &middot; v3
      </span>
    </div>
  );
}
