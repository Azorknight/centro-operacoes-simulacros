import { useEffect, useState } from 'react'

export default function RelogioOperacional() {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(intervalo)
  }, [])

  return new Date(agora).toLocaleTimeString('pt-PT', {
    timeZone: 'Atlantic/Azores'
  })
}
