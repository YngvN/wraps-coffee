import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { useTheme } from '../hooks/useTheme'
import './LocationMap.scss'

/** Coordinates for Wraps & Coffee, Ulvenveien 82 E, 0581 Oslo. */
const CAFE_POSITION: [number, number] = [59.925805, 10.812145]

// react-leaflet doesn't bundle marker icon assets correctly with Vite by
// default, so the icon URLs are provided explicitly here.
const markerIcon2xUrl = new URL(markerIcon2x, import.meta.url).href
const markerIconUrl = new URL(markerIcon, import.meta.url).href
const markerShadowUrl = new URL(markerShadow, import.meta.url).href

const cafeMarkerIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

/** Props for {@link LocationMap}. */
interface LocationMapProps {
  /** Text shown in the marker's popup, e.g. the cafe's name and address. */
  popupText: string
}

/**
 * An OpenStreetMap embed (via Leaflet) showing the location of Wraps &
 * Coffee, with a marker and popup. Map tiles are inverted in dark mode to
 * match the active theme.
 */
export function LocationMap({ popupText }: LocationMapProps) {
  const { theme } = useTheme()

  return (
    <div className={`location-map${theme === 'dark' ? ' location-map--dark' : ''}`}>
      <MapContainer center={CAFE_POSITION} zoom={15} scrollWheelZoom={false} className="location-map__container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={CAFE_POSITION} icon={cafeMarkerIcon}>
          <Popup>{popupText}</Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
