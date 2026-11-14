import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Ride, Booking, LiveLocation, ChatMessage } from './models.js';
import { config } from './config.js';
import { cookieOptions, requireAuth, signToken } from './auth.js';
import { validPoint } from './validation.js';
import { distanceKm } from './geo.js';
import { createHash, randomBytes } from 'node:crypto';
import { sendVerificationEmail } from './emailVerification.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'vehicle-pooling-api' }));

const publicUser = u => ({ id: String(u._id), name: u.name, email: u.email, emailVerified: Boolean(u.emailVerified), phone: u.phone || '', role: u.role });
const hashToken = token => createHash('sha256').update(token).digest('hex');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/auth/register', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 }), asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(200), phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/), password: z.string().min(8).max(100) }).parse(req.body);
  const email = data.email.toLowerCase();
  if (await User.findOne({ phone: data.phone })) return res.status(409).json({ error: 'This mobile number is already registered.' });
  if (await User.findOne({ email })) return res.status(409).json({ error: 'An account with this email already exists. Try logging in or contact support if you have not verified it.' });
  const token = randomBytes(32).toString('hex');
  const user = await User.create({ name: data.name, email, phone: data.phone, emailVerified: false, emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: new Date(Date.now() + 30 * 60 * 1000), passwordHash: await bcrypt.hash(data.password, 12) });
  try {
    await sendVerificationEmail({ to: email, name: user.name, token });
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
  res.status(201).json({ ok: true, message: 'Account created. Open the verification link sent to your email to activate your account. The link expires in 30 minutes.' });
}));
app.get('/api/auth/verify-email', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), asyncRoute(async (req, res) => {
  const token = z.string().length(64).parse(String(req.query.token || ''));
  const user = await User.findOne({ emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: 'This verification link is invalid or expired. Request a new verification email.' });
  user.emailVerified = true;
  user.emailVerificationTokenHash = '';
  user.emailVerificationExpiresAt = null;
  await user.save();
  res.cookie('vp_token', signToken(user), cookieOptions()).json({ ok: true, user: publicUser(user), message: 'Email verified. Your WayShare account is active.' });
}));
app.post('/api/auth/resend-verification', rateLimit({ windowMs: 15 * 60 * 1000, limit: 3 }), asyncRoute(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().email().max(200) }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && !user.emailVerified) {
    const token = randomBytes(32).toString('hex');
    user.emailVerificationTokenHash = hashToken(token);
    user.emailVerificationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    await sendVerificationEmail({ to: user.email, name: user.name, token });
  }
  res.json({ ok: true, message: 'If the account exists and needs verification, a new link has been sent.' });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const data = z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/), password: z.string().min(1).max(100) }).parse(req.body);
  const user = await User.findOne({ phone: data.phone });
  if (!user || !user.emailVerified || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: user && !user.emailVerified ? 'Please verify your email using the link we sent before logging in.' : 'Invalid mobile number or password.' });
  res.cookie('vp_token', signToken(user), cookieOptions()).json({ user: publicUser(user) });
}));
app.post('/api/auth/logout', (_req, res) => res.clearCookie('vp_token', { ...cookieOptions(), maxAge: undefined }).json({ ok: true }));
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/auth/phone', requireAuth, asyncRoute(async (req, res) => {
  const { phone } = z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Enter a phone number in international format, e.g. +919876543210') }).parse(req.body);
  const existing = await User.findOne({ phone, _id: { $ne: req.user._id } });
  if (existing) return res.status(409).json({ error: 'This mobile number is already registered.' });
  req.user.phone = phone;
  await req.user.save();
  res.json({ ok: true, message: 'Mobile number updated. It is shared with the other participant only after a booking is confirmed.', user: publicUser(req.user) });
}));

