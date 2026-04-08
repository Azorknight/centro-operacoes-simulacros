import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useMapEvents } from 'react-leaflet'

function App() {
  const [recursos, setRecursos] = useState([])

  useEffect(() => {
    fetch('http://127.0.0.1:8000/recursos')
      .then(res => res.json())
      .then(data => setRecursos(data))
  }, [])

  function AdicionarRecurso() {
  useMapEvents({
    click(e) {
      const nome = prompt('Nome do recurso:')
      const tipo = prompt('Tipo:')
      const estado = 'disponivel'
      let ilha = 'Terceira'

        if (e.latlng.lng < -28.2) {
          ilha = 'São Jorge'
        } else if (e.latlng.lng < -27.7) {
          ilha = 'Graciosa'
        }

      fetch('http://127.0.0.1:8000/recursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          tipo,
          estado,
          ilha,
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        })
      }).then(() => {
        window.location.reload()
      })
    }
  })

  return null
}

  return (
    <MapContainer
      center={[38.65, -27.22]}
      zoom={10}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; Esri'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
      />

      <AdicionarRecurso />

      {recursos.map((r) =>
        r.latitude && r.longitude ? (
          <Marker key={r.id} position={[r.latitude, r.longitude]}>
            <Popup>
              {r.nome} <br />
              {r.tipo} <br />
              {r.estado}
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  )
}

export default App