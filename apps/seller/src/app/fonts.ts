import localFont from 'next/font/local';

/**
 * The design system's two faces, self-hosted from libs/ui/fonts. Each sets a CSS variable that
 * the `--font-sans` and `--font-arabic` stacks in @am/ui/theme.css read.
 */
export const latinFont = localFont({
  src: '../../../../libs/ui/fonts/PlusJakartaSans-Latin-Variable.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--am-font-latin',
});

export const arabicFont = localFont({
  src: [
    { path: '../../../../libs/ui/fonts/IBMPlexSansArabic-Arabic-400.woff2', weight: '400' },
    { path: '../../../../libs/ui/fonts/IBMPlexSansArabic-Arabic-500.woff2', weight: '500' },
    { path: '../../../../libs/ui/fonts/IBMPlexSansArabic-Arabic-600.woff2', weight: '600' },
    { path: '../../../../libs/ui/fonts/IBMPlexSansArabic-Arabic-700.woff2', weight: '700' },
  ],
  style: 'normal',
  display: 'swap',
  variable: '--am-font-arabic',
});

/** Put on `<html>` so both variables are available everywhere. */
export const fontVariables = `${latinFont.variable} ${arabicFont.variable}`;