app.get('/api/rides', asyncRoute(async (req, res) => {
  const filter = { status: { $in: ['open', 'active'] }, seatsAvailable: { $gt: 0 } };
  const hasNear = req.query.nearLat !== undefined || req.query.nearLon !== undefined;
  let radiusKm = 25;
  if (hasNear) {
    const lat = Number(req.query.nearLat), lon = Number(req.query.nearLon);
    radiusKm = Number(req.query.radiusKm || 25);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100) return res.status(400).json({ error: 'Invalid current-location search or radius (1–100 km).' });
  }
  const rows = await Ride.find(filter).populate('driver', 'name').sort({ departureAt: 1 }).limit(500);
  let rides = rows.map(row => { const item = row.toObject(); if (item.vehicle) delete item.vehicle.registration; if (hasNear) item.distanceFromCurrentKm = distanceKm({lat:Number(req.query.nearLat),lon:Number(req.query.nearLon)}, item.origin); return item; });
  if (hasNear) rides = rides.filter(r => Number.isFinite(r.distanceFromCurrentKm) && r.distanceFromCurrentKm <= radiusKm).sort((a,b) => a.distanceFromCurrentKm-b.distanceFromCurrentKm || new Date(a.departureAt)-new Date(b.departureAt));
  res.json({ rides, search: hasNear ? { radiusKm, nearby: true } : { nearby: false } });
}));
app.post('/api/rides', requireAuth, asyncRoute(async (req, res) => {
  if (!req.user.phone) return res.status(403).json({ error: 'Add a mobile number before offering a ride.' });
  const schema = z.object({
    origin: z.any(), destination: z.any(), departureAt: z.string().datetime(),
    seatsTotal: z.number().int().min(1).max(8), totalFare: z.number().min(0).max(100000), pricePerSeat: z.number().min(0).max(100000).optional().default(0),
    notes: z.string().max(500).optional().default(''), route: z.any().optional(),
    vehicle: z.object({ make: z.string().trim().max(60).optional().default(''), model: z.string().trim().max(60).optional().default(''), color: z.string().trim().max(40).optional().default(''), registration: z.string().trim().max(30).optional().default('') }).optional().default({})
  });
  const data = schema.parse(req.body);
  if (!validPoint(data.origin) || !validPoint(data.destination)) return res.status(400).json({ error: 'Choose and confirm valid pickup and destination points' });
  if (new Date(data.departureAt) <= new Date()) return res.status(400).json({ error: 'Departure must be in the future' });
  const route = data.route && Array.isArray(data.route.coordinates) ? {
    coordinates: data.route.coordinates.slice(0, 10000).filter(pair => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]) && pair[0] >= -180 && pair[0] <= 180 && pair[1] >= -90 && pair[1] <= 90),
    distanceMeters: Number.isFinite(data.route.distanceMeters) ? data.route.distanceMeters : undefined,
    durationSeconds: Number.isFinite(data.route.durationSeconds) ? data.route.durationSeconds : undefined,
    provider: typeof data.route.provider === 'string' ? data.route.provider.slice(0, 50) : undefined,
    updatedAt: new Date()
  } : undefined;
  const ride = await Ride.create({ driver: req.user._id, origin: data.origin, destination: data.destination, vehicle: data.vehicle, departureAt: new Date(data.departureAt), seatsTotal: data.seatsTotal, seatsAvailable: data.seatsTotal, totalFare: data.totalFare, pricePerSeat: data.totalFare / data.seatsTotal, notes: data.notes, route });
  res.status(201).json({ ride });
}));
app.get('/api/rides/mine', requireAuth, asyncRoute(async (req, res) => {
  const [rides, bookings] = await Promise.all([
    Ride.find({ driver: req.user._id }).sort({ departureAt: -1 }),
    Booking.find({ passenger: req.user._id }).populate({ path: 'ride', populate: { path: 'driver', select: 'name' } }).sort({ createdAt: -1 })
  ]);
  res.json({ rides, bookings });
}));
app.get('/api/rides/:id', requireAuth, asyncRoute(async (req, res) => {
  const ride = await Ride.findById(req.params.id).populate('driver', 'name email phone phoneVerified');
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const isDriver = String(ride.driver._id || ride.driver) === String(req.user._id);
  const booking = isDriver ? null : await Booking.findOne({ ride: ride._id, passenger: req.user._id });
  const isConfirmedPassenger = booking?.status === 'confirmed';
  const rideData = ride.toObject();
  if (!isDriver && !isConfirmedPassenger && rideData.driver) { delete rideData.driver.email; delete rideData.driver.phone; }
  if (rideData.driver) delete rideData.driver.phoneVerified;
  if (!isDriver && !isConfirmedPassenger && rideData.vehicle) delete rideData.vehicle.registration;

  let bookings = [];
  if (isDriver) {
    const rows = await Booking.find({ ride: ride._id }).populate('passenger', 'name email phone phoneVerified').sort({ createdAt: -1 });
    bookings = rows.map(row => {
      const item = row.toObject();
      if (item.status !== 'confirmed' && item.passenger) { delete item.passenger.email; delete item.passenger.phone; }
      if (item.passenger) delete item.passenger.phoneVerified;
      return item;
    });
  }
  res.json({ ride: rideData, booking, bookings, permissions: { isDriver, isConfirmedPassenger } });
}));
async function recalculateRideFares(rideId) {
  const ride = await Ride.findById(rideId);
  if (!ride) return;
  const bookings = await Booking.find({ ride: rideId, status: 'confirmed' }).sort({ pickupDistanceKm: 1, createdAt: 1 });
  if (!bookings.length) return;
  const fullDistance = Math.max(0.1, Number(ride.route?.distanceMeters || distanceKm(ride.origin, ride.destination) * 1000) / 1000);
  const points = [...new Set([0, ...bookings.map(b => Math.max(0, Math.min(fullDistance, Number(b.pickupDistanceKm || 0)))), fullDistance])].sort((a, b) => a - b);
  const totals = new Map(bookings.map(b => [String(b._id), 0]));
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], to = points[i + 1];
    if (to <= from) continue;
    const onboard = bookings.filter(b => Number(b.pickupDistanceKm || 0) <= from + 0.0001);
    const seatsOnboard = onboard.reduce((sum, b) => sum + b.seats, 0);
    if (!seatsOnboard) continue;
    const segmentCost = Number(ride.totalFare || 0) * ((to - from) / fullDistance);
    for (const booking of onboard) totals.set(String(booking._id), totals.get(String(booking._id)) + segmentCost * booking.seats / seatsOnboard);
  }
  await Promise.all(bookings.map(b => Booking.updateOne({ _id: b._id }, { $set: { fare: Math.round((totals.get(String(b._id)) || 0) * 100) / 100 } })));
}

