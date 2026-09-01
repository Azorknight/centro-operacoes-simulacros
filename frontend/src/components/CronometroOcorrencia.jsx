import { useEffect, useState } from 'react'
import { formatarDuracao } from '../utils/formatacao'

export default function CronometroOcorrencia({ recebidaEm, encerradaEm, totalSegundos }) {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    if (!recebidaEm || encerradaEm) return undefined
    const timer = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [recebidaEm, encerradaEm])

  const segundos = encerradaEm
    ? totalSegundos
    : recebidaEm
      ? Math.max(0, Math.floor((agora - new Date(recebidaEm).getTime()) / 1000))
      : null

  return formatarDuracao(segundos)
}
