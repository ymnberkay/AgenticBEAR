import { useEffect, useCallback } from 'react';

interface ShortcutOptions {
  enabled?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcut(
  combo: string,
  callback: () => void,
  options: ShortcutOptions = {},
) {
  const { enabled = true, preventDefault = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const parts = combo.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needsMeta = parts.includes('meta') || parts.includes('cmd');
      const needsCtrl = parts.includes('ctrl');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt');

      const metaMatch = needsMeta ? event.metaKey : !event.metaKey;
      const ctrlMatch = needsCtrl ? event.ctrlKey : !event.ctrlKey;
      const shiftMatch = needsShift ? event.shiftKey : !event.shiftKey;
      const altMatch = needsAlt ? event.altKey : !event.altKey;

      if (
        event.key.toLowerCase() === key &&
        metaMatch &&
        ctrlMatch &&
        shiftMatch &&
        altMatch
      ) {
        if (preventDefault) event.preventDefault();
        callback();
      }
    },
    [combo, callback, enabled, preventDefault],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
