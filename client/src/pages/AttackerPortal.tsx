import PortalLayout from './PortalLayout';

export default function AttackerPortal() {
  return (
    <PortalLayout team="red" title="Red Team — Scenario Builder" subtitle="Attacker portal">
      <section className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">
        The shared 3D world (MG-002) and room / hazard placement controls (MG-004) will appear here.
      </section>
    </PortalLayout>
  );
}
