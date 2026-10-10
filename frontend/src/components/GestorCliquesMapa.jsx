import { useRef } from 'react'
import { useMapEvents } from 'react-leaflet'
import { atualizarPosicaoElemento, reposicionarMeioMapa } from '../services/api'

export default function GestorCliquesMapa({ modoMapa, refresh, modoConsulta, concluirModo, operacaoId }) {
  const guardando = useRef(false)
  useMapEvents({
    async click(e) {
      if (modoConsulta || !modoMapa || modoMapa.tipo === 'normal') return

      if (modoMapa.tipo === 'reposicionar_meio' && modoMapa.alvo) {
        if (guardando.current) return
        guardando.current = true
        try {
          await reposicionarMeioMapa(
            operacaoId, modoMapa.tipoMeio, modoMapa.alvo.id,
            e.latlng.lat, e.latlng.lng
          )
          concluirModo?.()
          await refresh()
        } catch (erro) {
          alert(erro.message || 'N\u00e3o foi poss\u00edvel reposicionar o meio.')
        } finally {
          guardando.current = false
        }
        return
      }

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
