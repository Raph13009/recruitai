"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { micConstraints } from "@/lib/client/audio";
import { createResumedAudioContext } from "@/lib/client/media-unlock";

export type MicState = "idle" | "requesting" | "ready" | "denied" | "unavailable";

/**
 * Mic check for the waiting room: asks for permission and exposes a live level.
 * `takeStream()` hands the live track to the call without stopping it (mobile-friendly).
 */
export function useMicCheck() {
  const [state, setState] = useState<MicState>("idle");
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const scope = useRef(new Uint8Array(256));

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close();
    context.current = null;
    analyser.current = null;
    setState((s) => (s === "ready" ? "idle" : s));
  }, []);

  /** Detach the live mic stream for the call. Tracks stay active; lobby meter stops. */
  const takeStream = useCallback((): MediaStream | null => {
    const current = stream.current;
    stream.current = null;
    void context.current?.close();
    context.current = null;
    analyser.current = null;
    if (current) setState("idle");
    return current;
  }, []);

  const enable = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return false;
    }
    setState("requesting");
    try {
      release();
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
      context.current = await createResumedAudioContext();
      analyser.current = context.current.createAnalyser();
      analyser.current.fftSize = 256;
      context.current.createMediaStreamSource(stream.current).connect(analyser.current);
      setState("ready");
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setState(name === "NotFoundError" || name === "NotReadableError" ? "unavailable" : "denied");
      return false;
    }
  }, [release]);

  /** Mic loudness from 0 to 1. Safe to call on every animation frame. */
  const getLevel = useCallback(() => {
    const node = analyser.current;
    if (!node) return 0;
    node.getByteTimeDomainData(scope.current);
    let sum = 0;
    for (let i = 0; i < scope.current.length; i++) {
      const s = (scope.current[i] - 128) / 128;
      sum += s * s;
    }
    return Math.min(1, Math.sqrt(sum / scope.current.length) * 4);
  }, []);

  useEffect(() => release, [release]);

  return { state, enable, release, takeStream, getLevel };
}

/**
 * The candidate's own camera. It only feeds the local preview: the video never leaves the
 * browser, it is not recorded and not analysed.
 */
export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    current.current?.getTracks().forEach((t) => t.stop());
    current.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
      });
      current.current = next;
      setStream(next);
    } catch {
      setError("La caméra n'est pas accessible. Vous pouvez continuer sans.");
    }
  }, []);

  const toggle = useCallback(() => (current.current ? stop() : start()), [start, stop]);

  useEffect(() => stop, [stop]);

  return { stream, on: stream !== null, error, toggle, stop };
}
