'use client';

import { RefObject, useMemo } from 'react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

/**
 * Keyboard shortcuts for the video player.
 *
 * Key      Action
 * ───────────────────────────────────────────
 * Space/K  Play / Pause
 * ←/J      Seek back 10 s
 * →/L      Seek forward 10 s
 * ↑        Volume +10 %
 * ↓        Volume −10 %
 * M        Toggle mute
 * F        Toggle fullscreen
 *
 * The `announce` callback is called with a short status string so the
 * VideoPlayer can surface it in an aria-live region for screen readers.
 */
export function useVideoShortcuts(
  videoRef: RefObject<HTMLVideoElement | null>,
  announce?: (msg: string) => void,
) {
  const shortcuts = useMemo(() => [
    {
      key: ' ',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        if (v.paused) {
          v.play();
          announce?.('Playing');
        } else {
          v.pause();
          announce?.('Paused');
        }
      },
    },
    {
      key: 'ArrowLeft',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 10);
        announce?.('Rewound 10 seconds');
      },
    },
    {
      key: 'ArrowRight',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        v.currentTime = Math.min(v.duration, v.currentTime + 10);
        announce?.('Skipped 10 seconds');
      },
    },
    {
      key: 'ArrowUp',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        v.volume = Math.min(1, v.volume + 0.1);
        announce?.(`Volume ${Math.round(v.volume * 100)}%`);
      },
    },
    {
      key: 'ArrowDown',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        v.volume = Math.max(0, v.volume - 0.1);
        announce?.(`Volume ${Math.round(v.volume * 100)}%`);
      },
    },
    {
      key: 'm',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        v.muted = !v.muted;
        announce?.(v.muted ? 'Muted' : 'Unmuted');
      },
    },
    {
      key: 'f',
      skipOnInput: true,
      handler: (e: KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        e.preventDefault();
        if (!document.fullscreenElement) {
          v.requestFullscreen().catch(() => {/* browser may deny outside user gesture */});
          announce?.('Fullscreen');
        } else {
          document.exitFullscreen();
          announce?.('Exited fullscreen');
        }
      },
    },
  ], [videoRef, announce]);

  // YouTube-style aliases: K = play/pause, J = rewind, L = forward
  const withAliases = useMemo(() => {
    const byKey = (k: string) => shortcuts.find((s) => s.key === k)!;
    return [
      ...shortcuts,
      { ...byKey(' '), key: 'k' },
      { ...byKey('ArrowLeft'), key: 'j' },
      { ...byKey('ArrowRight'), key: 'l' },
    ];
  }, [shortcuts]);

  useKeyboardShortcuts(withAliases);
}
