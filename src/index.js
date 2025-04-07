const mm = window.mm;
const statusEl = document.getElementById('status');
const playBtn = document.getElementById('playBtn');
let rnnModel, sequence;

const chords = ["C", "G", "Am", "F"];
const chordNotes = {
    "C": ["C4", "E4", "G4"],
    "G": ["G3", "B3", "D4"],
    "Am": ["A3", "C4", "E4"],
    "F": ["F3", "A3", "C4"]
};

// 初始化模型
async function initModel() {
    if (!rnnModel) {
        rnnModel = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv');
        await rnnModel.initialize();
    }
}

// 创建种子序列
function createSeedSequence() {
    return mm.sequences.quantizeNoteSequence({
        notes: [],
        totalTime: 1,
        tempos: [{ time: 0, qpm: 90 }],
        timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
        texts: chords.map((c, i) => ({ time: i * 2, text: c }))
    }, 4);
}

// 时间顺序
function fixNoteTimings(seq) {
    seq.notes = seq.notes
        .sort((a, b) => a.startTime - b.startTime)
        .filter((note, i, arr) => i === 0 || note.startTime > arr[i - 1].startTime);
    return seq;
}

// 可视化音符
function visualize(seq) {
    new mm.Visualizer(seq, document.getElementById('visualizer'), {
        noteHeight: 6,
        pixelsPerTimeStep: 30,
    });
}

// 播放旋律、和弦、bass、鼓
function playMusic(seq) {
    const now = Tone.now();

    const reverb = new Tone.Reverb(3).toDestination();
    const delay = new Tone.FeedbackDelay("8n", 0.3).connect(reverb);

    const synth = new Tone.PolySynth(Tone.Synth).connect(delay);
    const chordSynth = new Tone.PolySynth().connect(delay);
    const bassSynth = new Tone.MonoSynth({ oscillator: { type: "square" } }).connect(delay);

    // 播放旋律
    seq.notes.forEach(note => {
        const time = now + note.startTime;
        const duration = Math.max(note.endTime - note.startTime, 0.05);
        synth.triggerAttackRelease(Tone.Frequency(note.pitch, "midi"), duration, time);
    });

    // 播放和弦 + bass
    for (let i = 0; i < 16; i++) {
        const time = now + i * 2;
        const chord = chordNotes[chords[i % chords.length]];
        chordSynth.triggerAttackRelease(chord, "2n", time);
        bassSynth.triggerAttackRelease(chord[0], "8n", time);
    }

    // 加入鼓点节奏
    const kick = new Tone.MembraneSynth().toDestination();
    const snare = new Tone.NoiseSynth({ envelope: { sustain: 0.05 } }).toDestination();
    const hat = new Tone.MetalSynth({ envelope: { decay: 0.05 } }).toDestination();

    for (let i = 0; i < 64; i++) {
        const time = now + i * 0.5;
        if (i % 4 === 0) kick.triggerAttackRelease("C2", "8n", time);
        if (i % 4 === 2) snare.triggerAttackRelease("16n", time);
        hat.triggerAttackRelease("16n", time + 0.125);
    }

    // 更新状态
    statusEl.textContent = '🎧 播放中...';
    setTimeout(() => {
        statusEl.textContent = '🎶 播放结束';
    }, seq.totalTime * 1000);
}

// 生成旋律
document.getElementById('startBtn').addEventListener('click', async () => {
    statusEl.textContent = '🎼 加载模型中...';
    await Tone.start();
    await initModel();

    const seed = createSeedSequence();
    sequence = await rnnModel.continueSequence(seed, 64, 1.1, chords);
    sequence.totalTime += 1;
    sequence = fixNoteTimings(sequence);

    visualize(sequence);
    statusEl.textContent = '歌曲生成完成';
    playBtn.disabled = false;
});

// 播放
playBtn.addEventListener('click', () => {
    playMusic(sequence);
});
