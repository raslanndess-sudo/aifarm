'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu } from 'lucide-react';

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
    <div className="relative min-h-screen flex items-center justify-center bg-zinc-950">
      {/* Noise background */}
      <div className="absolute inset-0 noise-bg opacity-[0.03] pointer-events-none" />
      <div className="absolute inset-0 scanlines opacity-30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center mb-4">
            <Cpu className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">Content Matrix AI</h1>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm text-zinc-400 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-700/50 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-zinc-400 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-700/50 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center bg-red-500/10 rounded-lg py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-medium text-sm hover:from-purple-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
