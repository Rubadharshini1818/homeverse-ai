import { NavLink, Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../services/authContext.js'

export default function Navbar() {
  const { user, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const links = [['Properties', '/properties'], ['Interior', '/interior'], ['HomeCare', '/homecare'], ['About', '/about'], ['Contact', '/contact']]

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
    } catch (error) {
      setLogoutError(error.message)
    }
  }

  return <header className="site-nav"><div className="nav-inner"><Link className="brand" to="/">HomeVerse</Link>
    <nav className="nav-links"><NavLink to="/" end>Home</NavLink>{links.map(([name, path]) => <NavLink key={path} to={path}>{name}</NavLink>)}</nav>
    <div className="auth-links">{user ? <><Link to="/profile">{user.fullName}</Link><button className="link-button" onClick={handleLogout}>Logout</button></> : <><Link to="/login">Login</Link><Link className="button primary" to="/signup">Sign Up</Link></>}</div>
  </div>{logoutError && <p className="form-error nav-error" role="alert">{logoutError}</p>}</header>
}
