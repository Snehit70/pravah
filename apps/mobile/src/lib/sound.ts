import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import captureSound from "../../assets/sounds/pravah-capture.wav";
import errorSound from "../../assets/sounds/pravah-error.wav";
import successSound from "../../assets/sounds/pravah-success.wav";
import warningSound from "../../assets/sounds/pravah-warning.wav";
import { getUserPreferencesSnapshot } from "../hooks/useUserPreferences";

type SoundEvent = "capture" | "success" | "warning" | "error";

const players: Partial<Record<SoundEvent, AudioPlayer>> = {};

function sourceFor(event: SoundEvent): number {
  switch (event) {
    case "capture":
      return captureSound;
    case "success":
      return successSound;
    case "warning":
      return warningSound;
    case "error":
      return errorSound;
  }
}

function getPlayer(event: SoundEvent): AudioPlayer {
  const existing = players[event];
  if (existing) return existing;

  const player = createAudioPlayer(sourceFor(event), {
    updateInterval: 1000,
    keepAudioSessionActive: false,
  });
  player.volume = event === "error" ? 0.32 : 0.24;
  players[event] = player;
  return player;
}

export const sound = {
  play: (event: SoundEvent) => {
    if (!getUserPreferencesSnapshot().soundEnabled) return;
    try {
      const player = getPlayer(event);
      void player
        .seekTo(0)
        .catch(() => undefined)
        .finally(() => {
          player.play();
        });
    } catch {
      // Sound must never block the task mutation or visual feedback path.
    }
  },
};
