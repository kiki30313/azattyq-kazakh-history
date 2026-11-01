import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'

export type MapLocation = {
  name: string
  period: string
  description: string
  people: string
  position: [number, number]
  zoom: number
}

type HistoricalMapProps = {
  locations: MapLocation[]
  selectedLocation: MapLocation
  onSelectLocation: (location: MapLocation) => void
}

const initialCenter: [number, number] = [47.2, 67.5]
const initialZoom = 5

function MapControls({ map }: { map: L.Map }) {
  return (
    <div className="historical-map-controls" aria-label="Карта масштабы">
      <button className="historical-map-control-button" type="button" onClick={() => map.zoomIn(1, { animate: false })} aria-label="Картаны үлкейту">+</button>
      <button className="historical-map-control-button" type="button" onClick={() => map.zoomOut(1, { animate: false })} aria-label="Картаны кішірейту">−</button>
      <button
        className="historical-map-control-button"
        type="button"
        onClick={() => map.setView(initialCenter, initialZoom, { animate: false })}
        aria-label="Картаның бастапқы көрінісін қалпына келтіру"
        title="Бастапқы көрініс"
      >
        ↺
      </button>
    </div>
  )
}

function MapInstanceReporter({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap()

  useEffect(() => onReady(map), [map, onReady])

  return null
}

function SelectedLocationController({ location }: { location: MapLocation }) {
  const map = useMap()
  const previousLocation = useRef(location.name)

  useEffect(() => {
    if (previousLocation.current === location.name) return
    previousLocation.current = location.name
    map.flyTo(location.position, location.zoom, { duration: 0.6 })
  }, [location, map])

  return null
}

function MapSizeObserver() {
  const map = useMap()

  useEffect(() => {
    let previousWidth = 0
    let previousHeight = 0
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width === previousWidth && height === previousHeight) return
      previousWidth = width
      previousHeight = height
      map.invalidateSize({ pan: false })
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])

  return null
}

export default function HistoricalMap({
  locations,
  selectedLocation,
  onSelectLocation,
}: HistoricalMapProps) {
  const [map, setMap] = useState<L.Map | null>(null)

  return (
    <div className="history-map-frame">
      <MapContainer
        className="historical-leaflet-map"
        center={initialCenter}
        zoom={initialZoom}
        minZoom={4}
        maxZoom={12}
        scrollWheelZoom
        keyboard
        zoomControl={false}
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInstanceReporter onReady={setMap} />
        {locations.map((location, index) => (
          <Marker
            key={location.name}
            position={location.position}
            icon={L.divIcon({
              className: 'historical-map-marker-icon',
              html: `<span>${index + 1}</span>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
            eventHandlers={{ click: () => onSelectLocation(location) }}
          />
        ))}
        <SelectedLocationController location={selectedLocation} />
        <MapSizeObserver />
      </MapContainer>
      {map && <MapControls map={map} />}
    </div>
  )
}
