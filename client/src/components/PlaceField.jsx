import React, { useEffect, useState } from 'react';
import { searchPlaces } from '../maps';
export default function PlaceField({ label, value, onChange }) {
  const [query,setQuery] = useState(value?.label || ''), [results,setResults] = useState([]), [err,setErr] = useState('');
  useEffect(()=>setQuery(value?.label || ''),[value?.label]);
  useEffect(()=>{ if(query.trim().length<3) {setResults([]);return;} const controller=new AbortController(); const timer=setTimeout(async()=>{try{setErr('');setResults(await searchPlaces(query,controller.signal));}catch(e){if(e.name!=='AbortError')setErr(e.message);}},350); return ()=>{clearTimeout(timer);controller.abort();};},[query]);
  return <div className="place-field"><label>{label}<input value={query} placeholder="Search a place or address…" onChange={e=>{setQuery(e.target.value);onChange(null);}} autoComplete="off"/></label>{err&&<small className="error">{err}</small>}{results.length>0&&<div className="suggestions">{results.map((p,i)=><button type="button" key={`${p.lat}-${p.lon}-${i}`} onClick={()=>{onChange(p);setQuery(p.label);setResults([]);}}><b>{p.label}</b><small>{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</small></button>)}</div>}{value&&<small className="confirmed">✓ Selected: {value.label}</small>}</div>;
}
