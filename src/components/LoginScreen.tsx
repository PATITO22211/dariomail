import { useState } from 'react';

interface LoginScreenProps {
  pending: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
}

export function LoginScreen({ pending, error, onSubmit }: LoginScreenProps) {
  const [password, setPassword] = useState('');

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--canvas-bg)] text-[var(--ink-primary)] px-6">
      <form
        className="w-full max-w-[420px] floating-monolith rounded-3xl px-8 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onSubmit(password);
        }}
      >
        <p className="text-[12px] font-medium tracking-[0.16em] uppercase text-[var(--accent)]">
          DarioMail
        </p>
        <h1
          className="mt-3 text-[36px] font-normal tracking-[-0.02em] text-[var(--ink-primary)]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          Entra a tu correo
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-secondary)]">
          La clave es solo de esta bandeja.
        </p>

        <label className="mt-7 block text-[12px] font-medium text-[var(--ink-muted)]" htmlFor="login-password">
          Clave
        </label>
        <input
          id="login-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="precision-input mt-2 w-full rounded-2xl px-4 py-3 text-[15px] text-[var(--ink-primary)] outline-none"
        />

        {error && (
          <p className="mt-3 text-[13px] text-[var(--accent)]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || password.trim().length === 0}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-[13.5px] font-medium text-[#fbf8f2] disabled:opacity-50 sacred-focus cursor-pointer"
        >
          {pending ? 'Entrando' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
