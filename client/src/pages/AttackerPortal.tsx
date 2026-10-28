import WorldView from '../world/WorldView';
import PortalLayout from './PortalLayout';

export default function AttackerPortal() {
  return (
    <PortalLayout team="red" title="Red Team — Scenario Builder" subtitle="Attacker portal">
      <WorldView />
    </PortalLayout>
  );
}
