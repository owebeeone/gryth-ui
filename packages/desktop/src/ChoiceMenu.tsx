import './choiceMenu.css';

/** The host owns selection/open state in its taps; the shell owns accessible presentation. */
export interface ChoiceMenuOption { id: string; label: string }
function bindMenu(element: HTMLDialogElement | null) {
  if (!element) { return; }
  const trigger = document.activeElement;
  element.showModal();
  element.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  return () => {
    element.close();
    if (trigger instanceof HTMLElement && trigger.isConnected) { trigger.focus({ preventScroll: true }); }
  };
}
export function ChoiceMenu<T extends ChoiceMenuOption>({ label, value, options, open, onOpenChange, onChoose, disabled = false, className = '' }: {
  label: string; value: T; options: readonly T[]; open: boolean; onOpenChange(open: boolean): void;
  onChoose(option: T): void; disabled?: boolean; className?: string;
}) {
  return <>
    <button type="button" className={`gryth-choice-trigger ${className}`} disabled={disabled}
      aria-label={`${label}: ${value.label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpenChange(true)}>
      {value.label}<span aria-hidden="true">▾</span>
    </button>
    {open && <dialog className="gryth-choice-dialog" aria-label={label} ref={bindMenu}
      onCancel={event => { event.preventDefault(); onOpenChange(false); }}
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) { onOpenChange(false); }
      }}>
      <header><strong>{label}</strong><button type="button" aria-label={`Close ${label}`} onClick={() => onOpenChange(false)}>×</button></header>
      <div role="menu" aria-label={label} onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { return; }
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }}>
        {options.map(option => <button type="button" key={option.id} role="menuitemradio" aria-checked={option.id === value.id}
          onClick={() => { onChoose(option); onOpenChange(false); }}>
          <span aria-hidden="true">{option.id === value.id ? '✓' : ''}</span>{option.label}
        </button>)}
      </div>
    </dialog>}
  </>;
}
