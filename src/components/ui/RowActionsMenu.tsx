import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

interface RowActionItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}

interface RowActionsMenuProps {
  actions: RowActionItem[];
}

export function RowActionsMenu({ actions }: RowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener('click', handleDocumentClick);
    return () => window.removeEventListener('click', handleDocumentClick);
  }, [isOpen]);

  return (
    <div className="relative inline-flex justify-end" ref={rootRef}>
      <Button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="h-8 min-w-8 px-2 text-base leading-none"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
        variant="ghost"
      >
        ...
      </Button>
      {isOpen ? (
        <div className="absolute right-0 top-9 z-20 min-w-28 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="menu">
          {actions.map((action) => (
            <button
              className={`block w-full px-3 py-1.5 text-left text-xs ${
                action.variant === 'danger' ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'
              } disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={action.disabled}
              key={action.label}
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
