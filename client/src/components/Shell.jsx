import React from 'react';
import { Link, NavLink } from 'react-router-dom';
export default function Shell({ children, user, logout }) {
  return <><header className="topbar"><Link className="brand" to="/"><span className="brand-icon">W</span> WayShare</Link><nav><NavLink to="/find">Find a ride</NavLink><NavLink to="/offer">Offer a ride</NavLink>{user && <><NavLink to="/dashboard">My trips</NavLink><NavLink to="/profile">Profile</NavLink></>}</nav><div className="nav-actions">{user ? <><span className="user-name">{user.name}</span><button className="btn ghost small" onClick={logout}>Log out</button></> : <><Link to="/login">Log in</Link><Link className="btn small" to="/register">Join free</Link></>}</div></header><main>{children}</main><footer>WayShare · Shared journeys, smarter travel <span>Map data © OpenStreetMap contributors</span></footer></>;
}
