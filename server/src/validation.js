export function validPoint(p) {
  return p && typeof p.label === 'string' && p.label.trim().length > 0 &&
    Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 &&
    Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180;
}
export function validLocationPayload(p) {
  return p && Number.isFinite(p.latitude) && p.latitude >= -90 && p.latitude <= 90 &&
    Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude <= 180 &&
    (p.accuracy == null || (Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 10000)) &&
    (p.heading == null || (Number.isFinite(p.heading) && p.heading >= 0 && p.heading <= 360)) &&
    (p.speed == null || (Number.isFinite(p.speed) && p.speed >= 0));
}
