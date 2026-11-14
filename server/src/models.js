import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 250 },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lon: { type: Number, required: true, min: -180, max: 180 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, unique: true, sparse: true, required: true, lowercase: true, trim: true },
  emailVerified: { type: Boolean, default: false },
  emailVerificationTokenHash: { type: String, default: '' },
  emailVerificationExpiresAt: { type: Date, default: null },
  phone: { type: String, unique: true, sparse: true, trim: true, maxlength: 30 },
  phoneVerified: { type: Boolean, default: false },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const rideSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  origin: { type: pointSchema, required: true },
  destination: { type: pointSchema, required: true },
  vehicle: {
    make: { type: String, trim: true, maxlength: 60, default: '' },
    model: { type: String, trim: true, maxlength: 60, default: '' },
    color: { type: String, trim: true, maxlength: 40, default: '' },
    registration: { type: String, trim: true, maxlength: 30, default: '' }
  },
  route: {
    coordinates: { type: [[Number]], default: [] },
    distanceMeters: Number,
    durationSeconds: Number,
    provider: String,
    updatedAt: Date
  },
  departureAt: { type: Date, required: true },
  seatsTotal: { type: Number, required: true, min: 1, max: 8 },
  seatsAvailable: { type: Number, required: true, min: 0, max: 8 },
  totalFare: { type: Number, required: true, min: 0, max: 100000 },
  pricePerSeat: { type: Number, required: true, min: 0, max: 100000 },
  notes: { type: String, maxlength: 500, default: '' },
  status: { type: String, enum: ['open', 'active', 'completed', 'cancelled'], default: 'open', index: true },
  sharingActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seats: { type: Number, required: true, min: 1, max: 8 },
  pickup: { type: pointSchema, required: true },
  pickupDistanceKm: { type: Number, required: true, min: 0 },
  fare: { type: Number, required: true, min: 0, default: 0 },
  paymentMethod: { type: String, enum: ['cash', 'upi'], default: 'cash' },
  paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'refunded'], default: 'not_required' },
  status: { type: String, enum: ['pending', 'confirmed', 'rejected', 'cancelled'], default: 'pending', index: true },
  createdAt: { type: Date, default: Date.now }
});
bookingSchema.index({ ride: 1, passenger: 1 }, { unique: true });

const liveLocationSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, unique: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, min: 0 },
  heading: { type: Number, min: 0, max: 360 },
  speed: { type: Number, min: 0 },
  updatedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }
});

export const User = mongoose.model('User', userSchema);
export const Ride = mongoose.model('Ride', rideSchema);
export const Booking = mongoose.model('Booking', bookingSchema);
const chatMessageSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, index: true }
});
chatMessageSchema.index({ ride: 1, sender: 1, receiver: 1, createdAt: 1 });

export const LiveLocation = mongoose.model('LiveLocation', liveLocationSchema);
export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
