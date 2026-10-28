import { Link } from 'react-router-dom';
import { APP_NAME } from '../../../shared/protocol';
import StatusPanel from './StatusPanel';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{APP_NAME}</h1>
      <p className="mt-2 text-slate-400">
        Red Team / Blue Team aerial survey digital twin. Educational simulator only: no real mine detection.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link to="/red" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 hover:bg-rose-500/20">
          <div className="text-lg font-semibold text-rose-300">Red Team</div>
          <div className="mt-1 text-sm text-slate-300">Attacker portal: place virtual hazards and decoys</div>
        </Link>
        <Link to="/blue" className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-5 hover:bg-sky-500/20">
          <div className="text-lg font-semibold text-sky-300">Blue Team</div>
          <div className="mt-1 text-sm text-slate-300">Defence portal: plan and fly the virtual drone survey</div>
        </Link>
      </div>

      <div className="mt-8">
        <StatusPanel />
      </div>
    </main>
  );
}
