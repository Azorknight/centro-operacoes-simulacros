import { useMapEvents } from 'react-leaflet'
import { atualizarPosicaoElemento } from '../services/api'

export default function GestorCliquesMapa({ modoMapa, refresh, modoConsulta, concluirModo }) {
  useMapEvents({
    async click(e) {
      if (modoConsulta || !modoMapa || modoMapa.tipo === 'normal') return

      if (modoMapa.tipo === 'apear_elemento' && modoMapa.alvo) {
        await atualizarPosicaoElemento(
          modoMapa.alvo.id,
          e.latlng.lat,
          e.latlng.lng
        )
        concluirModo?.()
        await refresh()
        return
      }

      if (modoMapa.tipo === 'novo_recurso') {
        window.dispatchEvent(new CustomEvent('abrir-form-recurso', {
          detail: { latitude: e.latlng.lat, longitude: e.latlng.lng }
        }))
        concluirModo?.()
        return
      }

      if (modoMapa.tipo === 'nova_ocorrencia') {
        window.dispatchEvent(new CustomEvent('abrir-form-ocorrencia', {
          detail: { latitude: e.latlng.lat, longitude: e.latlng.lng }
        }))
        concluirModo?.()
      }
    },
  })

  return null
}
