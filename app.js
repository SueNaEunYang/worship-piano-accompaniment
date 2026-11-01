const elements = {
  progression: document.querySelector('#progression'), tempo: document.querySelector('#tempo'),
  tempoValue: document.querySelector('#tempo-value'), mood: document.querySelector('#mood'),
  summary: document.querySelector('#summary'), status: document.querySelector('#status'),
  play: document.querySelector('#play'), download: document.querySelector('#download'),
  measureList: document.querySelector('#measure-list'), rootPicker: document.querySelector('#root-picker'),
  qualityPicker: document.querySelector('#quality-picker'), pickedChord: document.querySelector('#picked-chord'),
  applyChord: document.querySelector('#apply-chord'), cancelEdit: document.querySelector('#cancel-edit'), editorMode: document.querySelector('#editor-mode'),
  includeIntro: document.querySelector('#include-intro'), includeOutro: document.querySelector('#include-outro'),
};

const SEMITONES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0 };
let currentSource;
let pickedRoot = 'G'; let pickedQuality = ''; let selectedMeasure = null;

function parseChord(value) {
  const text = value.trim();
  const match = text.match(/^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/);
  if (!match || SEMITONES[match[1]] === undefined) return null;
  const [, rootName, qualityRaw, bassName] = match;
  const quality = qualityRaw.toLowerCase();
  let intervals = [0, 4, 7];
  if (/dim/.test(quality)) intervals = [0, 3, 6];
  else if (/aug|\+/.test(quality)) intervals = [0, 4, 8];
  else if (/sus2/.test(quality)) intervals = [0, 2, 7];
  else if (/sus/.test(quality)) intervals = [0, 5, 7];
  else if (/^(m|min)/.test(quality) && !/maj/.test(quality)) intervals = [0, 3, 7];
  if (/maj7/.test(quality)) intervals.push(11);
  else if (/7/.test(quality)) intervals.push(10);
  else if (/6/.test(quality)) intervals.push(9);
  if (/add9|9/.test(quality)) intervals.push(14);
  const root = 48 + SEMITONES[rootName];
  const bass = bassName ? 36 + SEMITONES[bassName] : root - 12;
  return { text, root, bass, notes: intervals.map(interval => root + interval) };
}

