interface ViewSwitchOption<T extends string> {
  id: T
  label: string
}

interface ViewSwitchProps<T extends string> {
  options: ViewSwitchOption<T>[]
  active: T
  onChange: (id: T) => void
}

/** タブバーで統合された画面同士 (リスト/ルート、マップ/ジャンル) を切り替える、画面上部のセグメントコントロール。 */
export function ViewSwitch<T extends string>({ options, active, onChange }: ViewSwitchProps<T>) {
  return (
    <div className="floortabs view-switch">
      {options.map((opt) => (
        <button key={opt.id} type="button" aria-pressed={active === opt.id} onClick={() => onChange(opt.id)}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}
