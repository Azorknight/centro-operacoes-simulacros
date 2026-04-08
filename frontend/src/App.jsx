import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMapEvents } from 'react-leaflet'

function AdicionarRecurso() {
  useMapEvents({
    click(e) {
      if (e.originalEvent.ctrlKey) return

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

function AdicionarOcorrencia() {
  useMapEvents({
    click(e) {
      if (!e.originalEvent.ctrlKey) return

      const titulo = prompt('Título da ocorrência:')
      const tipo = prompt('Tipo da ocorrência:')
      const descricao = prompt('Descrição da ocorrência:')
      const estado = 'aberta'
      let ilha = 'Terceira'

      if (e.latlng.lng < -28.2) {
        ilha = 'São Jorge'
      } else if (e.latlng.lng < -27.7) {
        ilha = 'Graciosa'
      }

      fetch('http://127.0.0.1:8000/ocorrencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          descricao,
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

function App() {
  const [recursos, setRecursos] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])

  useEffect(() => {
    fetch('http://127.0.0.1:8000/recursos')
      .then(res => res.json())
      .then(data => setRecursos(data))

    fetch('http://127.0.0.1:8000/ocorrencias')
      .then(res => res.json())
      .then(data => setOcorrencias(data))
  }, [])

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
        }}
      >
        <strong>Centro de Operações e Simulacros</strong>
        <br />
        Click esquerdo: criar recurso
        <br />
        CTRL + Click esquerdo: criar ocorrência
      </div>

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
        <AdicionarOcorrencia />

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

        {ocorrencias.map((o) =>
          o.latitude && o.longitude ? (
            <CircleMarker key={o.id} center={[o.latitude, o.longitude]} radius={10}>
              <Popup>
                {o.titulo} <br />
                {o.tipo} <br />
                {o.estado}
              </Popup>
            </CircleMarker>
          ) : null
        )}
      </MapContainer>
    </>
  )
}

export default App