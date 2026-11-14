import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, errorMessage } from './api';
import AppShell from './components/Shell';
import PlaceField from './components/PlaceField';
import RideCard from './components/RideCard';
import PhoneVerification from './components/PhoneVerification';
import { searchPlaces, getRoute, reverseGeocode, readablePlaceLabel } from './maps';
import MapPicker from './MapPicker';
import './style.css';

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const fmt = d => new Date(d).toLocaleString();
function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => { api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => setUser(null)).finally(() => setReady(true)); }, []);
  const logout = async () => { await api.post('/auth/logout'); setUser(null); };
  return <AuthContext.Provider value={{user,setUser,ready,logout}}>{children}</AuthContext.Provider>;
}
function Shell({ children }) { const { user, logout } = useAuth(); return <AppShell user={user} logout={logout}>{children}</AppShell>; }
function Home() { return <Shell><section className="hero"><div className="hero-copy"><span className="eyebrow">BETTER JOURNEYS, TOGETHER</span><h1>Your route.<br/><em>Shared smarter.</em></h1><p>Find people going your way, split the cost, and follow your trip with secure live location sharing.</p><div className="hero-actions"><Link className="btn" to="/find">Find a ride <span>↗</span></Link><Link className="btn secondary" to="/offer">Offer a ride</Link></div><div className="trust-row"><span>✓ No booking fee</span><span>✓ Confirmed bookings</span><span>✓ Trip-only live sharing</span></div></div><div className="hero-panel"><div className="panel-top"><span className="live-dot"></span> YOUR NEXT JOURNEY <span className="pill">COMMUNITY</span></div><div className="route-visual"><div className="route-line"><i></i><i></i></div><div><b>Pickup point</b><small>Choose a place on the map</small></div><div><b>Destination</b><small>We’ll find a road route</small></div></div><div className="map-mini"><MapPicker height={210}/></div><div className="panel-bottom"><span>OpenStreetMap-powered</span><span>● Live trip updates</span></div></div></section><section className="feature-grid"><article><span>01</span><h3>Choose your route</h3><p>Search places or select a precise point on an interactive map.</p></article><article><span>02</span><h3>Share the journey</h3><p>Publish a ride or request a seat with a clear per-seat price.</p></article><article><span>03</span><h3>Travel with clarity</h3><p>Confirmed passengers can view live driver location during an active trip.</p></article></section></Shell>; }
function AuthPage({ mode }) {
  const { setUser } = useAuth(), navigate = useNavigate();
  const [form,setForm] = useState({name:'',email:'',phone:'',password:''});
  const [error,setError] = useState(''),[message,setMessage] = useState(''),[busy,setBusy] = useState(false);
  const location = useLocation();
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body=mode==='register'?form:{phone:form.phone.trim(),password:form.password};
      const r=await api.post(`/auth/${mode}`,body);
      if (mode==='register') { setMessage(r.data.message); return; }
      setUser(r.data.user); navigate(location.state?.from || '/dashboard', { replace: true });
    } catch(err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(''); setMessage('');
    try { const r=await api.post('/auth/resend-verification',{email:form.email}); setMessage(r.data.message); }
    catch(err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Shell><div className="auth-wrap"><div className="auth-card"><span className="eyebrow">YOUR NEXT JOURNEY STARTS HERE</span><h1>{mode === 'login' ? 'Welcome back' : 'Join the ride'}</h1><p className="muted">{mode === 'login' ? 'Log in with your mobile number and password after verifying your email.' : 'Create one account to offer rides and book rides. Verify your email using the link we send.'}</p><form onSubmit={submit} className="stack">{mode==='register'&&<label>Full name<input required minLength="2" maxLength="100" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}{mode==='register'&&<label>Email address<input type="email" required maxLength="200" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/><small className="muted">We'll send a verification link that expires in 30 minutes.</small></label>}<label>Mobile number<input required type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}"/><small className="muted">Use international format, including country code. This number is shared between rider and driver only after booking confirmation.</small></label><label>Password<input type="password" minLength="8" maxLength="100" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>{message&&<p className="confirmed">{message}</p>}{error && <p className="error">{error}</p>}{mode==='register'&&message&&<button type="button" className="btn secondary block" disabled={busy} onClick={resend}>Resend verification email</button>}<button className="btn block" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':'Create account'}</button></form><p className="muted">{mode==='login'?'New to WayShare? ':'Already have an account? '}<Link to={mode==='login'?'/register':'/login'}>{mode==='login'?'Create an account':'Log in'}</Link></p></div></div></Shell>;
}
function VerifyEmailPage() {
  const { setUser } = useAuth(), navigate = useNavigate(), location = useLocation();
  const [status,setStatus] = useState('Verifying your email link…'), [error,setError] = useState('');
  useEffect(() => {
    let active=true;
    const token=new URLSearchParams(location.search).get('token');
    if (!token) { setStatus(''); setError('This verification link is missing its token. Open the complete link from your email.'); return; }
    api.get('/auth/verify-email',{params:{token}}).then(response=>{
      if (!active) return;
      setUser(response.data.user); setStatus(response.data.message); setTimeout(()=>navigate('/dashboard',{replace:true}),1200);
    }).catch(err=>{if(active){setStatus('');setError(errorMessage(err));}});
    return ()=>{active=false;};
  },[location.search,navigate,setUser]);
  return <Shell><div className="auth-wrap"><section className="auth-card stack"><span className="eyebrow">EMAIL VERIFICATION</span><h1>Verify your email</h1>{status&&<p className="confirmed">{status}</p>}{error&&<><p className="error">{error}</p><Link className="btn secondary block" to="/login">Go to login</Link></>}</section></div></Shell>;
}
function useCurrentLocation(onSelect) {
  return () => {
    if (!navigator.geolocation) return alert('Geolocation is not supported by this browser.');
    navigator.geolocation.getCurrentPosition(async pos => { const point={label:'My current location',lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy}; try { point.label=await reverseGeocode(point.lat,point.lon) || 'Nearby address unavailable — search for the place name'; } catch { point.label='Nearby address unavailable — search for the place name'; } onSelect(point); }, err => alert(err.code===1?'Location permission denied. Allow access in browser settings or choose a point on the map.':'Could not get an accurate location. Try again or choose a point on the map.'), {enableHighAccuracy:true,timeout:12000,maximumAge:10000});
  };
}
function OfferRide() {
  const navigate=useNavigate(), [origin,setOrigin]=useState(null),[destination,setDestination]=useState(null),[route,setRoute]=useState(null),[routeError,setRouteError]=useState(''),[busy,setBusy]=useState(false),[active,setActive]=useState('origin'),[message,setMessage]=useState('');
  const [departureAt,setDepartureAt]=useState(''),[seats,setSeats]=useState(4),[price,setPrice]=useState(100),[notes,setNotes]=useState(''),[vehicleMake,setVehicleMake]=useState(''),[vehicleModel,setVehicleModel]=useState(''),[vehicleColor,setVehicleColor]=useState(''),[vehicleRegistration,setVehicleRegistration]=useState('');
  const current=useCurrentLocation(p=>{setOrigin(p);setActive('origin');});
  async function preview(){if(!origin||!destination)return setRouteError('Select and confirm both locations first.');try{setRouteError('');setRoute(await getRoute(origin,destination));}catch(e){setRoute(null);setRouteError(e.message);}}
  async function submit(e){e.preventDefault();if(!origin||!destination)return setMessage('Confirm pickup and destination from suggestions or the map.');if(!departureAt)return setMessage('Choose a departure date and time.');if(new Date(departureAt)<=new Date())return setMessage('Departure must be in the future.');setBusy(true);setMessage('');try{const r=await api.post('/rides',{origin,destination,departureAt:new Date(departureAt).toISOString(),seatsTotal:Number(seats),totalFare:Number(price),pricePerSeat:Number(price)/Number(seats),notes,route,vehicle:{make:vehicleMake,model:vehicleModel,color:vehicleColor,registration:vehicleRegistration}});navigate(`/trip/${r.data.ride._id}`);}catch(e){setMessage(errorMessage(e));}finally{setBusy(false);}}
  const move=p=>{if(active==='origin')setOrigin(p);else setDestination(p);setRoute(null);};
  return <Shell><div className="page-head"><span className="eyebrow">DRIVER WORKSPACE</span><h1>Offer a ride</h1><p>Set your fixed route and whole-journey fare. Passengers joining later pay only for the route distance they travel.</p></div><div className="two-col"><form className="card stack" onSubmit={submit}><PlaceField label="Pickup location" value={origin} onChange={p=>{setOrigin(p);setRoute(null);}}/><button type="button" className="btn secondary" onClick={current}>◎ Use my current location</button><PlaceField label="Destination" value={destination} onChange={p=>{setDestination(p);setRoute(null);}}/><div className="row"><button type="button" className={`btn ${active==='origin'?'':'secondary'}`} onClick={()=>setActive('origin')}>Adjust pickup on map</button><button type="button" className={`btn ${active==='destination'?'':'secondary'}`} onClick={()=>setActive('destination')}>Adjust destination</button></div><div className="field-grid"><label>Departure date & time<input type="datetime-local" required value={departureAt} onChange={e=>setDepartureAt(e.target.value)} min={new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}/></label><label>Available seats<select value={seats} onChange={e=>setSeats(e.target.value)}>{[1,2,3,4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></label><label>Total fare for the complete journey (₹)<input type="number" min="0" max="100000" required value={price} onChange={e=>setPrice(e.target.value)}/></label></div><div className="field-grid"><label>Vehicle make<input maxLength="60" value={vehicleMake} onChange={e=>setVehicleMake(e.target.value)} placeholder="e.g. Maruti"/></label><label>Vehicle model<input maxLength="60" value={vehicleModel} onChange={e=>setVehicleModel(e.target.value)} placeholder="e.g. Swift"/></label><label>Vehicle color<input maxLength="40" value={vehicleColor} onChange={e=>setVehicleColor(e.target.value)} placeholder="e.g. White"/></label><label>Registration number (private until confirmed)<input maxLength="30" value={vehicleRegistration} onChange={e=>setVehicleRegistration(e.target.value)} placeholder="Optional vehicle number"/></label></div><label>Trip notes (optional)<textarea maxLength="500" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Luggage, meeting point, preferences…"/></label>{routeError&&<p className="notice">{routeError}</p>}{message&&<p className="error">{message}</p>}<button type="button" className="btn secondary block" onClick={preview}>Preview road route</button>{route&&<p className="confirmed">✓ Road route: {(route.distanceMeters/1000).toFixed(1)} km · {Math.round(route.durationSeconds/60)} min (OSRM estimate)</p>}<button className="btn block" disabled={busy}>{busy?'Publishing…':'Publish ride'}</button></form><section className="card map-card"><div className="section-title"><h2>Confirm your route</h2><span className="pill">Interactive map</span></div><p className="muted">Select a suggestion, or drag the active marker / tap the map to refine its position. Confirm the displayed place before publishing.</p><MapPicker origin={origin} destination={destination} route={route} activeLocation={active} onMove={move}/><p className="attribution">Map data © OpenStreetMap contributors. Route data from the configured OSRM-compatible service.</p></section></div></Shell>;
}
function ReadableRoute({ origin, destination, separator = ' → ' }) {
  const [labels, setLabels] = useState([origin?.label || 'Pickup location', destination?.label || 'Destination']);
  useEffect(() => {
    let alive = true; const controller = new AbortController();
    Promise.all([readablePlaceLabel(origin, controller.signal), readablePlaceLabel(destination, controller.signal)])
      .then(next => { if (alive) setLabels(next); }).catch(() => {});
    return () => { alive = false; controller.abort(); };
  }, [origin?.label, origin?.lat, origin?.lon, destination?.label, destination?.lat, destination?.lon]);
  return <>{labels[0]}{separator}{labels[1]}</>;
}
function ReadablePlace({ point, fallback = 'Location name unavailable' }) {
  const [label, setLabel] = useState(point?.label || fallback);
  useEffect(() => { let alive=true; const controller=new AbortController();
    readablePlaceLabel(point, controller.signal).then(value=>{if(alive)setLabel(value);}).catch(()=>{});
    return ()=>{alive=false;controller.abort();};
  }, [point?.label, point?.lat, point?.lon]);
  return <>{label}</>;
}

function FindRide() {
  const [rides,setRides]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[near,setNear]=useState(null),[locationBusy,setLocationBusy]=useState(false);
  async function load(point){setLoading(true);setError('');try{const r=await api.get('/rides',{params:{nearLat:point.lat,nearLon:point.lon,radiusKm:5}});setRides(r.data.rides||[]);}catch(e){setError(errorMessage(e));}finally{setLoading(false);}}
  function fetchLocation(){if(!navigator.geolocation){setError('This browser does not support location.');setLoading(false);return;}setLocationBusy(true);navigator.geolocation.getCurrentPosition(async pos=>{const point={lat:pos.coords.latitude,lon:pos.coords.longitude,label:'Your current location'};try{point.label=await reverseGeocode(point.lat,point.lon)||point.label;}catch{}setNear(point);await load(point);setLocationBusy(false);},err=>{setLocationBusy(false);setLoading(false);setError(err.code===1?'Location permission was denied. Allow location access in browser settings and retry.':'Could not get your current location. Check GPS settings and retry.');},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});}
  useEffect(()=>{fetchLocation();},[]);
  return <Shell><div className="page-head"><span className="eyebrow">FIND YOUR WAY</span><h1>Rides within 5 km</h1><p>WayShare checks your current location when this page opens and shows upcoming rides with pickups within 5 km.</p></div><section className="card nearby-search"><div className="nearby-actions"><span className="pill">Fixed radius: 5 km</span><button className="btn secondary" type="button" onClick={fetchLocation} disabled={locationBusy}>{locationBusy?'Finding location…':'Refresh my location'}</button></div>{near&&<p className="confirmed">Searching within 5 km of {near.label}</p>}{error&&<p className="error">{error}</p>}</section>{loading?<p>Finding rides within 5 km…</p>:rides.length===0?<div className="empty"><h2>{near?'No rides found within 5 km':'Location needed to find nearby rides'}</h2><p>{near?'There are no upcoming rides with available seats close to your current location.':'Allow location access to search for nearby rides.'}</p><button className="btn" onClick={fetchLocation} disabled={locationBusy}>Try again</button><Link className="btn secondary" to="/offer">Offer a ride</Link></div>:<><p className="muted">{rides.length} available ride{rides.length===1?'':'s'} within 5 km, sorted by pickup distance.</p><div className="ride-grid">{rides.map(r=><RideCard ride={r} key={r._id}/>)}</div></>}</Shell>;
}
function Dashboard() {
  const [data,setData]=useState({rides:[],bookings:[]}),[error,setError]=useState('');
  async function load(){try{setData((await api.get('/rides/mine')).data);}catch(e){setError(errorMessage(e));}}
  useEffect(()=>{load();},[]);
  return <Shell><div className="page-head"><span className="eyebrow">YOUR WAYSHARE</span><h1>My trips</h1><p>Manage offered rides and your booking requests.</p></div>{error&&<p className="error">{error}</p>}<h2 className="subhead">Rides you offer</h2>{data.rides.length===0?<p className="muted">No rides published yet. <Link to="/offer">Offer your first ride</Link>.</p>:<div className="ride-grid">{data.rides.map(r=><Link className="card dashboard-card" to={`/trip/${r._id}`} key={r._id}><span className={`status ${r.status}`}>{r.status}</span><b><ReadableRoute origin={r.origin} destination={r.destination} /></b><small>{fmt(r.departureAt)}</small><span>Manage ride →</span></Link>)}</div>}<h2 className="subhead">Your bookings</h2>{data.bookings.length===0?<p className="muted">No bookings yet. <Link to="/find">Find a ride</Link>.</p>:<div className="ride-grid">{data.bookings.map(b=><Link className="card dashboard-card" to={`/trip/${b.ride?._id}`} key={b._id}><span className={`status ${b.status}`}>{b.status}</span><b><ReadableRoute origin={b.ride?.origin} destination={b.ride?.destination} /></b><small>Driver: {b.ride?.driver?.name || 'Member'}</small></Link>)}</div>}</Shell>;
}
function ChatPanel({rideId,otherId,title}) {
  const [messages,setMessages]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){try{const r=await api.get(`/rides/${rideId}/chat`,{params:{with:otherId}});setMessages(r.data.messages||[]);setError('');}catch(e){setError(errorMessage(e));}}
  useEffect(()=>{load();const timer=setInterval(load,3000);return()=>clearInterval(timer);},[rideId,otherId]);
  async function send(e){e.preventDefault();if(!text.trim())return;setBusy(true);try{await api.post(`/rides/${rideId}/chat`,{with:otherId,text:text.trim()});setText('');await load();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
  return <section className="card chat-panel"><h3>Chat with {title||'ride participant'}</h3><div className="chat-messages">{messages.length?messages.map(m=><div className="chat-message" key={m._id}><b>{m.sender?.name||'Member'}</b><p>{m.text}</p><small>{fmt(m.createdAt)}</small></div>):<p className="muted">No messages yet. Say hello to coordinate your pickup.</p>}</div>{error&&<p className="error">{error}</p>}<form className="chat-form" onSubmit={send}><input value={text} onChange={e=>setText(e.target.value)} maxLength="2000" placeholder="Write a message…" required/><button className="btn" disabled={busy||!text.trim()}>{busy?'Sending…':'Send'}</button></form></section>;
}
function TripPage() {
  const {id}=useParams(), {user}=useAuth();
  const [data,setData]=useState(null),[seats,setSeats]=useState(1),[pickup,setPickup]=useState(null),[paymentMethod,setPaymentMethod]=useState('cash'),[notice,setNotice]=useState(''),[error,setError]=useState(''),[location,setLocation]=useState(null),[sharing,setSharing]=useState(false),[stale,setStale]=useState(false),[vehicle,setVehicle]=useState(null),[busy,setBusy]=useState(false);
  const isDriver=!!(data?.ride && String(data.ride.driver?._id||data.ride.driver)===String(user?.id));
  async function load(){try{const r=await api.get(`/rides/${id}`);setData(r.data);setSharing(!!r.data.ride.sharingActive);setError('');return r.data;}catch(e){setError(errorMessage(e));return null;}}
  useEffect(()=>{load();},[id]);
  useEffect(()=>{const timer=setInterval(async()=>{try{const r=await api.get(`/rides/${id}`);setData(r.data);setSharing(!!r.data.ride.sharingActive);setError('');}catch(e){setError(errorMessage(e));}},10000);return()=>clearInterval(timer);},[id]);
  useEffect(() => {
    if (!data?.ride || (!isDriver && data.booking?.status !== 'confirmed')) return;
    const socket=io(socketUrl,{withCredentials:true,transports:['websocket','polling']});
    const subscribe=()=>socket.emit('trip:subscribe',{rideId:id},res=>{
      if(!res?.ok){setNotice(res?.error||'Could not connect to trip updates.');return;}
      setSharing(!!res.sharingActive);
      if(res.location){setLocation(res.location);setVehicle({lat:res.location.latitude,lon:res.location.longitude});setStale(Date.now()-new Date(res.location.updatedAt).getTime()>30000);}
    });
    socket.on('connect',subscribe);
    socket.on('trip:location',loc=>{setLocation(loc);setVehicle({lat:loc.latitude,lon:loc.longitude});setStale(false);});
    socket.on('trip:sharing-stopped',msg=>{setSharing(false);setStale(true);setLocation(null);setVehicle(null);setNotice(msg?.reason||'Live sharing stopped.');});
    socket.on('connect_error',()=>setNotice('Live tracking connection failed. Check your connection and sign-in status.'));
    const retry=setInterval(()=>{if(socket.connected)subscribe();},6000);
    return()=>{clearInterval(retry);socket.emit('trip:unsubscribe',{rideId:id});socket.disconnect();};
  },[id,data?.ride?._id,isDriver,data?.booking?.status,data?.ride?.status]);
  useEffect(()=>{if(!location)return;const t=setInterval(()=>setStale(Date.now()-new Date(location.updatedAt).getTime()>30000),5000);return()=>clearInterval(t);},[location]);
  async function action(path,body={},method='POST'){setNotice('');setBusy(true);try{if(method==='PATCH')await api.patch(path,body);else await api.post(path,body);setNotice('Updated successfully.');await load();}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
  async function book(){setNotice('');if(ride.status==='active'&&!pickup)return setNotice('Choose a pickup point ahead of the driver on the route.');setBusy(true);try{const r=await api.post(`/rides/${id}/bookings`,{seats:Math.min(Number(seats),Math.max(1,ride.seatsAvailable)),paymentMethod,pickup:pickup||ride.origin});setNotice(r.data?.payment?.message||'Booking request sent. The driver must confirm it.');await load();}catch(e){setNotice(errorMessage(e));}finally{setBusy(false);}}
  const cancelBooking=()=>action(`/bookings/${data.booking._id}/cancel`,{},'PATCH');
  if(error&&!data)return <Shell><div className="empty"><h2>Unable to open trip</h2><p>{error}</p><Link to="/find">Back to rides</Link></div></Shell>;
  if(!data)return <Shell><p className="page-head">Loading trip…</p></Shell>;
  const ride=data.ride, booking=data.booking;
  const canRequest=!isDriver&&['open','active'].includes(ride.status)&&ride.seatsAvailable>0&&(!booking||['rejected','cancelled'].includes(booking.status));
  const canCancelBooking=!isDriver&&booking&&['pending','confirmed'].includes(booking.status)&&ride.status==='open';
  return <Shell><div className="page-head compact"><span className="eyebrow">TRIP DETAILS</span><h1><ReadableRoute origin={ride.origin} destination={ride.destination} /></h1><p>{fmt(ride.departureAt)} · {ride.seatsAvailable} seats left · Whole-trip fare ₹{ride.totalFare ?? ride.pricePerSeat * ride.seatsTotal}</p></div><div className="two-col trip-layout"><section className="card stack"><div className="section-title"><h2>Trip map</h2><span className={`status ${ride.status}`}>{ride.status}</span></div><MapPicker origin={ride.origin} destination={ride.destination} route={ride.route} vehicle={vehicle}/><div className="map-legend"><span><i className="legend-pickup"/> Pickup</span><span><i className="legend-destination"/> Destination</span><span><i className="legend-vehicle"/> Live driver</span></div>{ride.status==='active'&&!sharing&&<p className="notice">Trip active; waiting for the driver to enable live location sharing…</p>}{ride.route?.distanceMeters&&<p className="confirmed">Planned road route: {(ride.route.distanceMeters/1000).toFixed(1)} km · about {Math.round((ride.route.durationSeconds||0)/60)} min</p>}{sharing&&!location&&<p className="notice">Live sharing is enabled, but no accepted GPS fix has arrived yet.</p>}{sharing&&location&&<p className={stale?'warning':'confirmed'}>{stale?'⚠ GPS update is stale — no recent location received.':'● Live GPS update received'} {location?.updatedAt&&`Last update: ${fmt(location.updatedAt)}`}</p>}{notice&&<p className="notice">{notice}</p>}{error&&<p className="error">{error}</p>}<div className="row wrap">{canRequest&&<div className="booking-checkout"><h3>{booking?'Request again':'Join this ride'}</h3><PlaceField label="Your pickup point" value={pickup||ride.origin} onChange={setPickup}/><p className="muted">Choose a pickup point along the driver’s route. Your fare is based on the remaining distance and passengers sharing each segment.</p><div className="booking-controls"><label>Seats<select value={Math.min(Number(seats),Math.max(1,ride.seatsAvailable))} onChange={e=>setSeats(e.target.value)}>{Array.from({length:ride.seatsAvailable},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Offline payment preference<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="cash">Cash to driver</option><option value="upi">UPI transfer directly to driver</option></select></label></div><div className="fare-row"><span>Estimated fare · {Math.min(Number(seats),Math.max(1,ride.seatsAvailable))} seat(s)</span><strong>Calculated after confirmation</strong></div><p className="muted">This is not an online payment. The app does not collect, verify, or refund money.</p><button className="btn block" disabled={busy} onClick={book}>{busy?'Sending…':'Send booking request'}</button></div>}{!isDriver&&ride.status==='open'&&ride.seatsAvailable===0&&<p className="notice">All seats are currently booked or unavailable.</p>}{isDriver&&ride.status==='open'&&<button className="btn" disabled={busy} onClick={()=>action(`/rides/${id}/start`)}>Start trip</button>}{isDriver&&ride.status==='active'&&<><LiveShare rideId={id} onStatus={setNotice} onLocation={loc=>{setLocation(loc);setVehicle({lat:loc.latitude,lon:loc.longitude});setStale(false);}}/><button className="btn secondary" disabled={busy} onClick={()=>action(`/rides/${id}/complete`)}>Complete trip</button></>}{isDriver&&['open','active'].includes(ride.status)&&<button className="btn danger" disabled={busy} onClick={()=>action(`/rides/${id}/cancel`)}>Cancel ride</button>}</div>{booking&&<div className="booking-summary"><h3>Your booking</h3><p>Booking status: <span className={`status ${booking.status}`}>{booking.status}</span></p><p>{booking.seats} seat(s) · Total fare <strong>₹{Number(booking.fare||0).toFixed(2)}</strong></p><p>Offline payment preference: <strong>{booking.paymentMethod==='upi'?'UPI transfer directly to driver':'Cash to driver'}</strong></p><p className="muted">Payment status: not processed in this app. No online payment has been collected.</p>{canCancelBooking&&<button className="btn ghost" disabled={busy} onClick={cancelBooking}>Cancel booking</button>}</div>}</section><aside className="card stack"><h2>Driver & booking</h2><div className="person-avatar">{(ride.driver?.name||'D').slice(0,1).toUpperCase()}</div><h3>{ride.driver?.name||'Driver'}</h3><p className="muted">WayShare member</p>{ride.driver?.email&&<p className="contact-line">Email: <a href={`mailto:${ride.driver.email}`}>{ride.driver.email}</a></p>}{ride.driver?.phone&&<p className="contact-line">Phone: <a href={`tel:${ride.driver.phone}`}>{ride.driver.phone}</a></p>}{(ride.vehicle?.make||ride.vehicle?.model||ride.vehicle?.color||ride.vehicle?.registration)&&<div className="driver-info"><span>Vehicle</span><strong>{[ride.vehicle.make,ride.vehicle.model].filter(Boolean).join(' ')||'Not specified'}</strong>{ride.vehicle.color&&<><span>Color</span><strong>{ride.vehicle.color}</strong></>}{ride.vehicle.registration&&<><span>Registration</span><strong>{ride.vehicle.registration}</strong></>}</div>}{!isDriver&&booking?.status!=='confirmed'&&<p className="muted">Driver contact details become available after the booking is confirmed.</p>}<div className="driver-info"><span>Ride fare</span><strong>₹{ride.totalFare ?? ride.pricePerSeat * ride.seatsTotal} whole journey</strong><span>Seats remaining</span><strong>{ride.seatsAvailable} of {ride.seatsTotal}</strong></div>{isDriver?<><h3>Booking requests</h3>{data.bookings?.length?data.bookings.map(b=><div className="booking-row" key={b._id}><div><b>{b.passenger?.name}</b><small>{b.seats} seat(s) · {b.status} · Fare ₹{Number(b.fare||0).toFixed(2)}</small><small>{b.passenger?.email?`Email: ${b.passenger.email}${b.passenger?.phone?` · Phone: ${b.passenger.phone}`:''}`:'Contact details available after confirmation'} · Payment preference: {b.paymentMethod==='upi'?'UPI transfer':'Cash'}</small></div>{b.status==='pending'&&<div className="row"><button className="btn small" disabled={busy} onClick={()=>action(`/bookings/${b._id}/approve`,{},'PATCH')}>Approve</button><button className="btn ghost small" disabled={busy} onClick={()=>action(`/bookings/${b._id}/reject`,{},'PATCH')}>Reject</button></div>}</div>):<p className="muted">No booking requests yet.</p>}</>:<><h3>Trip safety</h3><p className="muted">Live location is available only to the driver and confirmed passengers while the trip is active and sharing is enabled.</p></>}{isDriver?data.bookings?.filter(b=>b.status==='confirmed'&&b.passenger?._id).map(b=><ChatPanel key={b._id} rideId={id} otherId={b.passenger._id} title={b.passenger.name}/>):booking?.status==='confirmed'&&ride.driver?._id?<ChatPanel rideId={id} otherId={ride.driver._id} title={ride.driver.name}/>:null}</aside></div></Shell>;
}
function LiveShare({rideId,onStatus,onLocation}) {
  const [active,setActive]=useState(false),[starting,setStarting]=useState(false);
  const socketRef=useRef(null), watchRef=useRef(null), startingRef=useRef(false), activeRef=useRef(false);
  useEffect(()=>()=>{if(watchRef.current!=null)navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;socketRef.current?.disconnect();socketRef.current=null;if(activeRef.current){activeRef.current=false;api.post(`/rides/${rideId}/sharing/stop`).catch(()=>{});}},[rideId]);
  async function start(){
    if(startingRef.current||active)return;
    if(!navigator.geolocation)return onStatus('This browser does not support GPS.');
    startingRef.current=true;setStarting(true);
    try{await api.post(`/rides/${rideId}/sharing/start`);}catch(e){startingRef.current=false;setStarting(false);return onStatus(errorMessage(e));}
    const socket=io(socketUrl,{withCredentials:true,transports:['websocket','polling']});socketRef.current=socket;
    socket.on('connect',()=>socket.emit('trip:subscribe',{rideId},res=>{
      if(!res?.ok||!res.sharingActive){onStatus(res?.error||'The server has not enabled trip sharing.');socket.disconnect();socketRef.current=null;startingRef.current=false;setStarting(false);return;}
      setActive(true);activeRef.current=true;startingRef.current=false;setStarting(false);onStatus('Live GPS sharing connected. Keep this page open.');
      if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);
      let lastSent=0;
      watchRef.current=navigator.geolocation.watchPosition(pos=>{
        const now=Date.now();if(now-lastSent<4000||!socket.connected)return;lastSent=now;
        const c=pos.coords;
        socket.emit('driver:location',{rideId,latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,heading:c.heading??undefined,speed:c.speed??undefined,timestamp:now},res2=>{
          if(res2?.ok){onLocation({latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,heading:c.heading,speed:c.speed,updatedAt:new Date(now)});}
          else if(!res2?.throttled)onStatus(res2?.error||'GPS update was rejected by the server.');
        });
      },err=>{const message=err.code===1?'Location permission denied. Allow location access and try again.':'GPS signal unavailable. Check device location settings and try again.';onStatus(message);if(watchRef.current!=null)navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;setActive(false);activeRef.current=false;const failedSocket=socketRef.current;socketRef.current=null;failedSocket?.disconnect();api.post(`/rides/${rideId}/sharing/stop`).catch(()=>{});}, {enableHighAccuracy:true,maximumAge:3000,timeout:20000});
    }));
    socket.on('connect_error',()=>{onStatus('Could not connect to the live tracking server. Check the API URL and sign-in session.');startingRef.current=false;setStarting(false);socket.disconnect();if(socketRef.current===socket)socketRef.current=null;api.post(`/rides/${rideId}/sharing/stop`).catch(()=>{});});
    socket.on('disconnect',()=>{if(activeRef.current)onStatus('Live tracking connection was interrupted; reconnecting if possible…');});
  }
  async function stop(){
    if(watchRef.current!=null)navigator.geolocation?.clearWatch(watchRef.current);watchRef.current=null;activeRef.current=false;
    const socket=socketRef.current;socketRef.current=null;if(socket){socket.emit('trip:unsubscribe',{rideId});socket.disconnect();}
    try{await api.post(`/rides/${rideId}/sharing/stop`);setActive(false);activeRef.current=false;startingRef.current=false;setStarting(false);onStatus('Live location sharing stopped.');}catch(e){onStatus(errorMessage(e));}
  }
  return active?<button className="btn secondary" onClick={stop}>Stop live sharing</button>:<button className="btn" disabled={starting} onClick={start}>{starting?'Connecting…':'Start live GPS sharing'}</button>;
}
function ProfilePage() { const {user,setUser}=useAuth(); return <PhoneVerification user={user} setUser={setUser} Shell={Shell}/>; }
function Protected({children}) { const {user,ready}=useAuth(); if(!ready)return <p className="page-head">Loading…</p>;return user?children:<AuthRedirect/>; }
function AuthRedirect(){const n=useNavigate(), location=useLocation();useEffect(()=>n('/login',{replace:true,state:{from:location.pathname+location.search}}),[n,location.pathname,location.search]);return null;}
function App(){return <BrowserRouter><AuthProvider><Routes><Route path="/" element={<Home/>}/><Route path="/login" element={<AuthPage mode="login"/>}/><Route path="/register" element={<AuthPage mode="register"/>}/><Route path="/verify-email" element={<VerifyEmailPage/>}/><Route path="/find" element={<FindRide/>}/><Route path="/offer" element={<Protected><OfferRide/></Protected>}/><Route path="/dashboard" element={<Protected><Dashboard/></Protected>}/><Route path="/profile" element={<Protected><ProfilePage/></Protected>}/><Route path="/trip/:id" element={<Protected><TripPage/></Protected>}/><Route path="*" element={<Shell><div className="empty"><h1>Page not found</h1><Link to="/">Return home</Link></div></Shell>}/></Routes></AuthProvider></BrowserRouter>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
