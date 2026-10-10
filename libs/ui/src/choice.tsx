'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './icon';

export interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

type ChoiceKind = 'checkbox' | 'radio' | 'toggle';

function Choice({
  kind,
  label,
  description,
  className,
  id,
  ...rest
}: ChoiceProps & { kind: ChoiceKind }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label
      className={cx(
        'am-choice',
        `am-choice-${kind}`,
        rest.disabled && 'am-choice-disabled',
        className,
      )}
      htmlFor={inputId}
    >
      <input
        id={inputId}
        type={kind === 'toggle' ? 'checkbox' : kind}
        role={kind === 'toggle' ? 'switch' : undefined}
        {...rest}
      />
      <span className="am-choice-control" aria-hidden>
        {kind === 'checkbox' && <Icon name="check" size={16} strokeWidth={2.5} />}
      </span>
      <span className="am-choice-text">
        <span className="am-choice-label">{label}</span>
        {description && <span className="am-choice-desc">{description}</span>}
      </span>
    </label>
  );
}

/** An independent choice. The whole row is the 44px hit area. */
export const Checkbox = (props: ChoiceProps) => <Choice kind="checkbox" {...props} />;
/** One of many. Give the group's radios the same `name`. */
export const Radio = (props: ChoiceProps) => <Choice kind="radio" {...props} />;
/** An instant on/off setting. */
export const Toggle = (props: ChoiceProps) => <Choice kind="toggle" {...props} />;
