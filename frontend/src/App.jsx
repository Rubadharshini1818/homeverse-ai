import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { AuthProvider } from './services/auth.jsx'
import Home from './pages/Home'
import Properties from './pages/Properties'
import PropertyDetails from './pages/PropertyDetails'
import Interior from './pages/Interior'
import HomeCare from './pages/HomeCare'
import ProviderProfile from './pages/ProviderProfile'
import About from './pages/About'
import Contact from './pages/Contact'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Profile from './pages/Profile'

export default function App() {
  return <AuthProvider><Navbar /><Routes>
    <Route path="/" element={<Home />} /><Route path="/properties" element={<Properties />} />
    <Route path="/properties/:id" element={<PropertyDetails />} /><Route path="/interior" element={<Interior />} />
    <Route path="/homecare" element={<HomeCare />} /><Route path="/provider/:id" element={<ProviderProfile />} />
    <Route path="/about" element={<About />} /><Route path="/contact" element={<Contact />} />
    <Route path="/login" element={<Login />} /><Route path="/signup" element={<Signup />} />
    <Route path="/profile" element={<Profile />} /><Route path="*" element={<Navigate to="/" replace />} />
  </Routes><Footer /></AuthProvider>
}
