export function Label({ children }) {
  return <div className="label">{children}</div>
}

export function Field({ children }) {
  return <div className="field">{children}</div>
}

export function Stamp({ ok, label }) {
  return (
    <span className={`stamp ${ok ? 'stamp--ok' : 'stamp--no'}`}>
      {label ?? (ok ? 'CLEARED' : 'REFUSED')}
    </span>
  )
}

export function Button({ children, ghost, ...rest }) {
  return (
    <button className={`btn${ghost ? ' btn--ghost' : ''}`} {...rest}>
      {children}
    </button>
  )
}

export function Chip({ on, children, ...rest }) {
  return (
    <button className={`chip${on ? ' chip--on' : ''}`} aria-pressed={on} {...rest}>
      {children}
    </button>
  )
}

export function Input(props) {
  return <input className="input" {...props} />
}

export function Select({ children, ...rest }) {
  return (
    <select className="select" {...rest}>
      {children}
    </select>
  )
}
