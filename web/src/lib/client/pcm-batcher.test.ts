import { describe, expect, it } from "vitest";
import { AVATAR_PCM, PcmBatcher } from "@/lib/client/pcm-batcher";

const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);
const FIRST = AVATAR_PCM.firstFrameMs * AVATAR_PCM.bytesPerMs; // 14 400 bytes = 300 ms
const NEXT = AVATAR_PCM.frameMs * AVATAR_PCM.bytesPerMs; // 48 000 bytes = 1 s

describe("PcmBatcher", () => {
  it("holds small chunks until the short first frame is complete", () => {
    const batcher = new PcmBatcher();
    expect(batcher.push(bytes(10_000))).toEqual([]);
    const frames = batcher.push(bytes(10_000));
    expect(frames.map((f) => f.length)).toEqual([FIRST]);
    expect(batcher.pendingBytes).toBe(20_000 - FIRST);
  });

  it("then sends one-second frames", () => {
    const batcher = new PcmBatcher();
    const frames = batcher.push(bytes(FIRST + 2 * NEXT + 100));
    expect(frames.map((f) => f.length)).toEqual([FIRST, NEXT, NEXT]);
    expect(batcher.pendingBytes).toBe(100);
  });

  it("keeps the bytes in order across chunk boundaries", () => {
    const batcher = new PcmBatcher({ bytesPerMs: 1, firstFrameMs: 4, frameMs: 4 });
    const out = [
      ...batcher.push(Uint8Array.from([1, 2, 3])),
      ...batcher.push(Uint8Array.from([4, 5, 6, 7, 8, 9])),
    ];
    expect(out.map((f) => Array.from(f))).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(Array.from(batcher.flush() ?? [])).toEqual([]); // one odd byte left: not a whole sample
    expect(batcher.pendingBytes).toBe(1);
  });

  it("flushes whole samples only and restarts utterances", () => {
    const batcher = new PcmBatcher();
    batcher.push(bytes(1001));
    expect(batcher.flush()?.length).toBe(1000);
    expect(batcher.flush()).toBeNull();
    batcher.reset();
    expect(batcher.pendingBytes).toBe(0);
    // After a reset the next utterance starts with a short frame again.
    expect(batcher.push(bytes(FIRST)).map((f) => f.length)).toEqual([FIRST]);
  });
});
