import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Tooltip,
  useMapEvents,
  Polyline,
} from 'react-leaflet'
import L from 'leaflet'

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
          longitude: e.latlng.lng,
        }),
      }).then(() => {
        window.location.reload()
      })
    },
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
          longitude: e.latlng.lng,
        }),
      }).then(() => {
        window.location.reload()
      })
    },
  })

  return null
}

function App() {
  const [recursos, setRecursos] = useState([])
  const [ocorrencias, setOcorrencias] = useState([])
  const [bases, setBases] = useState([])
  const [timeline, setTimeline] = useState([])
  const [ordens, setOrdens] = useState([])
  const [missoes, setMissoes] = useState([])
  const [mostrarSoAtivos, setMostrarSoAtivos] = useState(false)

  const mapRef = useRef()

  useEffect(() => {
    fetch('http://127.0.0.1:8000/recursos')
      .then((res) => res.json())
      .then((data) => setRecursos(data))

    fetch('http://127.0.0.1:8000/ocorrencias')
      .then((res) => res.json())
      .then((data) => setOcorrencias(data))

    fetch('http://127.0.0.1:8000/bases')
      .then((res) => res.json())
      .then((data) => setBases(data))

    fetch('http://127.0.0.1:8000/timeline')
      .then((res) => res.json())
      .then((data) => setTimeline(data))

    fetch('http://127.0.0.1:8000/ordens')
      .then((res) => res.json())
      .then((data) => setOrdens(data))

    fetch('http://127.0.0.1:8000/missoes')
      .then((res) => res.json())
      .then((data) => setMissoes(data))
  }, [])

  function mudarEstado(id, novoEstado) {
    fetch(`http://127.0.0.1:8000/recursos/${id}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: novoEstado }),
    }).then(() => {
      window.location.reload()
    })
  }

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
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          maxWidth: '320px',
        }}
      >
        <strong>Centro de Operações e Simulacros</strong>
        <br />
        <label>
          <input
            type="checkbox"
            checked={mostrarSoAtivos}
            onChange={(e) => setMostrarSoAtivos(e.target.checked)}
          />
          {' '}Mostrar só ativos
        </label>

        <br /><br />
        Disponíveis: {recursos.filter((r) => r.estado === 'disponivel').length}
        <br />
        Em missão: {recursos.filter((r) => r.estado === 'em_missao').length}

        <br /><br />
        Click esquerdo: criar recurso
        <br />
        CTRL + Click esquerdo: criar ocorrência

        <br /><br />
        <strong>Timeline</strong>
        <br />
        {timeline.slice(0, 5).map((t) => {
          let color = 'black'
          if (t.tipo === 'recurso') color = 'blue'
          if (t.tipo === 'ocorrencia') color = 'red'
          if (t.tipo === 'movimento') color = 'green'
          if (t.tipo === 'missao') color = 'purple'
          if (t.tipo === 'ordem') color = 'orange'

          return (
            <div key={t.id} style={{ color }}>
              {t.tipo}: {t.descricao}
            </div>
          )
        })}

        <br />
        <strong>Legenda</strong>
        <br />
        <div>🔵 Recurso normal</div>
        <div>🟡 Ordem emitida</div>
        <div>🟠 Ordem executada</div>
        <div>🔴 Ocorrência</div>
        <div>⚪ Missão planeada</div>
        <div>🟢 Missão concluída</div>
        <div>🔵 Base</div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          background: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          maxHeight: '80vh',
          overflowY: 'auto',
          width: '280px',
        }}
      >
        <strong>Recursos</strong>
        <br />
        {recursos
          .filter(
            (r) =>
              !mostrarSoAtivos ||
              r.estado === 'disponivel' ||
              r.estado === 'em_missao'
          )
          .map((r) => (
            <div key={r.id}>
              {r.nome} ({r.estado})
            </div>
          ))}

        <br />
        <strong>Ocorrências</strong>
        <br />
        {ocorrencias
          .filter((o) => !mostrarSoAtivos || o.estado !== 'fechada')
          .map((o) => (
            <div
              key={o.id}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (o.latitude && o.longitude && mapRef.current) {
                  mapRef.current.setView([o.latitude, o.longitude], 13)
                }
              }}
            >
              {o.titulo}
            </div>
          ))}

        <br />
        <strong>Ordens</strong>
        <br />
        {ordens.map((o) => (
          <div key={o.id}>
            {o.titulo} ({o.estado})
            <br />
            <button
              onClick={() => {
                fetch(`http://127.0.0.1:8000/ordens/${o.id}/estado`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ estado: 'executada' }),
                }).then(() => window.location.reload())
              }}
            >
              Executar
            </button>
            <button
              onClick={() => {
                fetch(`http://127.0.0.1:8000/ordens/${o.id}/estado`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ estado: 'concluida' }),
                }).then(() => window.location.reload())
              }}
            >
              Concluir
            </button>
            <br /><br />
          </div>
        ))}

        <br />
        <strong>Missões</strong>
        <br />
        {missoes
          .filter((m) => !mostrarSoAtivos || m.estado !== 'concluida')
          .map((m) => {
            const recurso = recursos.find((r) => r.id === m.recurso_id)

            return (
              <div
                key={m.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (mapRef.current) {
                    const recursoMapa = recursos.find((r) => r.id === m.recurso_id)
                    const ocorrenciaMapa = ocorrencias.find((o) => o.id === m.ocorrencia_id)

                    if (
                      recursoMapa &&
                      recursoMapa.latitude &&
                      recursoMapa.longitude
                    ) {
                      mapRef.current.setView(
                        [recursoMapa.latitude, recursoMapa.longitude],
                        13
                      )
                    } else if (
                      ocorrenciaMapa &&
                      ocorrenciaMapa.latitude &&
                      ocorrenciaMapa.longitude
                    ) {
                      mapRef.current.setView(
                        [ocorrenciaMapa.latitude, ocorrenciaMapa.longitude],
                        13
                      )
                    }
                  }
                }}
              >
                {m.titulo} ({m.prioridade}) - {m.estado}
                {recurso && (
                  <div style={{ fontSize: '0.9em', color: 'gray' }}>
                    → {recurso.nome}
                  </div>
                )}

                <br />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const recursoId = prompt('ID do recurso:')
                    if (recursoId) {
                      fetch(
                        `http://127.0.0.1:8000/missoes/${m.id}/atribuir-recurso/${recursoId}`,
                        { method: 'PUT' }
                      ).then(() => window.location.reload())
                    }
                  }}
                >
                  Atribuir recurso
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    fetch(`http://127.0.0.1:8000/missoes/${m.id}/concluir`, {
                      method: 'PUT',
                    }).then(() => window.location.reload())
                  }}
                >
                  Concluir missão
                </button>
                <br /><br />
              </div>
            )
          })}
      </div>

      <MapContainer
        center={[38.65, -27.22]}
        zoom={10}
        style={{ height: '100vh', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution="&copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />

        <AdicionarRecurso />
        <AdicionarOcorrencia />

        {recursos
          .filter(
            (r) =>
              !mostrarSoAtivos ||
              r.estado === 'disponivel' ||
              r.estado === 'em_missao'
          )
          .map((r) => {
            if (!r.latitude || !r.longitude) return null

            const ordensRecurso = ordens.filter((o) => o.recurso_id === r.id)
            const ordem =
              ordensRecurso.length > 0
                ? ordensRecurso.reduce((latest, current) =>
                    new Date(current.criado_em) > new Date(latest.criado_em)
                      ? current
                      : latest
                  )
                : null

            return (
              <Marker
                key={r.id}
                position={[r.latitude, r.longitude]}
                draggable={true}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: ${
                      ordem?.estado === 'emitida'
                        ? 'yellow'
                        : ordem?.estado === 'executada'
                        ? 'orange'
                        : 'blue'
                    };
                    border: 3px solid white;
                    box-shadow: 0 0 4px rgba(0,0,0,0.5);
                  "></div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
                eventHandlers={{
                  dragend: (e) => {
                    const lat = e.target.getLatLng().lat
                    const lng = e.target.getLatLng().lng

                    fetch(`http://127.0.0.1:8000/recursos/${r.id}/posicao`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        latitude: lat,
                        longitude: lng,
                      }),
                    }).then(() => {
                      window.location.reload()
                    })
                  },
                }}
              >
                <Popup>
                  {r.nome} <br />
                  {r.tipo} <br />
                  Estado: {r.estado}
                  <br /><br />

                  <button onClick={() => mudarEstado(r.id, 'em_missao')}>
                    Em missão
                  </button>
                  <br />
                  <button onClick={() => mudarEstado(r.id, 'disponivel')}>
                    Disponível
                  </button>
                  <br />
                  <button
                    onClick={() => {
                      const ocorrenciaId = prompt('ID da ocorrência:')
                      if (ocorrenciaId) {
                        fetch(
                          `http://127.0.0.1:8000/recursos/${r.id}/atribuir-ocorrencia/${ocorrenciaId}`,
                          { method: 'PUT' }
                        ).then(() => {
                          window.location.reload()
                        })
                      }
                    }}
                  >
                    Atribuir a ocorrência
                  </button>

                  <br /><br />
                  <button
                    onClick={() => {
                      const titulo = prompt('Título da ordem:')
                      const descricao = prompt('Descrição:')
                      const ocorrenciaId = prompt('ID da ocorrência (opcional):')

                      fetch('http://127.0.0.1:8000/ordens', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          titulo,
                          descricao,
                          estado: 'emitida',
                          recurso_id: r.id,
                          ocorrencia_id: ocorrenciaId ? parseInt(ocorrenciaId) : null,
                        }),
                      }).then(() => {
                        window.location.reload()
                      })
                    }}
                  >
                    Criar ordem
                  </button>
                </Popup>

                <Tooltip permanent direction="top">
                  {r.nome}
                </Tooltip>
              </Marker>
            )
          })}

        {ocorrencias
          .filter((o) => !mostrarSoAtivos || o.estado !== 'fechada')
          .map((o) =>
            o.latitude && o.longitude ? (
              <>
                <CircleMarker
                  key={`oc-${o.id}`}
                  center={[o.latitude, o.longitude]}
                  radius={10}
                  pathOptions={{ color: 'red' }}
                >
                  <Popup>
                    {o.titulo} <br />
                    {o.tipo} <br />
                    {o.estado}
                    <br /><br />
                    <button
                      onClick={() => {
                        const titulo = prompt('Título da missão:')
                        const descricao = prompt('Descrição:')
                        const prioridade = prompt('Prioridade (baixa, media, alta):')

                        fetch('http://127.0.0.1:8000/missoes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            titulo,
                            descricao,
                            prioridade,
                            estado: 'planeada',
                            recurso_id: null,
                            ocorrencia_id: o.id,
                          }),
                        }).then(() => {
                          window.location.reload()
                        })
                      }}
                    >
                      Criar missão
                    </button>
                  </Popup>
                </CircleMarker>

                {missoes
                  .filter((m) => m.ocorrencia_id === o.id)
                  .map((m) => {
                    let color = 'gray'
                    if (m.estado === 'em_execucao') color = 'red'
                    if (m.estado === 'concluida') color = 'green'

                    return (
                      <CircleMarker
                        key={`missao-${m.id}`}
                        center={[o.latitude, o.longitude]}
                        radius={16}
                        pathOptions={{ color, fillOpacity: 0 }}
                      />
                    )
                  })}
              </>
            ) : null
          )}

        {bases.map((b) =>
          b.latitude && b.longitude ? (
            <CircleMarker
              key={b.id}
              center={[b.latitude, b.longitude]}
              radius={12}
              pathOptions={{ color: 'blue' }}
            >
              <Popup>
                {b.nome} <br />
                {b.tipo}
              </Popup>
            </CircleMarker>
          ) : null
        )}

        {recursos.map((r) => {
          if (!r.ocorrencia_id) return null

          const ocorrencia = ocorrencias.find((o) => o.id === r.ocorrencia_id)
          if (!ocorrencia || !r.latitude || !r.longitude) return null

          return (
            <Polyline
              key={`linha-${r.id}`}
              positions={[
                [r.latitude, r.longitude],
                [ocorrencia.latitude, ocorrencia.longitude],
              ]}
            />
          )
        })}
      </MapContainer>
    </>
  )
}

export default App