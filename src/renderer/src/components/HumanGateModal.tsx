import type { HumanGatePayload } from '../../../shared/types'

type Props = {
  gate: HumanGatePayload | null
  onContinue: () => void
  onCancel: () => void
}

export default function HumanGateModal({ gate, onContinue, onCancel }: Props): React.JSX.Element | null {
  if (!gate) return null

  const title = gate.kind === 'login' ? 'Нужен логин' : 'Нужна капча'
  const site = gate.platform === 'temu' ? 'Temu' : 'AliExpress'

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="modal">
        <h2 id="gate-title">{title}</h2>
        <p>
          {gate.message ||
            (gate.kind === 'login'
              ? `${site}: войдите в аккаунт в окне браузера, затем продолжите.`
              : `${site}: пройдите проверку в окне браузера, затем продолжите.`)}
        </p>
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
