import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models.js';

export const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: '7d', issuer: 'vehicle-pooling' });
}

export async function resolveUserFromCookie(cookieHeader = '') {
  const token = cookieHeader.split(';').map(v => v.trim()).find(v => v.startsWith('vp_token='))?.slice('vp_token='.length);
  if (!token) return null;
  try {
    const payload = jwt.verify(decodeURIComponent(token), config.jwtSecret, { issuer: 'vehicle-pooling' });
    return await User.findById(payload.sub).select('_id name email emailVerified phone role');
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.vp_token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, config.jwtSecret, { issuer: 'vehicle-pooling' });
    const user = await User.findById(payload.sub).select('_id name email emailVerified phone role');
    if (!user || !user.emailVerified) return res.status(401).json({ error: 'Authentication required. Verify your email first.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication required' });
  }
}
