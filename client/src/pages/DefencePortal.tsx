import WorldView from '../world/WorldView';
import PortalLayout from './PortalLayout';

export default function DefencePortal() {
  return (
    <PortalLayout team="blue" title="Blue Team — MineGuard Mission Control" subtitle="Defence portal">
      <WorldView />
    </PortalLayout>
  );
}
