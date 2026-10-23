import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { inputClass, primaryButtonClass } from '../components/ui/styles';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const { token, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/boards';
  if (token) return <Navigate to={from} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  const isLogin = mode === 'login';
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-sky-600 to-indigo-700 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-xl dark:bg-slate-800">
        <h1 className="text-center text-3xl font-bold tracking-tight text-sky-700 dark:text-sky-400">
          Flowboard
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {!isLogin && (
            <input
              className={inputClass}
              placeholder="Nome"
              aria-label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={inputClass}
            type="password"
            placeholder="Senha"
            aria-label="Senha"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={isLogin ? undefined : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
            {submitting ? 'Aguarde…' : isLogin ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
          <Link
            to={isLogin ? '/register' : '/login'}
            state={location.state}
            className="font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            {isLogin ? 'Cadastre-se' : 'Entrar'}
          </Link>
        </p>
        {import.meta.env.DEV && isLogin && (
          <p className="mt-4 rounded-md bg-slate-100 p-2 text-center text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            Dev (seed): admin@flowboard.local / admin123
          </p>
        )}
      </div>
    </div>
  );
}
