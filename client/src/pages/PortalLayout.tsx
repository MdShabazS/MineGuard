import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import StatusPanel from './StatusPanel';

interface Props {
  team: 'red' | 'blue';
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function PortalLayout({ team, title, subtitle, children }: Props) {
  const accent = team === 'red' ? 'border-rose-500/60' : 'border-sky-500/60';
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
        ← MineGuard home
      </Link>
      <header className={`mt-4 border-l-4 pl-4 ${accent}`}>
        <h1 className="text-2xl font-semibold" data-testid="portal-title">
          {title}
        </h1>
        <p className="text-slate-400">{subtitle}</p>
      </header>
      <div className="mt-6 grid gap-4">
        {children}
        <StatusPanel />
      </div>
    </main>
  );
}
