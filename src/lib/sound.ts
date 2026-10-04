"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lsGet, lsSet } from "./client";

// Dosya indirmeden WebAudio ile üretilen kısa efektler.

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number; delay?: number };

export function useSounds() {
  const [muted, setMuted] = useState(false);
  const ctx = useRef<AudioContext | null>(null);

  useEffect(() => setMuted(lsGet("okey:muted") === "1"), []);

  const play = useCallback(
    (tones: Tone[]) => {
      if (muted || typeof window === "undefined") return;
      try {
        ctx.current ??= new AudioContext();
        const ac = ctx.current;
        if (ac.state === "suspended") void ac.resume();
        for (const t of tones) {
          const start = ac.currentTime + (t.delay ?? 0);
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = t.type ?? "triangle";
          osc.frequency.value = t.freq;
          g.gain.setValueAtTime(t.gain ?? 0.12, start);
          g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
          osc.connect(g).connect(ac.destination);
          osc.start(start);
          osc.stop(start + t.dur + 0.02);
        }
      } catch {
        // ses desteklenmiyor
      }
    },
    [muted],
  );

  return useMemo(
    () => ({
      muted,
      toggle: () =>
        setMuted((m) => {
          lsSet("okey:muted", m ? "0" : "1");
          return !m;
        }),
      click: () => play([{ freq: 900, dur: 0.04, type: "square", gain: 0.04 }]),
      tap: () => play([{ freq: 240, dur: 0.09, gain: 0.2 }, { freq: 480, dur: 0.05, gain: 0.06 }]),
      soft: () => play([{ freq: 320, dur: 0.06, gain: 0.08 }]),
      turn: () => play([{ freq: 660, dur: 0.12 }, { freq: 880, dur: 0.16, delay: 0.12 }]),
      win: () =>
        play([
          { freq: 523, dur: 0.15 },
          { freq: 659, dur: 0.15, delay: 0.15 },
          { freq: 784, dur: 0.3, delay: 0.3 },
        ]),
    }),
    [muted, play],
  );
}
