import { useEffect, useMemo } from 'react';
import React from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { reverseGeocode } from './maps';
import 'leaflet/dist/leaflet.css';

const tileUrl = import.meta.env.VITE_TILE_URL || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const makePin = (label, color) => L.divIcon({
  className: 'way-pin-wrap',
  html: `<div class="way-pin ${color}"><span>${label}</span></div>`,
  iconSize: [36, 42],
  iconAnchor: [18, 38],
  popupAnchor: [0, -34]
});
const pickupPin = makePin('A', 'pickup');
const destinationPin = makePin('B', 'destination');
const vehiclePin = makePin('↗', 'vehicle');

function MapClick({ point, onMove }) {
  useMapEvents({ click(e) {
    const { lat, lng: lon } = e.latlng;
    const fallback = 'Nearby address unavailable — search for the place name';
    reverseGeocode(lat, lon).then(label => onMove({ ...point, lat, lon, label: label || fallback }))
      .catch(() => onMove({ ...point, lat, lon, label: fallback }));
  } });
  return null;
}
function FitBounds({ points }) {
  const map = useMap();
  const key = points.map(p => `${p.lat},${p.lon}`).join('|');
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points.map(p => [p.lat, p.lon]), { padding: [42, 42], maxZoom: 15 });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lon], 14);
  }, [map, key]);
  return null;
}
function LocateControl() {
  const map = useMap();
  return <button type="button" className="map-locate" title="Go to my current location" onClick={() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => map.flyTo([coords.latitude, coords.longitude], 16, { duration: 0.7 }));
  }}>◎ My location</button>;
}
export default function MapPicker({ origin, destination, route, activeLocation, onMove, vehicle, height = 390 }) {
  const points = useMemo(() => [origin, destination, vehicle && { lat: vehicle.lat, lon: vehicle.lon }].filter(Boolean), [origin?.lat, origin?.lon, destination?.lat, destination?.lon, vehicle?.lat, vehicle?.lon]);
  const center = points[0] ? [points[0].lat, points[0].lon] : [26.8467, 80.9462];
  const routePositions = (route?.coordinates || []).map(([lon, lat]) => [lat, lon]);
  return <div className="map-frame" style={{ height }}>
    <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={tileUrl} attribution={tileAttribution} maxZoom={19} />
      <ZoomControl position="bottomright" />
      {origin && <Marker position={[origin.lat, origin.lon]} icon={pickupPin} draggable={!!onMove && activeLocation === 'origin'} eventHandlers={{ dragend(e) {
        const p = e.target.getLatLng(); const fallback = 'Nearby address unavailable — search for the place name';
        reverseGeocode(p.lat, p.lng).then(label => onMove?.({ ...origin, lat: p.lat, lon: p.lng, label: label || fallback }))
          .catch(() => onMove?.({ ...origin, lat: p.lat, lon: p.lng, label: fallback }));
      } }} />}
      {destination && <Marker position={[destination.lat, destination.lon]} icon={destinationPin} draggable={!!onMove && activeLocation === 'destination'} eventHandlers={{ dragend(e) {
        const p = e.target.getLatLng(); const fallback = 'Nearby address unavailable — search for the place name';
        reverseGeocode(p.lat, p.lng).then(label => onMove?.({ ...destination, lat: p.lat, lon: p.lng, label: label || fallback }))
          .catch(() => onMove?.({ ...destination, lat: p.lat, lon: p.lng, label: fallback }));
      } }} />}
      {vehicle && <Marker position={[vehicle.lat, vehicle.lon]} icon={vehiclePin} zIndexOffset={1000} />}
      {routePositions.length > 1 && <><Polyline positions={routePositions} pathOptions={{ color: '#ffffff', weight: 9, opacity: .95, lineCap: 'round', lineJoin: 'round' }} /><Polyline positions={routePositions} pathOptions={{ color: '#087e8b', weight: 5, opacity: .95, lineCap: 'round', lineJoin: 'round' }} /></>}
      {onMove && activeLocation && <MapClick point={activeLocation === 'origin' ? origin || { label: 'Pickup' } : destination || { label: 'Destination' }} onMove={onMove} />}
      <FitBounds points={points} />
      <LocateControl />
    </MapContainer>
  </div>;
}
