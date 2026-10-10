'use client';

import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, AlertCircle } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth');
        if (res.ok) {
          const data = await res.json();
          if (data.required && !data.authenticated) {
            setAuthenticated(false);
          } else {
            setAuthenticated(true);
          }
        }
      } catch {
        setAuthenticated(true);
      } finally {
        setChecking(false);
      }
    }
    checkAuth();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
      } else {
        setError(data.error || 'Неверный пароль доступа');
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return <div className="min-h-screen bg-[#090a0f]" />;
  }

  if (!authenticated) {
    return (
      <div className="fixed inset-0 z-50 bg-[#090a0f] flex items-center justify-center p-4">
        <div className="bg-[#13151f] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center mx-auto mb-6 text-red-500">
            <Lock className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-black text-white mb-2">Приватный кинозал</h2>
          <p className="text-xs text-gray-400 mb-6">
            Доступ открыт только для владельца и друзей. Введите пароль сайта для продолжения.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль доступа..."
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 text-sm"
              />
              <KeyRound className="w-4 h-4 text-gray-400 absolute left-4 top-3.5" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-500/30 text-left">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm cursor-pointer shadow-lg shadow-red-600/30"
            >
              {submitting ? 'Проверка...' : 'Войти в кинотеатр'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
