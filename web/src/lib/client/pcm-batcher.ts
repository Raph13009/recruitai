// Groups a stream of small PCM16 chunks into the larger ones the avatar service expects.
// The voice model sends audio faster than real time in pieces of a few dozen milliseconds; the
// avatar wants roughly one-second frames. The first frame is kept short so the avatar starts
// speaking quickly. Pure and synchronous so it can be unit-tested.

export interface PcmBatcherOptions {
  /** Bytes per millisecond of audio. PCM16 mono 24 kHz = 48. */
  bytesPerMs: number;
  /** Minimum length of the first frame of an utterance, in ms. */
  firstFrameMs: number;
  /** Length of the following frames, in ms. */
  frameMs: number;
}

export const AVATAR_PCM: PcmBatcherOptions = { bytesPerMs: 48, firstFrameMs: 300, frameMs: 1000 };

export class PcmBatcher {
  private parts: Uint8Array[] = [];
  private size = 0;
  private first = true;

  constructor(private readonly opts: PcmBatcherOptions = AVATAR_PCM) {}

  /** Bytes waiting for the next frame. */
  get pendingBytes(): number {
    return this.size;
  }

  /** Adds audio and returns the frames that are ready to send (possibly none). */
  push(bytes: Uint8Array): Uint8Array[] {
    if (bytes.length) {
      this.parts.push(bytes);
      this.size += bytes.length;
    }
    const frames: Uint8Array[] = [];
    for (;;) {
      const target = even((this.first ? this.opts.firstFrameMs : this.opts.frameMs) * this.opts.bytesPerMs);
      if (this.size < target) break;
      frames.push(this.take(target));
      this.first = false;
    }
    return frames;
  }

  /** Everything still buffered (whole samples only), or null. Use at the end of a turn or after a pause. */
  flush(): Uint8Array | null {
    const length = even(this.size);
    if (!length) return null;
    this.first = false;
    return this.take(length);
  }

  /** Forget buffered audio and start a new utterance (after an interruption or a finished turn). */
  reset() {
    this.parts = [];
    this.size = 0;
    this.first = true;
  }

  /** Next utterance starts with a short first frame again, keeping any odd byte carried over. */
  startUtterance() {
    this.first = true;
  }

  private take(length: number): Uint8Array {
    const out = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const head = this.parts[0];
      const need = length - offset;
      if (head.length <= need) {
        out.set(head, offset);
        offset += head.length;
        this.parts.shift();
      } else {
        out.set(head.subarray(0, need), offset);
        this.parts[0] = head.subarray(need);
        offset += need;
      }
    }
    this.size -= length;
    return out;
  }
}

const even = (n: number) => Math.floor(n) - (Math.floor(n) % 2);
