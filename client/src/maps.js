const GEOCODER = import.meta.env.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/';
const ROUTER = import.meta.env.VITE_ROUTER_URL || 'https://router.project-osrm.org';

export async function searchPlaces(query, signal) {
  if (!query.trim()) return [];
  const url = new URL(GEOCODER);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '6');
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search is temporarily unavailable. You can still select a point on the map.');
  const data = await response.json();
  return (data.features || []).map(f => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry.coordinates;
    const label = [p.name, p.street, p.city || p.town || p.village, p.state, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    return { label: label || query, lat, lon };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export async function reverseGeocode(lat, lon, signal) {
  const url = new URL(GEOCODER);
  url.pathname = '/reverse';
  url.search = '';
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Reverse geocoding is temporarily unavailable.');
  const data = await response.json();
  const p = data.features?.[0]?.properties || {};
  const label = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.suburb || p.neighbourhood, p.city || p.town || p.village || p.municipality, p.district, p.state, p.postcode, p.country]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  return label || null;
}

export async function getRoute(origin, destination) {
  const url = `${ROUTER.replace(/\/$/, '')}/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Road routing is unavailable right now. You can still continue booking without a verified route.');
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No drivable route found between those places.');
  const route = data.routes[0];
  return { coordinates: route.geometry.coordinates, distanceMeters: route.distance, durationSeconds: route.duration, provider: 'OSRM' };
}


export async function readablePlaceLabel(point, signal) {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lon))) return point?.label || 'Location name unavailable';
  const label = String(point.label || '').trim();
  const isCoordinateLabel = /^(map point|pickup point|destination point)\s*\(/i.test(label);
  const isGenericLabel = /^(my current location|current location|selected location|location)$/i.test(label);
  if (label && !isCoordinateLabel && !isGenericLabel) return label;
  try {
    const resolved = await reverseGeocode(Number(point.lat), Number(point.lon), signal);
    return resolved || 'Nearby address unavailable — search for the place name';
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return 'Nearby address unavailable — search for the place name';
  }
}
