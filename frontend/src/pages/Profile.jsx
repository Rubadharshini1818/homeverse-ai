import { Link } from 'react-router-dom'
import CustomerDashboard from '../components/profile/CustomerDashboard'
import OwnerDashboard from '../components/profile/OwnerDashboard'
import PartnerDashboard from '../components/profile/PartnerDashboard'
import { useAuth } from '../services/authContext.js'

export default function Profile() {
  const { user, loading } = useAuth()
  if (loading) return <main className="wrap simple-page"><p>Loading your account…</p></main>
  if (!user) return <main className="wrap simple-page"><h1>Sign in required</h1><p>Your account and saved activity are available after you sign in.</p><Link className="button primary" to="/login">Login</Link></main>
  if (user.role === 'PROPERTY_OWNER') return <OwnerDashboard key={user.id} user={user} />
  if (user.role === 'HOME_PARTNER') return <PartnerDashboard key={user.id} user={user} />
  return <CustomerDashboard key={user.id} user={user} />
}
