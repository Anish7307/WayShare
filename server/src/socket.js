import { Server } from 'socket.io';
import { resolveUserFromCookie } from './auth.js';
import { Ride, Booking, LiveLocation } from './models.js';
import { config } from './config.js';
import { validLocationPayload } from './validation.js';

export function attachSocket(server) {
  const io = new Server(server, { cors: { origin: config.clientOrigin, credentials: true } });
  io.use(async (socket, next) => {
    const user = await resolveUserFromCookie(socket.handshake.headers.cookie || '');
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', socket => {
    socket.data.lastUpdateAt = 0;
    socket.data.rideRooms = new Set();

    socket.on('trip:subscribe', async ({ rideId } = {}, ack = () => {}) => {
      try {
        if (!rideId || typeof rideId !== 'string' || rideId.length > 64) return ack({ ok: false, error: 'Invalid ride ID' });
        const ride = await Ride.findById(rideId);
        if (!ride) return ack({ ok: false, error: 'Ride not found' });
        const isDriver = String(ride.driver) === String(socket.data.user._id);
        const isPassenger = await Booking.exists({ ride: ride._id, passenger: socket.data.user._id, status: 'confirmed' });
        if (!isDriver && !isPassenger) return ack({ ok: false, error: 'Not authorized for this trip' });
        if (ride.status !== 'active' || !ride.sharingActive) return ack({ ok: true, sharingActive: false });
        const room = `trip:${ride._id}`;
        await socket.join(room);
        socket.data.rideRooms.add(String(ride._id));
        const location = await LiveLocation.findOne({ ride: ride._id }).lean();
        ack({ ok: true, sharingActive: true, location });
      } catch { ack({ ok: false, error: 'Unable to subscribe to trip' }); }
    });

    socket.on('trip:unsubscribe', ({ rideId } = {}, ack = () => {}) => {
      if (typeof rideId === 'string') {
        socket.leave(`trip:${rideId}`);
        socket.data.rideRooms.delete(rideId);
      }
      ack({ ok: true });
    });

    socket.on('driver:location', async (payload = {}, ack = () => {}) => {
      try {
        const { rideId, ...coords } = payload;
        if (!rideId || !socket.data.rideRooms.has(String(rideId))) return ack({ ok: false, error: 'Subscribe to your authorized active trip first' });
        if (!validLocationPayload(coords)) return ack({ ok: false, error: 'Invalid GPS coordinates or metadata' });
        const now = Date.now();
        if (now - socket.data.lastUpdateAt < config.locationMinInterval) return ack({ ok: false, throttled: true, error: 'Updates are arriving too quickly' });
        const ride = await Ride.findById(rideId);
        if (!ride || String(ride.driver) !== String(socket.data.user._id) || ride.status !== 'active' || !ride.sharingActive) {
          socket.leave(`trip:${rideId}`); socket.data.rideRooms.delete(String(rideId));
          return ack({ ok: false, error: 'Driver is not authorized to share this trip' });
        }
        if (coords.accuracy != null && coords.accuracy > config.maxLocationAccuracy) return ack({ ok: false, error: 'GPS accuracy is too low; waiting for a better fix' });
        const timestamp = coords.timestamp ? new Date(coords.timestamp) : new Date();
        if (Number.isNaN(timestamp.getTime()) || Math.abs(now - timestamp.getTime()) > 120000) return ack({ ok: false, error: 'Invalid or stale GPS timestamp' });
        const location = await LiveLocation.findOneAndUpdate(
          { ride: ride._id },
          { $set: { ride: ride._id, driver: ride.driver, latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, heading: coords.heading, speed: coords.speed, updatedAt: timestamp } },
          { upsert: true, new: true, runValidators: true }
        ).lean();
        socket.data.lastUpdateAt = now;
        io.to(`trip:${ride._id}`).emit('trip:location', {
          latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy,
          heading: location.heading, speed: location.speed, updatedAt: location.updatedAt
        });
        ack({ ok: true });
      } catch { ack({ ok: false, error: 'Unable to accept location update' }); }
    });
  });
  return io;
}
