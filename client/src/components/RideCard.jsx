import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readablePlaceLabel } from '../maps';
const fmt = d => new Date(d).toLocaleString();
function Place({ point, fallback }) {
  const [label,setLabel] = useState(point?.label || fallback);
  useEffect(()=>{let alive=true;const c=new AbortController();readablePlaceLabel(point,c.signal).then(v=>{if(alive)setLabel(v)}).catch(()=>{});return()=>{alive=false;c.abort()}},[point?.label,point?.lat,point?.lon]);
  return <>{label}</>;
}
export default function RideCard({ ride }) {
 return <article className="card ride-card"><div className="ride-date">{fmt(ride.departureAt)}</div><div className="route-summary"><span className="dot start"></span><div><b><Place point={ride.origin} fallback="Pickup location"/></b><small>Pickup</small></div></div><div className="route-summary"><span className="dot end"></span><div><b><Place point={ride.destination} fallback="Destination"/></b><small>Destination</small></div></div><div className="ride-meta"><span>Driver: {ride.driver?.name||'Member'}</span><strong>₹{ride.pricePerSeat}/seat</strong></div><div className="ride-meta"><span>{ride.seatsAvailable} {ride.seatsAvailable===1?'seat':'seats'} available{Number.isFinite(ride.distanceFromCurrentKm)?` · ${ride.distanceFromCurrentKm.toFixed(1)} km from you`:''}</span><Link to={`/trip/${ride._id}`}>View ride →</Link></div></article>;
}