app.post('/api/rides/:id/bookings', requireAuth, asyncRoute(async (req, res) => {
  if (!req.user.phone) return res.status(403).json({ error: 'Add a mobile number before requesting a ride.' });
  const requestData = z.object({ seats: z.number().int().min(1).max(8).default(1), paymentMethod: z.enum(['cash', 'upi']).default('cash'), pickup: z.any() }).parse(req.body);
  const seats = requestData.seats;
  const ride = await Ride.findById(req.params.id);
  if (!ride || !['open', 'active'].includes(ride.status) || (ride.status === 'open' && ride.departureAt <= new Date())) return res.status(404).json({ error: 'Ride is not available' });
  if (String(ride.driver) === String(req.user._id)) return res.status(400).json({ error: 'You cannot book your own ride' });
  if (ride.seatsAvailable < seats) return res.status(400).json({ error: 'Not enough seats available' });
  if (!validPoint(requestData.pickup)) return res.status(400).json({ error: 'Choose a valid pickup point on the journey.' });
  const directTotal = distanceKm(ride.origin, ride.destination);
  const directPickup = distanceKm(ride.origin, requestData.pickup);
  if (!Number.isFinite(directTotal) || directTotal <= 0 || directPickup > directTotal * 1.25) return res.status(400).json({ error: 'Pickup must be on or near the driver route.' });
  const totalDistanceKm = Math.max(0.1, Number(ride.route?.distanceMeters || directTotal * 1000) / 1000);
  const pickupDistanceKm = Math.min(totalDistanceKm, Math.max(0, directPickup / directTotal * totalDistanceKm));
  if (ride.status === 'active') {
    const live = await LiveLocation.findOne({ ride: ride._id });
    if (live) {
      const currentPoint = { lat: live.latitude, lon: live.longitude };
      const currentDirect = distanceKm(ride.origin, currentPoint);
      const currentDistanceKm = Math.max(0, Math.min(totalDistanceKm, currentDirect / directTotal * totalDistanceKm));
      if (pickupDistanceKm + 0.2 < currentDistanceKm) return res.status(400).json({ error: 'Choose a pickup point ahead of the driver’s current location.' });
    }
  }

  const existing = await Booking.findOne({ ride: ride._id, passenger: req.user._id });
  if (existing && ['pending', 'confirmed'].includes(existing.status)) {
    return res.status(409).json({ error: 'You already have an active booking request for this ride' });
  }
  let booking;
  if (existing) {
    existing.status = 'pending';
    existing.seats = seats;
    existing.paymentMethod = requestData.paymentMethod;
    existing.paymentStatus = 'not_required';
    existing.pickup = requestData.pickup;
    existing.pickupDistanceKm = pickupDistanceKm;
    existing.createdAt = new Date();
    booking = await existing.save();
  } else {
    booking = await Booking.create({ ride: ride._id, passenger: req.user._id, seats, pickup: requestData.pickup, pickupDistanceKm, fare: 0, paymentMethod: requestData.paymentMethod, paymentStatus: 'not_required' });
  }
  res.status(201).json({ booking, payment: { processed: false, status: 'not_processed', message: 'This app records a payment preference only; no money has been collected.' } });
}));
app.patch('/api/bookings/:bookingId/approve', requireAuth, asyncRoute(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate('ride');
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (String(booking.ride.driver) !== String(req.user._id)) return res.status(403).json({ error: 'Only the ride owner can approve bookings' });
  if (booking.status !== 'pending' || !['open', 'active'].includes(booking.ride.status)) return res.status(409).json({ error: 'Booking cannot be approved' });

  const reservedRide = await Ride.findOneAndUpdate(
    { _id: booking.ride._id, status: { $in: ['open', 'active'] }, seatsAvailable: { $gte: booking.seats } },
    { $inc: { seatsAvailable: -booking.seats } },
    { new: true }
  );
  if (!reservedRide) return res.status(409).json({ error: 'Not enough seats remain, or this ride is no longer open' });

  let confirmed;
  try {
    confirmed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'confirmed' } },
      { new: true }
    );
  } catch (err) {
    await Ride.updateOne({ _id: reservedRide._id }, { $inc: { seatsAvailable: booking.seats } }).catch(() => {});
    throw err;
  }
  if (!confirmed) {
    await Ride.updateOne({ _id: reservedRide._id }, { $inc: { seatsAvailable: booking.seats } });
    return res.status(409).json({ error: 'Booking changed before it could be confirmed; no seats were reserved' });
  }
  await recalculateRideFares(reservedRide._id);
  const updatedBooking = await Booking.findById(confirmed._id);
  res.json({ booking: updatedBooking, ride: reservedRide });
}));
app.patch('/api/bookings/:bookingId/reject', requireAuth, asyncRoute(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate('ride');
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (String(booking.ride.driver) !== String(req.user._id)) return res.status(403).json({ error: 'Only the ride owner can reject bookings' });
  if (booking.status !== 'pending') return res.status(409).json({ error: 'Booking is no longer pending' });
  booking.status = 'rejected'; await booking.save(); res.json({ booking });
}));

