import { EventEmitter } from 'events';
import SevaType from '../../models/SevaType.js';

// Live check-in events for the hall screens: every scan at the entrance (let in or not) is
// passed to the open hall screens within a second, over /bookings/hall-events.
// The server runs as one process, so an in-memory channel is enough.

const bus = new EventEmitter();
bus.setMaxListeners(500);   // one per open hall screen

/** Subscribe; returns the unsubscribe function. */
export const onHallEvent = (fn) => {
  bus.on('event', fn);
  return () => bus.off('event', fn);
};

/**
 * Tells the hall screens about a scan or an undo. `r` is the check-in answer
 * ({ result, checkedIn, booking }); only what the TV shows is sent — names, never phone numbers.
 */
export async function publishHallEvent(type, r, { entrance = '' } = {}) {
  const b = r?.booking;
  if (!b || !bus.listenerCount('event')) return;
  const seva = b.sevaType ? await SevaType.findById(b.sevaType).select('nameMr').lean() : null;
  bus.emit('event', {
    type, at: new Date(), result: r.result || '', checkedIn: Boolean(r.checkedIn), entrance: String(entrance || ''),
    booking: {
      _id: b._id, serialNo: b.serialNo ?? null, name: b.devotee?.name || '', people: b.peopleCount || 1,
      sevaName: b.sevaName, sevaNameMr: seva?.nameMr || '', batchLabel: b.batchLabel || '', hall: b.hall || '',
      dateKey: b.dateKey || null, checkedInAt: b.checkedInAt || null,
    },
  });
}
