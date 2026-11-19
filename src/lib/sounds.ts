import { UserPreferences } from '../types/aumi.ts';

export interface SoundPreferences {
  sound_enabled: boolean;
  sound_confirm_enabled: boolean;
  sound_notification_enabled: boolean;
}

const DEFAULT_SOUND_PREFS: SoundPreferences = {
  sound_enabled: true,
  sound_confirm_enabled: true,
  sound_notification_enabled: true,
};

let activeSoundPrefs: SoundPreferences = { ...DEFAULT_SOUND_PREFS };
let sharedAudioCtx: AudioContext | null = null;

export function extractSoundPrefs(prefs?: Partial<UserPreferences> | null): SoundPreferences {
  return {
    sound_enabled: prefs?.sound_enabled !== false,
    sound_confirm_enabled: prefs?.sound_confirm_enabled !== false,
    sound_notification_enabled: prefs?.sound_notification_enabled !== false,
  };
}

export function setActiveUserSoundPrefs(prefs?: Partial<UserPreferences> | null) {
  activeSoundPrefs = extractSoundPrefs(prefs);
}

export function getActiveUserSoundPrefs(): SoundPreferences {
  return { ...activeSoundPrefs };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // Browser autoplay restriction before gesture; ignore gracefully
    });
  }
  return sharedAudioCtx;
}

/**
 * Subtle, short confirmation click (~48ms) for publishing, replying, completing, or copying.
 * Strictly respects the logged-in user's sound preferences unless `forcePreview` is true.
 */
export function playConfirmClick(prefs?: Partial<UserPreferences> | null, forcePreview = false) {
  const effective = prefs ? extractSoundPrefs(prefs) : activeSoundPrefs;
  if (!forcePreview && (!effective.sound_enabled || !effective.sound_confirm_enabled)) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Soft tactile click body (triangle + crisp high sine harmonic)
    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();
    const overtoneGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.036);

    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(1520, now);
    overtone.frequency.exponentialRampToValueAtTime(1880, now + 0.028);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);

    overtoneGain.gain.setValueAtTime(0.0001, now);
    overtoneGain.gain.linearRampToValueAtTime(0.03, now + 0.004);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(gain);
    overtone.connect(overtoneGain);
    gain.connect(ctx.destination);
    overtoneGain.connect(ctx.destination);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 0.06);
    overtone.stop(now + 0.045);
  } catch {
    // Ignore audio context edge errors
  }
}

/**
 * Delicate, short notification pop (~125ms) for incoming portal updates, messages, or demands.
 * Strictly respects the logged-in user's sound preferences unless `forcePreview` is true.
 */
export function playNotificationPop(prefs?: Partial<UserPreferences> | null, forcePreview = false) {
  const effective = prefs ? extractSoundPrefs(prefs) : activeSoundPrefs;
  if (!forcePreview && (!effective.sound_enabled || !effective.sound_notification_enabled)) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Gentle bubble pop upward glide + soft airy sparkle note
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(490, now);
    popOsc.frequency.exponentialRampToValueAtTime(790, now + 0.055);
    popOsc.frequency.exponentialRampToValueAtTime(720, now + 0.11);

    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.linearRampToValueAtTime(0.09, now + 0.01);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.125);

    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(1046.5, now + 0.045); // C6 soft chime
    chimeGain.gain.setValueAtTime(0.0001, now + 0.045);
    chimeGain.gain.linearRampToValueAtTime(0.045, now + 0.058);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

    popOsc.connect(popGain);
    chimeOsc.connect(chimeGain);
    popGain.connect(ctx.destination);
    chimeGain.connect(ctx.destination);

    popOsc.start(now);
    popOsc.stop(now + 0.135);
    chimeOsc.start(now + 0.045);
    chimeOsc.stop(now + 0.18);
  } catch {
    // Ignore audio context edge errors
  }
}
