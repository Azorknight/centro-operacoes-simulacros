import { useEffect } from 'react'
import {
  MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents
} from 'react-leaflet'

function Escolha({ latitude, longitude, disabled, onEscolher }) {
  const mapa = useMap()
  const lat = latitude === '' ? NaN : Number(latitude)
  const lon = longitude === '' ? NaN : Number(longitude)
  const valida = Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180

  useMapEvents({
    click(evento) {
      if (!disabled) {
        onEscolher(
          Number(evento.latlng.lat.toFixed(7)),
          Number(evento.latlng.lng.toFixed(7))
        )
      }
    }
  })

  useEffect(() => {
    if (valida) mapa.panTo([lat, lon])
  }, [mapa, valida, lat, lon])

  useEffect(() => {
    const contentor = mapa.getContainer()
    const observador = new ResizeObserver(() => mapa.invalidateSize())
    observador.observe(contentor)
    mapa.invalidateSize()
    return () => observador.disconnect()
  }, [mapa])

  return valida ? (
    <CircleMarker center={[lat, lon]} radius={9}
      pathOptions={{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.85 }}>
      <Tooltip permanent>{'Nova base'}</Tooltip>
    </CircleMarker>
  ) : null
}

export default function MapaBaseInicial({
  latitude, longitude, bases, disabled, onEscolher
}) {
  const primeira = bases.find((base) =>
    Number.isFinite(Number(base.latitude)) &&
    Number.isFinite(Number(base.longitude)))
  const centro = primeira
    ? [Number(primeira.latitude), Number(primeira.longitude)]
    : [38.65, -27.22]

  return (
    <div style={{
      height: 320, width: '100%', position: 'relative',
      zIndex: 0, marginBottom: 12
    }}>
      <MapContainer center={centro} zoom={11} scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />
        {bases.map((base) => (
          <CircleMarker key={base.id}
            center={[Number(base.latitude), Number(base.longitude)]}
            radius={6}
            pathOptions={{ color: '#1d4ed8', fillOpacity: 0.65 }}
            eventHandlers={{
              click(evento) {
                if (!disabled) onEscolher(evento.latlng.lat, evento.latlng.lng)
              }
            }}>
            <Tooltip>{base.nome}</Tooltip>
          </CircleMarker>
        ))}
        <Escolha latitude={latitude} longitude={longitude}
          disabled={disabled} onEscolher={onEscolher} />
      </MapContainer>
    </div>
  )
}
