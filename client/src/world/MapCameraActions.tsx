import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export interface MapCameraCommand {
  serial: number;
  action: 'ZOOM_IN' | 'ZOOM_OUT' | 'CENTRE';
}

/** DOM map buttons drive the SAME OrbitControls instance used for wheel,
 * trackpad, drag and touch. No second camera or separate room/world.
 */
export default function MapCameraActions({ command }: { command: MapCameraCommand }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    if (!controls || command.serial === 0 || !controls.enabled) return;
    // Cancel the animated camera preset before any manual adjustment.
    controls.dispatchEvent({ type: 'start' });
    if (command.action === 'CENTRE') {
      controls.target.set(0, 0, 0);
      camera.position.set(0, 290, 0.01);
      camera.lookAt(controls.target);
    } else {
      const fromTarget = camera.position.clone().sub(controls.target);
      const next = Math.min(340, Math.max(5, fromTarget.length() *
        (command.action === 'ZOOM_IN' ? 0.55 : 1 / 0.55)));
      camera.position.copy(controls.target).add(fromTarget.normalize().multiplyScalar(next));
    }
    controls.update();
  }, [camera, controls, command]);

  return null;
}
