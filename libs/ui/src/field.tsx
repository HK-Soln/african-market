'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

interface FieldProps {
  id: string;
  label?: string;
  /** Text shown after the label, e.g. "(optional)". */
  optional?: string;
  hint?: string;
  /** Replaces the hint and marks the field invalid. Say what to do next. */
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label, control and message wiring shared by every form control. */
export function Field({ id, label, optional, hint, error, className, children }: FieldProps) {
  return (
    <div className={cx('am-field', error && 'am-field-error', className)}>
      {label && (
        <label className="am-field-label" htmlFor={id}>
          {label}
          {optional && <span className="am-field-opt"> {optional}</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="am-field-msg am-field-msg-error" id={`${id}-msg`}>
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : (
        hint && (
          <p className="am-field-msg" id={`${id}-msg`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Always visible. Placeholders are examples, never the label. */
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  iconStart?: IconName;
  suffix?: ReactNode;
}

/** A labelled text field. Value text is 16px so iOS does not zoom on focus. */
export function Input({
  label,
  hint,
  error,
  optional,
  iconStart,
  suffix,
  className,
  id,
  ...rest
}: InputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      <div className={cx('am-input', iconStart && 'am-input-hasicon')}>
        {iconStart && <Icon name={iconStart} className="am-input-icon" />}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          {...rest}
        />
        {suffix && <span className="am-input-suffix">{suffix}</span>}
      </div>
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Shown as an empty first option. */
  placeholder?: string;
  hint?: string;
  error?: string;
  optional?: string;
}

/** A native select, which keeps the OS picker on phones. For short, fixed lists. */
export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  optional,
  className,
  id,
  ...rest
}: SelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
    >
      <div className="am-input am-select">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="am-select-chev" />
      </div>
    </Field>
  );
}
