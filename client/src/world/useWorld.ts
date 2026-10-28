import { useEffect, useState } from 'react';
import { worldChecksum, type WorldDefinition } from '../../../shared/world';

export type WorldState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; world: WorldDefinition };

/** Loads the shared world from the server and verifies its checksum. */
export function useWorld(): WorldState {
  const [state, setState] = useState<WorldState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/world')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WorldDefinition>;
      })
      .then((world) => {
        const { checksum, ...rest } = world;
        if (worldChecksum(rest) !== checksum) throw new Error('World checksum mismatch');
        if (!cancelled) setState({ status: 'ready', world });
      })
      .catch((err: Error) => !cancelled && setState({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
