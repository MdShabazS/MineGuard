import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol.js';
import type { RoomRecord, RoomStore } from './store.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Two Socket.IO channels per room. Red sockets join only the private channel,
// Blue sockets only the public one, so a broadcast can never cross roles.
const publicChannel = (room: RoomRecord) => `pub:${room.id}`;
const attackerChannel = (room: RoomRecord) => `red:${room.id}`;

export function attachRoomRealtime(io: IO, store: RoomStore) {
  io.on('connection', (socket: ClientSocket) => {
    let joined: string | null = null;

    const leave = () => {
      if (joined) socket.leave(joined);
      joined = null;
    };

    socket.on('room:join', (req, ack) => {
      if (typeof ack !== 'function') return;
      leave();
      const room = store.findRoom(req?.roomCode);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND', message: 'Room not found.' });

      if (req.attackerToken !== undefined) {
        if (!store.verifyAttacker(room, req.attackerToken)) {
          return ack({ ok: false, error: 'ATTACKER_AUTH_REQUIRED', message: 'A valid private attacker link is required.' });
        }
        joined = attackerChannel(room);
        socket.join(joined);
        return ack({ ok: true, role: 'attacker', snapshot: store.attackerSnapshot(room) });
      }

      joined = publicChannel(room);
      socket.join(joined);
      ack({ ok: true, role: 'defender', snapshot: store.publicSnapshot(room) });
    });

    socket.on('room:leave', leave);
  });

  return {
    changed(room: RoomRecord) {
      io.to(attackerChannel(room)).emit('room:attacker-snapshot', store.attackerSnapshot(room));
      io.to(publicChannel(room)).emit('room:public-snapshot', store.publicSnapshot(room));
    },
  };
}
