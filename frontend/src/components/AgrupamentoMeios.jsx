import { useMemo, useState } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

export default function AgrupamentoMeios({
  recursos, elementos, onSelecionar, children
}) {
  const mapa = useMap()
  const [zoom, setZoom] = useState(mapa.getZoom())

  useMapEvents({
    zoomend() { setZoom(mapa.getZoom()) }
  })

  const resultado = useMemo(() => {
    const pontos = [
      ...recursos.map((dados) => ({ tipo: 'recurso', dados })),
      ...elementos.map((dados) => ({ tipo: 'elemento', dados }))
    ].filter(({ dados }) =>
      Number.isFinite(dados.latitude) && Number.isFinite(dados.longitude))

    const pais = pontos.map((_, i) => i)
    function raiz(i) {
      while (pais[i] !== i) {
        pais[i] = pais[pais[i]]
        i = pais[i]
      }
      return i
    }

    const pixels = pontos.map(({ dados }) =>
      mapa.project([dados.latitude, dados.longitude], zoom))

    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        if (pixels[i].distanceTo(pixels[j]) <= 40) {
          pais[raiz(j)] = raiz(i)
        }
      }
    }

    const conjuntos = new Map()
    pontos.forEach((ponto, i) => {
      const chave = raiz(i)
      if (!conjuntos.has(chave)) conjuntos.set(chave, [])
      conjuntos.get(chave).push(ponto)
    })

    const grupos = []
    const recursosAgrupados = new Set()
    const elementosAgrupados = new Set()

    conjuntos.forEach((membros) => {
      if (membros.length < 2) return
      membros.forEach(({ tipo, dados }) => {
        const ids = tipo === 'recurso' ? recursosAgrupados : elementosAgrupados
        ids.add(dados.id)
      })
      grupos.push({
        chave: membros.map((m) => `${m.tipo}:${m.dados.id}`).sort().join('|'),
        membros,
        centro: [
          membros.reduce((s, m) => s + m.dados.latitude, 0) / membros.length,
          membros.reduce((s, m) => s + m.dados.longitude, 0) / membros.length
        ]
      })
    })

    return {
      grupos,
      recursosVisiveis: recursos.filter((r) => !recursosAgrupados.has(r.id)),
      elementosVisiveis: elementos.filter((e) => !elementosAgrupados.has(e.id))
    }
  }, [recursos, elementos, mapa, zoom])

  return (
    <>
      {children(resultado)}
      {resultado.grupos.map((grupo) => (
        <Marker key={grupo.chave} position={grupo.centro}
          icon={L.divIcon({
            className: '',
            html: `<div style="width:40px;height:40px;border-radius:50%;
              background:#334155;color:white;border:3px solid white;
              box-shadow:0 1px 5px #0008;display:flex;align-items:center;
              justify-content:center;font-size:16px;font-weight:bold;
              box-sizing:border-box">${grupo.membros.length}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          })}>
          <Popup>
            <strong>Meios neste grupo ({grupo.membros.length})</strong>
            <p>Selecione um meio para abrir a ficha.</p>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {grupo.membros.map(({ tipo, dados }) => (
                <button key={`${tipo}:${dados.id}`} type="button"
                  style={{
                    display: 'block', width: '100%', marginBottom: 6,
                    padding: 8, textAlign: 'left', cursor: 'pointer'
                  }}
                  onClick={() => {
                    mapa.closePopup()
                    onSelecionar(tipo, dados)
                  }}>
                  <strong>{dados.indicativo_radio || dados.nome}</strong>
                  <br />
                  {tipo === 'recurso' ? 'Recurso' : 'Elemento'}
                  {' / '}{dados.nome}
                </button>
              ))}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
