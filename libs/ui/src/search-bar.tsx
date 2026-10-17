'use client';

import { useId, type FormEvent } from 'react';
import { cx } from './cx';
import { Icon } from './icon';

export interface SearchBarProps {
  /** Accessible name of the field, e.g. "Search shops and products". */
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** The query parameter's name when the form is sent without script. */
  name?: string;
  /** Where the form goes without script (the results page). */
  action?: string;
  /** With the trimmed text, when the visitor presses Enter or search. */
  onSearch?: (query: string) => void;
  /** "Deira": where results are measured from; tapping it changes it. Hidden when absent. */
  locationText?: string;
  /** Accessible name of the location button, e.g. "Search near Deira: change". */
  locationLabel?: string;
  onLocationClick?: () => void;
  className?: string;
}

/** The search field with the place results are measured from beside it. */
export function SearchBar({
  label,
  placeholder,
  defaultValue,
  name = 'q',
  action,
  onSearch,
  locationText,
  locationLabel,
  onLocationClick,
  className,
}: SearchBarProps) {
  const id = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSearch) return;
    event.preventDefault();
    const value = new FormData(event.currentTarget).get(name);
    onSearch(typeof value === 'string' ? value.trim() : '');
  };
  return (
    <form role="search" action={action} onSubmit={submit} className={cx('am-search', className)}>
      <label htmlFor={id} className="am-search-field">
        <Icon name="search" />
        <span className="am-visually-hidden">{label}</span>
        <input
          id={id}
          name={name}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={100}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
      </label>
      {locationText && (
        <button
          type="button"
          className="am-search-loc"
          aria-label={locationLabel}
          aria-haspopup="dialog"
          onClick={onLocationClick}
        >
          <Icon name="map-pin" size={16} />
          <span className="am-search-loc-text">{locationText}</span>
        </button>
      )}
    </form>
  );
}