app.patch('/api/bookings/:bookingId/cancel', requireAuth, asyncRoute(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate('ride');
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (String(booking.passenger) !== String(req.user._id)) return res.status(403).json({ error: 'Only the passenger who requested this booking can cancel it' });
  if (!['pending', 'confirmed'].includes(booking.status)) return res.status(409).json({ error: 'This booking can no longer be cancelled' });
  if (booking.ride.status !== 'open') return res.status(409).json({ error: 'Bookings cannot be cancelled after the trip starts or closes' });
  const previousStatus = booking.status;
  const cancelled = await Booking.findOneAndUpdate(
    { _id: booking._id, status: previousStatus },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
  if (!cancelled) return res.status(409).json({ error: 'Booking changed; refresh and try again' });
  if (previousStatus === 'confirmed') {
    await Ride.updateOne({ _id: booking.ride._id, status: 'open' }, { $inc: { seatsAvailable: booking.seats } });
  }
  res.json({ booking: cancelled, message: 'Booking cancelled. No online payment was taken by this app.' });
}));

async function ownedRide(id, userId) {
  const ride = await Ride.findById(id);
  if (!ride) return { error: 'Ride not found', status: 404 };
  if (String(ride.driver) !== String(userId)) return { error: 'Only the ride owner can do this', status: 403 };
  return { ride };
}
app.post('/api/rides/:id/start', requireAuth, asyncRoute(async (req, res) => {
  const result = await ownedRide(req.params.id, req.user._id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  const { ride } = result;
  if (ride.status !== 'open') return res.status(409).json({ error: 'Ride cannot be started in its current state' });
  if (!(await Booking.exists({ ride: ride._id, status: 'confirmed' }))) return res.status(400).json({ error: 'At least one confirmed passenger is required before starting a trip' });
  ride.status = 'active'; ride.sharingActive = false; await ride.save();
  res.json({ ride });
}));
app.post('/api/rides/:id/sharing/start', requireAuth, asyncRoute(async (req, res) => {
  const result = await ownedRide(req.params.id, req.user._id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  if (result.ride.status !== 'active') return res.status(409).json({ error: 'Start the trip before sharing live location' });
  result.ride.sharingActive = true; await result.ride.save();
  res.json({ sharingActive: true });
}));
app.post('/api/rides/:id/sharing/stop', requireAuth, asyncRoute(async (req, res) => {
  const result = await ownedRide(req.params.id, req.user._id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  result.ride.sharingActive = false; await result.ride.save(); await LiveLocation.deleteOne({ ride: result.ride._id });
  req.app.get('io')?.to(`trip:${result.ride._id}`).emit('trip:sharing-stopped', { reason: 'Driver stopped sharing' });
  res.json({ sharingActive: false });
}));
app.post('/api/rides/:id/complete', requireAuth, asyncRoute(async (req, res) => {
  const result = await ownedRide(req.params.id, req.user._id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  result.ride.status = 'completed'; result.ride.sharingActive = false; await result.ride.save();
  await LiveLocation.deleteOne({ ride: result.ride._id });
  req.app.get('io')?.to(`trip:${result.ride._id}`).emit('trip:sharing-stopped', { reason: 'Trip completed' });
  res.json({ ride: result.ride });
}));
app.post('/api/rides/:id/cancel', requireAuth, asyncRoute(async (req, res) => {
  const result = await ownedRide(req.params.id, req.user._id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  result.ride.status = 'cancelled'; result.ride.sharingActive = false; await result.ride.save();
  await LiveLocation.deleteOne({ ride: result.ride._id });
  await Booking.updateMany({ ride: result.ride._id, status: { $in: ['pending', 'confirmed'] } }, { $set: { status: 'cancelled' } });
  req.app.get('io')?.to(`trip:${result.ride._id}`).emit('trip:sharing-stopped', { reason: 'Trip cancelled' });
  res.json({ ride: result.ride });
}));
app.get('/api/rides/:id/location', requireAuth, asyncRoute(async (req, res) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const isDriver = String(ride.driver) === String(req.user._id);
  const isPassenger = await Booking.exists({ ride: ride._id, passenger: req.user._id, status: 'confirmed' });
  if (!isDriver && !isPassenger) return res.status(403).json({ error: 'Not authorized to view this trip location' });
  const location = await LiveLocation.findOne({ ride: ride._id });
  res.json({ location, sharingActive: ride.sharingActive, rideStatus: ride.status });
}));

app.get('/api/rides/:id/chat', requireAuth, asyncRoute(async (req, res) => {
  const ride = await Ride.findById(req.params.id).select('driver');
  if (!ride) return res.status(404).json({ error: 'Ride not found.' });
  const userId = String(req.user._id), driverId = String(ride.driver);
  let otherId = req.query.with;
  if (userId !== driverId) {
    const confirmed = await Booking.exists({ ride: ride._id, passenger: req.user._id, status: 'confirmed' });
    if (!confirmed || otherId && String(otherId) !== driverId) return res.status(403).json({ error: 'Chat is available only after the driver confirms your booking.' });
    otherId = driverId;
  } else {
    if (!otherId || !(await Booking.exists({ ride: ride._id, passenger: otherId, status: 'confirmed' }))) return res.status(403).json({ error: 'Choose a passenger with a confirmed booking.' });
  }
  const messages = await ChatMessage.find({ ride: ride._id, $or: [{ sender: req.user._id, receiver: otherId }, { sender: otherId, receiver: req.user._id }] }).populate('sender', 'name').sort({ createdAt: 1 }).limit(200).lean();
  res.json({ messages, otherId: String(otherId) });
}));
app.post('/api/rides/:id/chat', requireAuth, asyncRoute(async (req, res) => {
  const { text, with: requestedOther } = z.object({ text: z.string().trim().min(1).max(2000), with: z.string().min(1).max(64).optional() }).parse(req.body);
  const ride = await Ride.findById(req.params.id).select('driver');
  if (!ride) return res.status(404).json({ error: 'Ride not found.' });
  const userId = String(req.user._id), driverId = String(ride.driver);
  let otherId = requestedOther;
  if (userId !== driverId) {
    const confirmed = await Booking.exists({ ride: ride._id, passenger: req.user._id, status: 'confirmed' });
    if (!confirmed || requestedOther && requestedOther !== driverId) return res.status(403).json({ error: 'Chat is available only after the driver confirms your booking.' });
    otherId = driverId;
  } else if (!otherId || !(await Booking.exists({ ride: ride._id, passenger: otherId, status: 'confirmed' }))) return res.status(403).json({ error: 'Choose a passenger with a confirmed booking.' });
  const message = await ChatMessage.create({ ride: ride._id, sender: req.user._id, receiver: otherId, text });
  await message.populate('sender', 'name');
  res.status(201).json({ message });
}));

app.use((err, _req, res, _next) => {
  if (err.status && err.message) return res.status(err.status).json({ error: err.message });
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Invalid input', details: err.issues?.map(i => ({ path: i.path.join('.'), message: i.message })) });
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate record' });
  console.error(err?.message || 'Request failed');
  res.status(500).json({ error: 'Internal server error' });
});