function getChords() {
  return elements.progression.value.split('|').flatMap(part => part.trim().split(/\s+/)).filter(Boolean).map(parseChord);
}
function chordTokens() { return elements.progression.value.split('|').map(token => token.trim()).filter(Boolean); }
function writeTokens(tokens) { elements.progression.value = tokens.join(' | '); renderEditor(); updateSummary(); }
function renderEditor() {
  const tokens = chordTokens(); elements.measureList.replaceChildren();
  tokens.forEach((token, index) => {
    const measure = document.createElement('span'); measure.className = `measure${selectedMeasure === index ? ' selected' : ''}`;
    const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = `${index + 1}. ${token}`; choose.setAttribute('aria-label', `${index + 1}번째 마디 ${token} 수정`);
    choose.addEventListener('click', () => { selectedMeasure = index; const match = token.match(/^([A-G](?:#|b)?)(.*?)(?:\/[A-G](?:#|b)?)?$/); if (match) { pickedRoot = match[1]; pickedQuality = match[2]; } renderEditor(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `${index + 1}번째 마디 삭제`);
    remove.addEventListener('click', () => { tokens.splice(index, 1); if (selectedMeasure === index) selectedMeasure = null; else if (selectedMeasure > index) selectedMeasure--; writeTokens(tokens); });
    measure.append(choose, remove); elements.measureList.append(measure);
  });
  elements.rootPicker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.root === pickedRoot));
  elements.qualityPicker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.quality === pickedQuality));
  elements.pickedChord.textContent = `${pickedRoot}${pickedQuality}`;
  elements.editorMode.textContent = selectedMeasure === null ? '새 마디 추가' : `${selectedMeasure + 1}번째 마디 교체`;
  elements.applyChord.textContent = selectedMeasure === null ? '마디 추가' : '선택 마디 교체'; elements.cancelEdit.hidden = selectedMeasure === null;
}
function songPlan(chords) {
  if (!chords.length || chords.some(chord => !chord)) return null;
  const intro = elements.includeIntro.checked ? [chords[0], chords[0]] : [];
  const outro = elements.includeOutro.checked ? [chords.at(-1), chords.at(-1)] : [];
  return [...intro, ...chords, ...outro];
}
function secondsPerMeasure() { return 240 / Number(elements.tempo.value); }
function updateSummary() {
  const chords = getChords(); const plan = songPlan(chords);
  elements.tempoValue.value = `${elements.tempo.value} BPM`;
  if (!plan) { elements.summary.textContent = '코드를 확인해 주세요. 예: G | D/F# | Em7 | C'; return; }
  const seconds = Math.round(plan.length * secondsPerMeasure());
  const structure = [elements.includeIntro.checked && '인트로', elements.includeOutro.checked && '아웃트로'].filter(Boolean).join('·');
  elements.summary.textContent = `${chords.length}마디 · 약 ${seconds}초${structure ? ` · ${structure} 포함` : ''}`;
}
// Salamander Grand Piano 샘플 (CC-BY 3.0, Alexander Holm). 단3도 간격 녹음을 재생 속도로 메운다.
const SAMPLE_NAMES = [1, 2, 3, 4, 5, 6, 7].flatMap(octave => ['C', 'Ds', 'Fs', 'A'].map(name => `${name}${octave}`)).concat('C8');
const SAMPLE_PITCH = { C: 0, Ds: 3, Fs: 6, A: 9 };
let samplesPromise;
function loadSamples() {
  samplesPromise ??= (async () => {
    const decoder = new OfflineAudioContext(2, 1, 44100);
    const entries = await Promise.all(SAMPLE_NAMES.map(async name => {
      const response = await fetch(`samples/${name}.mp3`); if (!response.ok) throw new Error(name);
      const [, pitch, octave] = name.match(/^([A-Z]s?)(\d)$/);
      return [12 * (Number(octave) + 1) + SAMPLE_PITCH[pitch], await decoder.decodeAudioData(await response.arrayBuffer())];
    }));
    return new Map(entries);
  })().catch(() => null);
  return samplesPromise;
}
let samples = null;
function samplePiano(context, destination, midi, start, duration, volume, sustain) {
  let nearest = 0; for (const key of samples.keys()) if (Math.abs(key - midi) < Math.abs(nearest - midi)) nearest = key;
  const source = context.createBufferSource(); source.buffer = samples.get(nearest); source.playbackRate.value = 2 ** ((midi - nearest) / 12);
  // 여린 음일수록 어둡게: 단일 벨로시티 샘플의 강약을 필터로 흉내 낸다.
  const tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800 + volume * 30000;
  const gain = context.createGain(); const level = volume * 6; const releaseAt = start + Math.max(.15, duration + sustain);
  gain.gain.setValueAtTime(level, start); gain.gain.setValueAtTime(level, releaseAt); gain.gain.exponentialRampToValueAtTime(.0001, releaseAt + .35);
  source.connect(tone).connect(gain).connect(destination); source.start(start); source.stop(releaseAt + .4);
}
function reverb(context) {
  const length = Math.floor(context.sampleRate * 2.6); const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) { const data = impulse.getChannelData(channel); for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2; }
  const convolver = context.createConvolver(); convolver.buffer = impulse; return convolver;
}
// 오른손: 이전 화음에서 가장 적게 움직이는 자리바꿈을 고른다 (C4 아래 A3 ~ G5 사이).
function voiceLead(chords) {
  let previous = [60, 64, 67];
  return chords.map(chord => {
    const classes = [...new Set(chord.notes.map(note => note % 12))]; const candidates = [];
    for (let inversion = 0; inversion < classes.length; inversion++) for (let base = 48; base <= 72; base += 12) {
      const voicing = []; classes.slice(inversion).concat(classes.slice(0, inversion)).forEach(pc => { let note = base + pc; while (voicing.length && note <= voicing.at(-1)) note += 12; voicing.push(note); });
      if (voicing[0] >= 57 && voicing.at(-1) <= 79) candidates.push(voicing);
    }
    const distance = voicing => voicing.reduce((sum, note) => sum + Math.min(...previous.map(old => Math.abs(old - note))), 0) + Math.abs(voicing.at(-1) - 72) * .3;
    previous = candidates.sort((a, b) => distance(a) - distance(b))[0] ?? chord.notes.map(note => note + 12);
    return previous;
  });
}
function frequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }
function pianoTone(context, destination, midi, start, duration, volume = .18, sustain = 0) {
  // 사람 손처럼 타이밍·세기를 아주 조금씩 흔든다.
  start += Math.random() * .012; volume *= .9 + Math.random() * .2;
  if (samples) return samplePiano(context, destination, midi, start, duration, volume, sustain);
  const gain = context.createGain(); gain.connect(destination);
  gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .018);
  const releaseAt = start + Math.max(.12, duration + sustain); gain.gain.exponentialRampToValueAtTime(volume * .34, start + Math.min(duration, .22));
  gain.gain.exponentialRampToValueAtTime(.0001, releaseAt);
  [["triangle", 1, 1], ["sine", 2, .16], ["sine", 3, .06]].forEach(([type, multiplier, amount]) => {
    const osc = context.createOscillator(); osc.type = type; osc.frequency.value = frequency(midi) * multiplier;
    const partialGain = context.createGain(); partialGain.gain.value = amount;
    osc.connect(partialGain).connect(gain); osc.start(start); osc.stop(releaseAt + .08);
  });
}
function arrangeMeasure(context, destination, chord, voicing, start, measureSeconds, mood, isIntro, isOutro, isLast) {
  const beat = measureSeconds / 4; const notes = voicing.map(note => note - 12);
  const bass = (at, length, volume = .2, sustain = 0) => pianoTone(context, destination, chord.bass, start + at, length, volume, sustain);
  const key = (midi, at, length, volume = .13, sustain = 0) => pianoTone(context, destination, midi, start + at, length, volume, sustain);
  const block = (at, length, volume = .1, sustain = 0, octave = 0) => notes.forEach(note => key(note + octave, at, length, volume, sustain));
  const rightHand = (at, length, volume = .075, sustain = 0) => block(at, length, volume, sustain, 12);
  const intro = isIntro;
  if (mood === 'prayer') {
    bass(0, beat * 3.3, .17, beat * .55); rightHand(.08, beat * 3.35, .065, beat * .65); rightHand(beat * 2.55, beat * 1.25, .045, beat * .55);
  } else if (mood === 'praise') {
    for (let step = 0; step < 2; step++) { const at = step * beat * 2; bass(at, beat * 1.25, .16, beat * .35); pianoTone(context, destination, chord.bass + 12, start + at, beat * 1.15, .075, beat * .2); rightHand(at + .08, beat * 1.45, .075, beat * .35); }
    rightHand(beat * 3.25, beat * .7, .045, beat * .3);
  } else {
    bass(0, beat * 2.25, .16, beat * .38); bass(beat * 2, beat * 1.65, .13, beat * .35);
    rightHand(.08, beat * 1.7, .075, beat * .45); rightHand(beat * 2.08, beat * 1.55, .065, beat * .45);
    if (!intro) rightHand(beat * 3.25, beat * .75, .04, beat * .3);
  }
  if (intro) rightHand(beat * 3.25, beat * .6, .065, beat * .3);
  if (isLast && isOutro) { bass(beat * 3, beat * .9, .2, beat * 1.5); block(beat * 3.05, beat, .1, beat * 1.5); rightHand(beat * 3.18, beat * .9, .11, beat * 1.35); }
}
async function renderSong() {
  const chords = getChords(); const plan = songPlan(chords); if (!plan) throw new Error('코드 표기를 확인해 주세요.');
  samples = await loadSamples();
  const measureSeconds = secondsPerMeasure(); const duration = plan.length * measureSeconds + 3;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
  const limiter = offline.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.ratio.value = 8; limiter.connect(offline.destination);
  const master = offline.createGain(); master.gain.value = .82; master.connect(limiter);
  const room = reverb(offline); const wet = offline.createGain(); wet.gain.value = .22; master.connect(room).connect(wet).connect(limiter);
  const introMeasures = elements.includeIntro.checked ? 2 : 0;
  const outroStart = plan.length - (elements.includeOutro.checked ? 2 : 0);
  const voicings = voiceLead(plan);
  plan.forEach((chord, i) => arrangeMeasure(offline, master, chord, voicings[i], i * measureSeconds, measureSeconds, elements.mood.value, i < introMeasures, i >= outroStart, i === plan.length - 1));
  return offline.startRendering();
}
async function preview() {
  try { elements.play.disabled = true; elements.status.textContent = '반주를 만들고 있습니다…'; const buffer = await renderSong();
    currentSource?.stop(); const context = new AudioContext(); const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination); source.start(); currentSource = source;
    elements.status.textContent = samples ? '재생 중입니다.' : '피아노 샘플을 불러오지 못해 대체 음색으로 재생합니다. (파일을 직접 열었다면 웹 주소로 열어 주세요)'; source.onended = () => { elements.status.textContent = ''; context.close(); };
  } catch (error) { elements.status.textContent = error.message; } finally { elements.play.disabled = false; }
}
function wavBlob(buffer) {
  const channels = buffer.numberOfChannels; const length = buffer.length * channels * 2; const view = new DataView(new ArrayBuffer(44 + length));
  const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + length, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length, true);
  let offset = 44; for (let sample = 0; sample < buffer.length; sample++) for (let channel = 0; channel < channels; channel++) { const value = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[sample])); view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true); offset += 2; }
  return new Blob([view], { type: 'audio/wav' });
}
async function download() {
  try { elements.download.disabled = true; elements.status.textContent = 'WAV 파일을 만들고 있습니다…'; const buffer = await renderSong(); const url = URL.createObjectURL(wavBlob(buffer)); const link = document.createElement('a'); link.href = url; link.download = 'worship-piano-accompaniment.wav'; link.click(); URL.revokeObjectURL(url); elements.status.textContent = 'WAV 파일을 저장했습니다.'; }
  catch (error) { elements.status.textContent = error.message; } finally { elements.download.disabled = false; }
}
elements.tempo.addEventListener('input', updateSummary); elements.includeIntro.addEventListener('change', updateSummary); elements.includeOutro.addEventListener('change', updateSummary); elements.progression.addEventListener('input', () => { selectedMeasure = null; renderEditor(); updateSummary(); });
elements.rootPicker.addEventListener('click', event => { const root = event.target.dataset.root; if (root) { pickedRoot = root; renderEditor(); } });
elements.qualityPicker.addEventListener('click', event => { if (event.target.dataset.quality !== undefined) { pickedQuality = event.target.dataset.quality; renderEditor(); } });
elements.applyChord.addEventListener('click', () => { const tokens = chordTokens(); const chord = `${pickedRoot}${pickedQuality}`; if (selectedMeasure === null) tokens.push(chord); else { tokens[selectedMeasure] = chord; selectedMeasure = null; } writeTokens(tokens); });
elements.cancelEdit.addEventListener('click', () => { selectedMeasure = null; renderEditor(); });
elements.play.addEventListener('click', preview); elements.download.addEventListener('click', download); renderEditor(); updateSummary(); loadSamples();
