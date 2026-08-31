function PainelTimeline({ timeline, styles }) {
  return (
    <>
      <strong style={styles.sectionTitle}>Timeline</strong>

      {timeline.slice(0, 20).map((t) => {
        let color = '#111827'

        switch (t.tipo) {
          case 'recurso':
            color = '#2563eb'
            break

          case 'ocorrencia':
            color = '#dc2626'
            break

          case 'movimento':
            color = '#16a34a'
            break

          case 'missao':
            color = '#7c3aed'
            break

          case 'ordem':
            color = '#ea580c'
            break

          case 'chegada':
            color = '#059669'
            break

          default:
            color = '#111827'
        }

        return (
          <div
            key={t.id}
            style={{
              ...styles.itemCard,
              borderLeft: `4px solid ${color}`
            }}
          >
            <div
              style={{
                ...styles.itemMeta,
                color
              }}
            >
              {t.tipo} ·{' '}
              {new Date(t.criado_em).toLocaleString('pt-PT', {
                timeZone: 'Atlantic/Azores',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>

            <div style={styles.itemTitle}>
              {t.descricao}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default PainelTimeline