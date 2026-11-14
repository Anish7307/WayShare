# Smart AI Vehicle Pooling System (MERN)

A full-stack starter implementation for shared rides with real authentication, ride publishing/search, seat bookings, route previews, and authenticated trip-specific live GPS sharing.

## Stack
- React + Vite + React Router
- Leaflet + React Leaflet + OpenStreetMap-compatible tiles
- Node.js + Express + MongoDB/Mongoose
- JWT in HTTP-only cookies + bcrypt
- Socket.IO with server-side trip authorization
- Node.js built-in test runner for validation tests

## Quick start
Requirements: Node.js 20+, MongoDB 7+ (local or Atlas), npm.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# Set MONGO_URI and JWT_SECRET in server/.env
npm install
npm run install:all
npm run dev
```

Frontend: http://localhost:5173  
Backend health: http://localhost:5000/api/health

If running `npm install` from the root doesn't install workspaces in your environment, run `npm install` separately in `server/` and `client/`.

Create an account, publish a ride as driver, book it from another passenger account, then approve the booking as the driver. Start the trip and start GPS sharing from the ride detail/tracking view. Use HTTPS in production; browser geolocation requires a secure context (localhost is allowed).

## Maps and provider policy
- Tiles: OpenStreetMap standard tile endpoint is configured as a development/default option. Keep visible attribution. Do not treat the public tile servers as unlimited production infrastructure; for launch, choose a tile provider whose current terms fit your traffic or self-host tiles.
- Search/autocomplete: Photon endpoint is configurable (`VITE_GEOCODER_URL`). Photon supports search suggestions; use a compliant hosted instance or self-host it. The public demo is not a production SLA.
- Routing: OSRM-compatible endpoint is configurable (`VITE_ROUTER_URL`). The public OSRM demo is for testing, not guaranteed production infrastructure. Self-host OSRM or use an appropriate hosted provider for production.
- No Google Maps key, credit card, or paid API key is required for local development. Free-of-charge public services still have usage limits and terms.
- For durable zero-license-cost operations, self-host geocoding/routing based on OpenStreetMap data. Expect a server with sufficient RAM/SSD, regional or country extracts, import time, disk space, monitoring, periodic OSM data updates, backups, and operational maintenance. Geocoding (e.g. Nominatim/Photon) and routing (OSRM) are separate services. Public Nominatim must not be used for client-side autocomplete.
- If a provider is unavailable, location search/routing displays an error; users can still save manually selected map points after confirming them. Straight-line distance is never labelled as driving distance.

## Security and privacy notes
- Auth uses an HTTP-only cookie; in production set `COOKIE_SECURE=true`, use HTTPS, and configure exact `CLIENT_ORIGIN`.
- Socket.IO handshake authenticates from the cookie. Clients cannot join arbitrary rooms: server checks ride ownership, active trip status, and confirmed booking before joining.
- Driver location updates are validated and accepted only from the ride's driver during an active trip with sharing enabled. Passenger location subscription is checked against confirmed booking records.
- Latest location is persisted as one replaceable MongoDB document per ride, not an unlimited GPS history. Stop/end/cancel deletes the current live location. Configure a retention policy for operational backups as well.
- This starter does not include payment processing, identity-document verification, SMS/email delivery, or a full moderation/admin console. Do not use it as a public ride-hailing service without security review, abuse controls, legal/privacy review, and production provider capacity planning.

## Scripts
- `npm run dev` — client and server concurrently
- `npm test` — server test suite
- `npm run build` — frontend production build

## Main API
- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `GET /api/auth/me`
- `POST /api/rides`, `GET /api/rides`, `GET /api/rides/:id`
- `POST /api/rides/:id/bookings`, `GET /api/rides/mine`
- `PATCH /api/bookings/:bookingId/approve`, `/reject`, `/cancel`
- `POST /api/rides/:id/start`, `/complete`, `/cancel`
- `POST /api/rides/:id/sharing/start`, `/sharing/stop`
- `GET /api/rides/:id/location` (authorized driver or confirmed passenger only)

## Tests
```bash
cd server && npm test
```
The included automated tests cover map-point and GPS-payload validation. JavaScript syntax checks and JSX transpilation were run on the revised files. A production Vite build and end-to-end tests against MongoDB/Socket.IO still need to be run in an environment where dependencies and a test database are available.

## Booking, payment preference, contacts, and map notes

- Drivers can publish vehicle make/model/color and an optional registration number. Every account must supply a mobile number; contact details and registration are withheld from the other participant until booking confirmation. Booking requests include a seat count, calculated fare, and an offline payment preference (`cash` or `upi`). Rejected/cancelled requests can be submitted again. Confirmed bookings can be cancelled before a trip starts, returning the reserved seats. Driver approval uses an atomic seat decrement to prevent overselling under concurrent approvals.
- Authenticated members can view open ride details to request a booking. Driver/passenger email and mobile number, plus the vehicle registration number, are only returned to the other participant after booking confirmation; pending/rejected/cancelled requests do not reveal those contact details. Vehicle make/model/color can be shown before confirmation.
- The payment selector records an **offline payment preference only** (cash or UPI transfer directly between participants). No money is collected, verified, or refunded in the app. For real online UPI/card payments, configure a payment provider with server-side order creation, webhook/signature verification, refund handling, and production credentials before enabling paid status.
- The trip map uses a clearer CARTO Voyager basemap with OpenStreetMap attribution, distinct pickup/destination/live-driver markers, route highlighting, zoom controls, and a current-location control. Tile/geocoder/router services are third-party services with their own fair-use policies; use a suitable provider for production traffic.
- Live GPS tracking requires an authenticated driver, an active trip, location permission, and at least one confirmed booking. The driver must keep the trip page open while sharing; stale GPS updates are labelled as stale and never presented as fresh live data.

## Human-readable location names

The client now reverse-geocodes map clicks, dragged markers, and browser current-location coordinates. Existing rides stored with legacy labels such as `Map point (lat, lon)` are also resolved for display on Find a Ride, My Trips, and Trip Details. The displayed address is the nearest address/place returned by Photon; reverse geocoding cannot guarantee a business/building name for every coordinate. If no address is returned or the geocoder is unavailable, the app shows a clear fallback asking the user to search for the place name instead of displaying raw coordinates. Search results remain the most reliable way to choose a specific named business or landmark.

## Mobile number verification and nearby ride search

- Registration requires a valid email address and a required mobile number. The app sends a one-time email verification link that expires in 30 minutes.
- The same account can act as both driver and rider. A mobile number is required to offer or book rides and is shared with the other participant only after a booking is confirmed. Mobile numbers are not verified by SMS in this free email-verification setup.
- Enter phone numbers in international format, for example `+919876543210`. A phone number is only returned to the other trip participant after booking confirmation.
- Find a Ride can request browser geolocation and search available ride pickups within 5, 10, 25, 50, or 100 km. The backend computes the distance and sorts nearby rides by distance. If location permission is denied, users can still browse all upcoming rides.
- The location search uses the ride pickup coordinate and straight-line distance, not road distance. Use a larger radius if no rides are found.
- The frontend now uses reusable files in `client/src/components/` (`Shell.jsx`, `PlaceField.jsx`, `RideCard.jsx`, and `PhoneVerification.jsx`) instead of keeping those UI pieces in the main entry file.


## Registration, nearby rides, and chat

Registration requires an email address, a mobile number in international format (for example, `+919876543210`), and a password of at least eight characters. The app sends an email verification link that expires in 30 minutes. Login uses the mobile number and password, and is allowed only after the email link has been clicked.

The Find a Ride page requests browser location automatically when opened and searches for available upcoming rides within a fixed 5 km of the pickup coordinates. Browser permission is controlled by the browser and cannot be bypassed; if permission is denied, use the page retry action after enabling it.

A private driver-passenger chat becomes available only after the driver confirms the booking. Chat is stored in MongoDB and the frontend refreshes messages every three seconds.

## Email verification setup

Copy `server/.env.example` to `server/.env` and configure SMTP settings. For Gmail, enable 2-Step Verification on the sending account and create a Google App Password; use that App Password as `SMTP_PASS` (not your normal Gmail password). Set `SMTP_USER`, `MAIL_FROM`, and `CLIENT_URL` to the right values. For production, set `CLIENT_URL` to your deployed frontend URL, use HTTPS, and set secure cookie settings appropriately. Never commit `.env` or share SMTP credentials.

Email delivery can use a provider's free allowance, but it is subject to that provider's terms and sending limits. No SMS service is required by this implementation. Existing accounts created by the old SMS flow may need to be recreated or migrated before they can sign in because email verification is now required.
