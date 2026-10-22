const TIPOS_MEIO = ['Ambulância', 'Bombeiros', 'PSP', 'GNR', 'Moto', 'Drone', 'Outro']

export default function TipoMeioSelect({ value = '', onChange, ...props }) {
  const tipoAntigo = value && !TIPOS_MEIO.includes(value)
  return (
    <select {...props} value={value} onChange={onChange}>
      <option value="">Selecionar tipo...</option>
      {tipoAntigo && <option value={value}>{value} (tipo existente)</option>}
      {TIPOS_MEIO.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
    </select>
  )
}
