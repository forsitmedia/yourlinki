import type { MusicStyle } from './types';

export const MUSIC_LABELS: Record<MusicStyle, string> = { lounge: 'Lounge jazz', lofi: 'Lo-fi', ambient: 'Ambient' };

/** Background music made in the visitor's browser with Web Audio: chords, bass and soft drums played from a few notes,
 * so there is no recording to license and the page stays one small file. It starts only when the ♪ button is tapped
 * (browsers block sound that starts by itself) and fades in and out. A voice message playing turns it down. */
export const MUSIC_SCRIPT = `<script>
(() => {
  const button = document.querySelector('.music'); if (!button) return;
  const STYLES = {
    lounge: { bpm: 88, swing: .64, cutoff: 2600,
      chords: [[50,53,57,60,64],[43,53,57,59,64],[48,52,55,59,62],[45,49,55,58,64]],
      bass: [[38,41,45,47],[31,35,38,40],[36,40,43,44],[33,37,40,43]] },
    lofi: { bpm: 70, swing: .58, cutoff: 1300, beat: true, crackle: true,
      chords: [[48,55,59,62,64],[45,52,55,59,64],[41,48,52,57,60],[43,50,53,59,62]],
      bass: [[36,0,36,43],[33,0,33,40],[29,0,29,36],[31,0,31,38]] },
    ambient: { bpm: 56, cutoff: 900, pad: true,
      chords: [[48,55,60,64,67],[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62]] },
  };
  const style = STYLES[button.dataset.music] || STYLES.lounge;
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let ctx, master, tone, noise, timer, bar = 0, beat = 0, next = 0, on = false, ducked = false;
  const level = () => (ducked ? .08 : .32);
  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = style.cutoff; tone.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (style.crackle) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.value = .012; src.connect(f); f.connect(g); g.connect(master); src.start();
    }
  }
  function note(m, t, len, gain, type, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (attack || .01));
    g.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.connect(g); g.connect(tone); o.start(t); o.stop(t + len + .05);
  }
  function keys(m, t, len, gain) { note(m, t, len, gain, 'sine'); note(m + 12, t, len * .5, gain * .18, 'triangle'); }
  function hit(t, freq, len, gain, type) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type || 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + len + .05);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .18);
    g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + .35);
  }
  function play(t) {
    const spb = 60 / style.bpm, chord = style.chords[bar % style.chords.length];
    if (style.pad) {
      if (beat === 0 && bar % 2 === 0) chord.forEach((m, i) => { note(m, t, spb * 8.5, .05, 'triangle', spb * 2); note(m + .08, t, spb * 8.5, .03, 'sawtooth', spb * 2.5); });
      if (Math.random() < .3) note(chord[Math.floor(Math.random() * chord.length)] + 24, t + spb * Math.random(), spb * 3, .035, 'sine');
      return;
    }
    const swing = spb * ((style.swing || .5) - .5) * 2;
    if (beat === 0) chord.forEach((m) => keys(m, t, spb * 2.6, .045));
    if (beat === 1 && Math.random() < .6) chord.slice(1).forEach((m) => keys(m, t + spb / 2 + swing / 2, spb * 1.2, .03));
    if (beat === 3 && Math.random() < .35) chord.slice(2).forEach((m) => keys(m + 12, t + spb / 2 + swing / 2, spb * .8, .02));
    const b = style.bass && style.bass[bar % style.bass.length][beat];
    if (b) note(b, t, spb * .9, .22, 'triangle');
    if (style.beat) { if (beat % 2 === 0) kick(t); else hit(t, 1800, .18, .12); hit(t + spb / 2 + swing / 2, 8000, .04, .03, 'highpass'); }
    else { if (beat % 2 === 1) hit(t, 3200, .22, .05); hit(t + spb / 2 + swing / 2, 6000, .08, .02, 'highpass'); }
  }
  function schedule() {
    while (next < ctx.currentTime + .25) {
      play(next);
      next += 60 / style.bpm;
      if (++beat === 4) { beat = 0; bar++; }
    }
  }
  function start() {
    if (!ctx) setup();
    ctx.resume(); on = true; next = ctx.currentTime + .1; beat = 0;
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(level(), ctx.currentTime, .6);
    schedule(); timer = setInterval(schedule, 60);
  }
  function stop() {
    on = false; clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, .25);
    setTimeout(() => { if (!on) ctx.suspend(); }, 1200);
  }
  button.addEventListener('click', (e) => {
    e.preventDefault();
    if (on) stop(); else start();
    button.setAttribute('aria-pressed', String(on)); button.classList.toggle('on', on);
    button.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
  });
  window.yourlinkiMusicDuck = (down) => { ducked = down; if (on) master.gain.setTargetAtTime(level(), ctx.currentTime, .3); };
})();
</script>`;
