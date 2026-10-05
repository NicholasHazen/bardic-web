import type { BrowserContext } from '@playwright/test';

/** Keep real decoding and clock progress without sound; native audible autoplay policy needs separate checks. */
export async function silenceAudio(context: BrowserContext) {
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.muted = true;
      this.volume = 0;
      return play.call(this);
    };
  });
}
