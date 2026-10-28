import PortalLayout from './PortalLayout';

export default function DefencePortal() {
  return (
    <PortalLayout team="blue" title="Blue Team — MineGuard Mission Control" subtitle="Defence portal">
      <section className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">
        The shared 3D world (MG-002) and mission planning / virtual drone controls (MG-007) will appear here.
      </section>
    </PortalLayout>
  );
}
