import { TC_CUE_REMAINING } from "./timer";

export class AudioCue {
  private context: AudioContext | null = null;
  private scheduled: { oscillator: OscillatorNode; gain: GainNode; when: number } | null = null;
  private generation = 0;
  private endTime = 0;
  private enabled = false;
  private played = false;

  constructor(private readonly setStatus: (message: string) => void) {}

  start(endTime: number, enabled: boolean): void {
    this.cancel();
    this.endTime = endTime;
    this.enabled = enabled;
    this.played = false;
    void this.schedule();
  }

  setEnabled(enabled: boolean): void {
    this.cancel();
    this.enabled = enabled;
    void this.schedule();
  }

  private cancel(): void {
    this.generation++;
    const cue = this.scheduled;
    if (cue) {
      if (this.context && this.context.currentTime >= cue.when) this.played = true;
      cue.oscillator.onended = null;
      cue.oscillator.stop();
      cue.oscillator.disconnect();
      cue.gain.disconnect();
      this.scheduled = null;
    }
  }

  private async schedule(): Promise<void> {
    const generation = this.generation;
    if (!this.enabled) {
      this.setStatus("");
      return;
    }

    try {
      if (!this.context || this.context.state === "closed") {
        const Ctor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error("Web Audio is not supported");
        this.context = new Ctor();
      }
      const context = this.context;
      if (context.state === "suspended") await context.resume();
      if (generation !== this.generation) return;
      if (context.state !== "running") throw new Error("Audio playback is not available");
      this.setStatus("");

      const now = performance.now();
      if (this.played || now >= this.endTime) return;
      const when =
        context.currentTime + Math.max(0, this.endTime - TC_CUE_REMAINING * 1000 - now) / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const cue = { oscillator, gain, when };
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.6, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (this.scheduled === cue) {
          this.scheduled = null;
          this.played = true;
        }
      };
      oscillator.start(when);
      oscillator.stop(when + 0.36);
      this.scheduled = cue;
    } catch (error) {
      if (generation !== this.generation) return;
      console.error("Could not schedule the TC audio cue", error);
      this.setStatus("Audio unavailable. Toggle the cue to retry.");
    }
  }
}
