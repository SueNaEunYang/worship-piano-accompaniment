const elements = {
  progression: document.querySelector('#progression'), tempo: document.querySelector('#tempo'),
  tempoValue: document.querySelector('#tempo-value'), mood: document.querySelector('#mood'), meter: document.querySelector('#meter'),
  summary: document.querySelector('#summary'), status: document.querySelector('#status'),
  play: document.querySelector('#play'), download: document.querySelector('#download'),
  measureList: document.querySelector('#measure-list'), rootPicker: document.querySelector('#root-picker'),
  qualityPicker: document.querySelector('#quality-picker'), sectionPicker: document.querySelector('#section-picker'), pickedChord: document.querySelector('#picked-chord'),
  applyChord: document.querySelector('#apply-chord'), cancelEdit: document.querySelector('#cancel-edit'), editorMode: document.querySelector('#editor-mode'),
  includeIntro: document.querySelector('#include-intro'), includeOutro: document.querySelector('#include-outro'), countIn: document.querySelector('#count-in'),
  transposeDown: document.querySelector('#transpose-down'), transposeUp: document.querySelector('#transpose-up'), currentKey: document.querySelector('#current-key'),
};

const SEMITONES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0 };
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// 박자별 한 마디 길이(템포 기준 박 수)와 박 단위. 6/8은 템포를 점4분음표로 센다.
const METERS = { '4/4': { beats: 4, pulses: 4 }, '3/4': { beats: 3, pulses: 3 }, '6/8': { beats: 2, pulses: 6 } };
const ENERGY_RANK = { low: 0, mid: 1, high: 2 };
let currentSource;
let pickedRoot = 'G'; let pickedQuality = ''; let selectedMeasure = null; let pendingSection = null;

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

