import test from 'node:test';
import assert from 'node:assert/strict';
import { validPoint, validLocationPayload } from '../src/validation.js';

test('accepts valid selected map point', () => {
  assert.equal(validPoint({ label: 'Lucknow', lat: 26.8467, lon: 80.9462 }), true);
});
test('rejects out-of-range point coordinates', () => {
  assert.equal(validPoint({ label: 'Bad', lat: 95, lon: 181 }), false);
});
test('accepts real GPS update payload', () => {
  assert.equal(validLocationPayload({ latitude: 26.8, longitude: 80.9, accuracy: 12, heading: 90, speed: 5 }), true);
});
test('rejects malformed GPS update payload', () => {
  assert.equal(validLocationPayload({ latitude: '26.8', longitude: 80.9 }), false);
});

import { distanceKm } from '../src/geo.js';

test('distanceKm returns zero for the same coordinates', () => {
  assert.equal(distanceKm({ lat: 26.76, lon: 83.37 }, { lat: 26.76, lon: 83.37 }), 0);
});

test('distanceKm measures a plausible short distance', () => {
  const d = distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  assert.ok(d > 110 && d < 112);
});
