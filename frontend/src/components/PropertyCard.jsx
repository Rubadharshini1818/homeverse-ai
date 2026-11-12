import { Link } from 'react-router-dom'
import { formatRupees } from '../services/api'

export default function PropertyCard({ property }) {
  return <Link className="card property-link" to={`/properties/${encodeURIComponent(property.id)}`}>
    <div className="card-image">{property.image
      ? <img src={property.image} alt={property.title} />
      : <div className="image-empty">No image uploaded</div>}
      <span className="badge">{property.type === 'buy' ? 'For sale' : property.type === 'rent' ? 'For rent' : 'Land'}</span>
    </div>
    <div className="card-body"><span className="type">{property.location}</span><h3>{property.title}</h3>
      <div className="location">{property.description}</div>
      <strong className="price">{formatRupees(property.price)}{property.type === 'rent' ? ' / month' : ''}</strong>
      <div className="facts"><span>{property.beds}</span><span>{property.baths}</span><span>{property.area}</span></div>
      <span className="button primary">Explore property</span>
    </div>
  </Link>
}
