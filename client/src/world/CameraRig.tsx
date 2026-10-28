import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraMode } from '../../../shared/mission';

/** Where Follow mode should look: drone scene position and heading (radians, 0 = +Z). */
export interface FollowTarget {
  position: THREE.Vector3;
  heading: number;
}

// Overview matches the MG-002 default framing. Top-Down sits straight above the
// world centre; the tiny +Z offset keeps screen-up = -Z, so X runs right and Z
// runs down in both views (axes are never flipped between cameras).
const OVERVIEW = { position: new THREE.Vector3(0, 175, 215), target: new THREE.Vector3(0, 0, 0) };
const TOP_DOWN = { position: new THREE.Vector3(0, 290, 0.01), target: new THREE.Vector3(0, 0, 0) };
const FOLLOW_BACK = 38;
const FOLLOW_UP = 26;

interface Props {
  mode: CameraMode;
  follow?: MutableRefObject<FollowTarget | null>;
  /** Change to re-run the transition to the preset pose (the "Reset view" button). */
  resetKey?: number;
  /** Element that receives data-camera="x,y,z" a few times per second (for tests and debugging). */
  host?: RefObject<HTMLElement>;
}

export default function CameraRig({ mode, follow, resetKey, host }: Props) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const followTarget = useRef(new THREE.Vector3());
  const lastReport = useRef(0);

  useEffect(() => {
    if (!controls) return;
    controls.enabled = mode !== 'FOLLOW';
    controls.enableRotate = mode === 'OVERVIEW';
    goal.current = mode === 'OVERVIEW' ? OVERVIEW : mode === 'TOP_DOWN' ? TOP_DOWN : null;
    if (mode === 'FOLLOW') followTarget.current.copy(controls.target);
  }, [mode, resetKey, controls]);

  const desired = new THREE.Vector3();
  useFrame((state, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    if (mode === 'FOLLOW') {
      const t = follow?.current;
      const pos = t ? t.position : OVERVIEW.target;
      const heading = t ? t.heading : 0;
      // Trail behind and above the drone, looking at it.
      desired.set(pos.x - Math.sin(heading) * FOLLOW_BACK, pos.y + FOLLOW_UP, pos.z - Math.cos(heading) * FOLLOW_BACK);
      camera.position.lerp(desired, k);
      followTarget.current.lerp(pos, Math.min(1, k * 2));
      camera.lookAt(followTarget.current);
      if (controls) controls.target.copy(followTarget.current);
    } else if (goal.current && controls) {
      camera.position.lerp(goal.current.position, k);
      controls.target.lerp(goal.current.target, k);
      if (camera.position.distanceTo(goal.current.position) < 0.5 && controls.target.distanceTo(goal.current.target) < 0.5) goal.current = null;
      controls.update();
    }
    if (host?.current && state.clock.elapsedTime - lastReport.current > 0.25) {
      lastReport.current = state.clock.elapsedTime;
      const p = camera.position;
      host.current.setAttribute('data-camera', `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
    }
  });

  return null;
}
