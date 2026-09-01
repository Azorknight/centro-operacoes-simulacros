import { useState } from 'react'

export default function RelogioOperacional() {
  const [agora] = useState(() => Date.now())

  return new Date(agora).toLocaleTimeString('pt-PT', {
    timeZone: 'Atlantic/Azores'
  })
}
