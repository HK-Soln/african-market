'use client';

import { useId, useRef, useState } from 'react';
import { cx } from './cx';
import { fillOtpDigits } from './format';
import { Icon } from './icon';

export interface OtpInputProps {
  /** Number of boxes. Default 6. */
  length?: number;
  /** Controlled value: the digits entered so far. */
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  /** Called once every box is filled, so the screen can submit without a button press. */
  onComplete?: (code: string) => void;
  label?: string;
  /** Accessible name of one box, e.g. "Digit"; the position is appended. */
  digitLabel: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * One-digit boxes for the sign-in code. Always left-to-right, so the first digit is on the left
 * in Arabic too. Pasting a full code fills every box, and the first box asks the phone to
 * suggest the code from the SMS or WhatsApp message.
 */
export function OtpInput({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  label,
  digitLabel,
  hint,
  error,
  disabled,
  autoFocus,
}: OtpInputProps) {
  const [inner, setInner] = useState(() => defaultValue.split('').slice(0, length));
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const groupId = useId();
  const digits = value !== undefined ? value.split('').slice(0, length) : inner;

  const update = (index: number, input: string) => {
    const result = fillOtpDigits(digits, index, input, length);
    setInner(result.values);
    const code = result.values.join('');
    onChange?.(code);
    if (input.replace(/\D/g, '').length > 0) boxes.current[result.focus]?.focus();
    if (code.length === length && result.values.every(Boolean)) onComplete?.(code);
  };

  return (
    <div className={cx('am-field', error && 'am-field-error')}>
      {label && (
        <p className="am-field-label" id={groupId}>
          {label}
        </p>
      )}
      <div className="am-otp" dir="ltr" role="group" aria-labelledby={label ? groupId : undefined}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            className="am-otp-box"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            // The first box accepts a whole pasted or suggested code.
            maxLength={index === 0 ? length : 1}
            value={digits[index] ?? ''}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`${digitLabel} ${index + 1}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => update(index, event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digits[index]) boxes.current[index - 1]?.focus();
            }}
          />
        ))}
      </div>
      {error ? (
        <p className="am-field-msg am-field-msg-error" role="alert">
          <Icon name="alert-triangle" size={16} />
          {error}
        </p>
      ) : (
        hint && <p className="am-field-msg">{hint}</p>
      )}
    </div>
  );
}
