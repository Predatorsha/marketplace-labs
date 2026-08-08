import type { HumanGatePayload } from '../../../shared/types'

type Props = {
  gate: HumanGatePayload | null
  onContinue: () => void
  onCancel: () => void
}

export default function HumanGateModal({ gate, onContinue, onCancel }: Props): React.JSX.Element | null {
  if (!gate) return null

  const title = gate.kind === 'login' ? 'Нужен логин' : 'Нужна капча'
  // Platform-specific text comes from main auth modules (temu / aliexpress).
  const message =
    gate.message ||
    (gate.kind === 'login'
      ? 'Войдите в аккаунт в окне браузера, затем продолжите.'
      : 'Пройдите проверку в окне браузера, затем продолжите.')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="modal">
        <h2 id="gate-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="continue" onClick={onContinue}>
            Продолжить
          </button>
        </div>
      </div>
    </div>
  )
}