// "[후렴] C D/F# | G" → [{ section: '후렴', text: 'C D/F#' }, { section: '후렴', text: 'G' }]
function parseMeasures(text = elements.progression.value) {
  const measures = []; let section = null;
  text.split(/(\[[^\]]*\])/).forEach(part => {
    const label = part.match(/^\[([^\]]*)\]$/); if (label) { section = label[1].trim() || null; return; }
    part.split(/[|\n]/).map(token => token.trim()).filter(Boolean).forEach(token => measures.push({ section, text: token }));
  });
  return measures;
}
function writeMeasures(measures) {
  const lines = [];
  measures.forEach(measure => { if (!lines.length || lines.at(-1).section !== measure.section) lines.push({ section: measure.section, items: [] }); lines.at(-1).items.push(measure.text); });
  elements.progression.value = lines.map(line => `${line.section ? `[${line.section}] ` : ''}${line.items.join(' | ')}`).join('\n');
  renderEditor(); updateSummary();
}
// 한 마디 안의 코드들. "%"는 앞 마디를 그대로 반복한다.
function measureChords(measures) {
  let previous = null;
  return measures.map(measure => { const chords = measure.text === '%' ? previous : measure.text.split(/\s+/).map(parseChord); previous = chords; return chords; });
}
function energyOf(section) {
  if (!section) return 'mid';
  if (/후렴|코러스|chorus/i.test(section)) return 'high';
  if (/절|벌스|verse|전주|간주|intro/i.test(section)) return 'low';
  return 'mid';
}
// 새 키(첫 코드, 단조면 나란한조)가 플랫 계열이면 ♭, 아니면 ♯로 적는다.
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function transposeText(text, steps) {
  const first = text.replace(/\[[^\]]*\]/g, ' ').match(/[A-G](?:#|b)?(m(?!aj))?/);
  const keyClass = first ? (SEMITONES[first[0].replace('m', '')] + steps + (first[1] ? 3 : 0) + 24) % 12 : 0;
  const names = [5, 10, 3, 8, 1].includes(keyClass) ? NOTE_NAMES : SHARP_NAMES;
  return text.split(/(\[[^\]]*\])/).map(part => part.startsWith('[') ? part : part.replace(/(^|[\s|/])([A-G](?:#|b)?)/g, (all, before, name) => SEMITONES[name] === undefined ? all : before + names[(SEMITONES[name] + steps + 24) % 12])).join('');
}
function renderEditor() {
  const measures = parseMeasures(); elements.measureList.replaceChildren();
  measures.forEach((measure, index) => {
    if (measure.section && measure.section !== measures[index - 1]?.section) { const tag = document.createElement('span'); tag.className = 'section-tag'; tag.textContent = measure.section; elements.measureList.append(tag); }
    const item = document.createElement('span'); item.className = `measure${selectedMeasure === index ? ' selected' : ''}`;
    const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = `${index + 1}. ${measure.text}`; choose.setAttribute('aria-label', `${index + 1}번째 마디 ${measure.text} 수정`);
    choose.addEventListener('click', () => { selectedMeasure = index; const match = measure.text.match(/^([A-G](?:#|b)?)(.*?)(?:\/[A-G](?:#|b)?)?(?:\s|$)/); if (match) { pickedRoot = match[1]; pickedQuality = match[2]; } renderEditor(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `${index + 1}번째 마디 삭제`);
    remove.addEventListener('click', () => { measures.splice(index, 1); if (selectedMeasure === index) selectedMeasure = null; else if (selectedMeasure > index) selectedMeasure--; writeMeasures(measures); });
    item.append(choose, remove); elements.measureList.append(item);
  });
  elements.rootPicker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.root === pickedRoot));
  elements.qualityPicker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.quality === pickedQuality));
  elements.sectionPicker.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button.dataset.section === pendingSection));
  elements.pickedChord.textContent = `${pickedRoot}${pickedQuality}`;
  elements.editorMode.textContent = selectedMeasure === null ? `${pendingSection ? `[${pendingSection}] 시작 · ` : ''}새 마디 추가` : `${selectedMeasure + 1}번째 마디 교체`;
  elements.applyChord.textContent = selectedMeasure === null ? '마디 추가' : '선택 마디 교체'; elements.cancelEdit.hidden = selectedMeasure === null;
  const first = measures[0]?.text.match(/^[A-G](?:#|b)?m?(?!aj)/); elements.currentKey.textContent = first ? `첫 코드 기준 키: ${first[0]}` : '';
}
// 곡 전체를 마디 목록으로 만든다: 인트로 2마디 + 입력 + 아웃트로 2마디.
function songPlan() {
  const measures = parseMeasures(); const chords = measureChords(measures);
  if (!measures.length || chords.some(list => !list || list.some(chord => !chord))) return null;
  const body = measures.map((measure, i) => ({ chords: chords[i], energy: energyOf(measure.section), kind: 'body' }));
  const intro = elements.includeIntro.checked ? [0, 1].map(() => ({ chords: [chords[0][0]], energy: 'low', kind: 'intro' })) : [];
  const outro = elements.includeOutro.checked ? [0, 1].map(() => ({ chords: [chords.at(-1).at(-1)], energy: 'low', kind: 'outro' })) : [];
  const plan = [...intro, ...body, ...outro];
  // 다음 마디가 더 큰 구간(예: 절 → 후렴)이면 이 마디 끝에서 쌓아 올린다.
  plan.forEach((item, i) => { item.build = item.kind === 'body' && plan[i + 1] && ENERGY_RANK[plan[i + 1].energy] > ENERGY_RANK[item.energy]; });
  plan.at(-1).last = true;
  return plan;
}
function meter() { return METERS[elements.meter.value]; }
function secondsPerMeasure() { return meter().beats * 60 / Number(elements.tempo.value); }
function updateSummary() {
  const plan = songPlan(); const bodyCount = parseMeasures().length;
  elements.tempoValue.value = `${elements.tempo.value} BPM${elements.meter.value === '6/8' ? ' (점4분)' : ''}`;
  if (!plan) { elements.summary.textContent = '코드를 확인해 주세요. 예: [절] G | D/F# | Em7 | C'; return; }
  const seconds = Math.round((plan.length + (elements.countIn.checked ? 1 : 0)) * secondsPerMeasure());
  const structure = [elements.countIn.checked && '카운트인', elements.includeIntro.checked && '인트로', elements.includeOutro.checked && '아웃트로'].filter(Boolean).join('·');
  elements.summary.textContent = `${bodyCount}마디 · ${elements.meter.value} · 약 ${seconds}초${structure ? ` · ${structure} 포함` : ''}`;
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
function click(context, destination, start, accent) {
  const osc = context.createOscillator(); osc.type = 'sine'; osc.frequency.value = accent ? 2000 : 1500;
  const gain = context.createGain(); gain.gain.setValueAtTime(accent ? .3 : .18, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .06);
  osc.connect(gain).connect(destination); osc.start(start); osc.stop(start + .08);
}
// 4/4 한 마디 한 코드: 분위기별로 다듬어 온 기본 패턴.
function arrangeCommonTime(play, beat, mood, item) {
  const { bass, bassOctave, rightHand } = play; const intro = item.kind === 'intro';
  if (mood === 'prayer') {
    bass(0, beat * 3.3, .17, beat * .55); rightHand(.08, beat * 3.35, .065, beat * .65); rightHand(beat * 2.55, beat * 1.25, .045, beat * .55);
  } else if (mood === 'praise') {
    for (let step = 0; step < 2; step++) { const at = step * beat * 2; bass(at, beat * 1.25, .16, beat * .35); bassOctave(at, beat * 1.15, .075, beat * .2); rightHand(at + .08, beat * 1.45, .075, beat * .35); }
    rightHand(beat * 3.25, beat * .7, .045, beat * .3);
  } else {
    bass(0, beat * 2.25, .16, beat * .38); bass(beat * 2, beat * 1.65, .13, beat * .35);
    rightHand(.08, beat * 1.7, .075, beat * .45); rightHand(beat * 2.08, beat * 1.55, .065, beat * .45);
    if (!intro) rightHand(beat * 3.25, beat * .75, .04, beat * .3);
  }
  if (intro) rightHand(beat * 3.25, beat * .6, .065, beat * .3);
}
// 3/4·6/8 한 마디 한 코드.
function arrangeOtherMeter(play, measureSeconds, mood, meterName) {
  const { bass, bassOctave, rightHand } = play;
  if (mood === 'prayer') { bass(0, measureSeconds * .9, .17, measureSeconds * .2); rightHand(.08, measureSeconds * .88, .065, measureSeconds * .25); return; }
  if (meterName === '3/4') {
    const beat = measureSeconds / 3;
    bass(0, beat * 2.6, .16, beat * .4); rightHand(.08, beat * 1.6, .075, beat * .4); rightHand(beat * 2, beat * .9, .05, beat * .3);
    if (mood === 'praise') { bassOctave(0, beat * .9, .075); rightHand(beat, beat * .9, .055, beat * .2); }
    return;
  }
  const eighth = measureSeconds / 6;
  bass(0, eighth * 2.8, .16, eighth * .6); bass(eighth * 3, eighth * 2.6, .12, eighth * .6);
  rightHand(.08, eighth * 2.6, .075, eighth * .6); rightHand(eighth * 3.05, eighth * 2.5, .06, eighth * .6);
  if (mood === 'praise') { bassOctave(eighth * 3, eighth * 2, .07); rightHand(eighth * 2, eighth * .9, .04); rightHand(eighth * 5, eighth * .9, .04); }
}
function arrangeMeasure(context, destination, item, voicings, start, measureSeconds, mood, meterName) {
  // 절은 여리게, 후렴은 왼손 옥타브를 더해 크게.
  const level = { low: .72, mid: 1, high: 1.22 }[item.energy];
  const slotSeconds = measureSeconds / item.chords.length;
  item.chords.forEach((chord, slot) => {
    const at0 = start + slot * slotSeconds; const voicing = voicings[slot];
    const key = (midi, at, length, volume, sustain = 0) => pianoTone(context, destination, midi, at0 + at, length, volume * level, sustain);
    const bassOctave = (at, length, volume = .075, sustain = 0) => key(chord.bass + 12, at, length, volume, sustain);
    const bass = (at, length, volume = .2, sustain = 0) => { key(chord.bass, at, length, volume, sustain); if (item.energy === 'high' && mood !== 'praise') bassOctave(at, length, volume * .45, sustain); };
    const rightHand = (at, length, volume = .075, sustain = 0) => voicing.forEach(note => key(note, at, length, volume, sustain));
    const play = { bass, bassOctave, rightHand };
    if (item.chords.length > 1) {
      // 한 마디에 코드가 여럿이면 마디를 나눠 코드마다 짧은 기본 패턴을 친다.
      bass(0, slotSeconds * .9, .16, slotSeconds * .25);
      if (mood === 'praise') bassOctave(0, slotSeconds * .6, .075);
      rightHand(.08, slotSeconds * (mood === 'prayer' ? .9 : .8), mood === 'prayer' ? .065 : .075, slotSeconds * .25);
    } else if (meterName === '4/4') arrangeCommonTime(play, measureSeconds / 4, mood, item);
    else arrangeOtherMeter(play, measureSeconds, mood, meterName);
    if (slot === item.chords.length - 1 && item.build) { rightHand(slotSeconds * .75, slotSeconds * .12, .06, 0); rightHand(slotSeconds * .875, slotSeconds * .12, .085, 0); }
    if (slot === item.chords.length - 1 && item.last && item.kind === 'outro') {
      const end = slotSeconds * .75; key(chord.bass, end, slotSeconds * .25, .2, slotSeconds * 1.5);
      voicing.forEach(note => key(note - 12, end + .05, slotSeconds * .25, .1, slotSeconds * 1.5)); rightHand(end + .18, slotSeconds * .22, .11, slotSeconds * 1.35);
    }
  });
}
async function renderSong() {
  const plan = songPlan(); if (!plan) throw new Error('코드 표기를 확인해 주세요.');
  samples = await loadSamples();
  const measureSeconds = secondsPerMeasure(); const meterName = elements.meter.value;
  const offset = elements.countIn.checked ? measureSeconds : 0; const duration = offset + plan.length * measureSeconds + 3;
  const offline = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
  const limiter = offline.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.ratio.value = 8; limiter.connect(offline.destination);
  const master = offline.createGain(); master.gain.value = .82; master.connect(limiter);
  const room = reverb(offline); const wet = offline.createGain(); wet.gain.value = .22; master.connect(room).connect(wet).connect(limiter);
  if (offset) { const { pulses } = meter(); for (let i = 0; i < pulses; i++) click(offline, limiter, i * measureSeconds / pulses, i === 0 || (meterName === '6/8' && i === 3)); }
  const flat = voiceLead(plan.flatMap(item => item.chords)); let index = 0;
  plan.forEach((item, i) => { const voicings = flat.slice(index, index += item.chords.length); arrangeMeasure(offline, master, item, voicings, offset + i * measureSeconds, measureSeconds, elements.mood.value, meterName); });
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
[elements.tempo, elements.meter].forEach(input => input.addEventListener('input', updateSummary));
[elements.includeIntro, elements.includeOutro, elements.countIn].forEach(input => input.addEventListener('change', updateSummary));
elements.progression.addEventListener('input', () => { selectedMeasure = null; renderEditor(); updateSummary(); });
elements.rootPicker.addEventListener('click', event => { const root = event.target.dataset.root; if (root) { pickedRoot = root; renderEditor(); } });
elements.qualityPicker.addEventListener('click', event => { if (event.target.dataset.quality !== undefined) { pickedQuality = event.target.dataset.quality; renderEditor(); } });
elements.sectionPicker.addEventListener('click', event => { const section = event.target.dataset.section; if (section) { pendingSection = pendingSection === section ? null : section; renderEditor(); } });
elements.applyChord.addEventListener('click', () => {
  const measures = parseMeasures(); const text = `${pickedRoot}${pickedQuality}`;
  if (selectedMeasure === null) { measures.push({ section: pendingSection ?? measures.at(-1)?.section ?? null, text }); pendingSection = null; }
  else { measures[selectedMeasure].text = text; selectedMeasure = null; }
  writeMeasures(measures);
});
elements.cancelEdit.addEventListener('click', () => { selectedMeasure = null; renderEditor(); });
const transpose = steps => { elements.progression.value = transposeText(elements.progression.value, steps); renderEditor(); updateSummary(); };
elements.transposeDown.addEventListener('click', () => transpose(-1)); elements.transposeUp.addEventListener('click', () => transpose(1));
elements.play.addEventListener('click', preview); elements.download.addEventListener('click', download); renderEditor(); updateSummary(); loadSamples();
