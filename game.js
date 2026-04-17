/* ==========================================================================
   FOOTBALL PICTOGRAPH BUILDER CHALLENGE — GAME ENGINE
   ========================================================================== */

// ─── STATE ──────────────────────────────────────────────────────────────────
const STATE = {
    currentLevel: 1,
    phase: 'build', // 'build' | 'question'
    score: 0,
    stars: 0,
    soundOn: true,
    totalMistakes: 0,
    questionMistakes: 0,
    buildMistakes: 0,
    correctStreak: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    currentQuestionIndex: 0,
    questions: [],
    dataset: {},
    footballCounts: {},
    badges: { golden: false, solver: false, mean: false },
    weakTopics: {},
    levelScore: 0,
    levelMistakes: 0,
    answered: false,
    levelCompleteTimer: null,
    levelStars: {},
};

// ─── LEVEL CONFIG ───────────────────────────────────────────────────────────
const LEVELS = [
    {
        level: 1, label: 'Easy', perSymbol: 10, halfFootball: false,
        data: { 6: 30, 7: 50, 8: 40, 9: 20, 10: 60 }
    },
    {
        level: 2, label: 'Medium', perSymbol: 10, halfFootball: false,
        data: { 6: 50, 7: 70, 8: 30, 9: 60, 10: 40 }
    },
    {
        level: 3, label: 'Hard', perSymbol: 10, halfFootball: true,
        data: { 6: 35, 7: 50, 8: 25, 9: 45, 10: 60 }
    },
];

// ─── AUDIO (Web Audio API — no external files) ──────────────────────────────
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.15) {
    if (!STATE.soundOn) return;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
    } catch (e) { /* ignore */ }
}

function sfxAdd()     { playTone(523, 0.15, 'sine', 0.12); setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 80); }
function sfxRemove()  { playTone(330, 0.12, 'triangle', 0.1); }
function sfxCorrect() { playTone(523, 0.12, 'sine', 0.12); setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 100); setTimeout(() => playTone(784, 0.2, 'sine', 0.14), 200); }
function sfxWrong()   { playTone(200, 0.25, 'sawtooth', 0.08); setTimeout(() => playTone(180, 0.3, 'sawtooth', 0.07), 150); }
function sfxClick()   { playTone(440, 0.06, 'sine', 0.08); }
function sfxLevelUp() { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.12), i*120)); }

// ─── SPEECH ─────────────────────────────────────────────────────────────────
function speak(text) {
    if (!STATE.soundOn) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.pitch = 1.2;
        u.volume = 0.7;
        window.speechSynthesis.speak(u);
    }
}

// ─── DOM HELPERS ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = el => { if (typeof el === 'string') el = $(el); el.classList.remove('hidden'); };
const hide = el => { if (typeof el === 'string') el = $(el); el.classList.add('hidden'); };

// ─── NAVIGATION ─────────────────────────────────────────────────────────────
function startGame() {
    sfxClick();
    hide('splash-screen');
    show('game-screen');
    loadLevel(STATE.currentLevel);
}

function goHome() {
    sfxClick();
    hide('game-screen');
    hide('level-complete-modal');
    hide('final-stats-modal');
    show('splash-screen');
}

function resetGame() {
    sfxClick();
    STATE.currentLevel = 1;
    STATE.score = 0;
    STATE.stars = 0;
    STATE.totalMistakes = 0;
    STATE.questionsAnswered = 0;
    STATE.questionsCorrect = 0;
    STATE.correctStreak = 0;
    STATE.badges = { golden: false, solver: false, mean: false };
    STATE.weakTopics = {};
    STATE.levelStars = {};
    hide('final-stats-modal');
    loadLevel(1);
}

// ─── SOUND TOGGLE ───────────────────────────────────────────────────────────
function toggleSound() {
    STATE.soundOn = !STATE.soundOn;
    $('btn-sound').textContent = STATE.soundOn ? '🔊' : '🔇';
    if (STATE.soundOn) sfxClick();
}

// ─── HELP / TEACHER MODALS ─────────────────────────────────────────────────
function openHelp()   { sfxClick(); show('help-modal'); }
function closeHelp()  { hide('help-modal'); }
function openTeacherMode() {
    sfxClick();
    updateTeacherStats();
    show('teacher-modal');
}
function closeTeacherMode() { hide('teacher-modal'); }

function updateTeacherStats() {
    const acc = STATE.questionsAnswered > 0
        ? Math.round((STATE.questionsCorrect / STATE.questionsAnswered) * 100) : 0;
    $('stat-accuracy').textContent = acc + '%';
    $('stat-mistakes').textContent = STATE.totalMistakes;
    $('stat-score-total').textContent = STATE.score;
    $('stat-level').textContent = STATE.currentLevel;

    // Weaknesses
    const list = $('weakness-list');
    list.innerHTML = '';
    const topics = Object.entries(STATE.weakTopics).filter(([, v]) => v > 0).sort((a,b) => b[1]-a[1]);
    if (topics.length === 0) {
        list.innerHTML = '<li>No weak areas detected yet — keep playing!</li>';
    } else {
        topics.forEach(([topic, count]) => {
            const li = document.createElement('li');
            li.textContent = `${topic} (${count} mistake${count>1?'s':''})`;
            list.appendChild(li);
        });
    }

    // Badges
    ['golden','solver','mean'].forEach(b => {
        const el = $('badge-' + b);
        el.classList.toggle('locked', !STATE.badges[b]);
        el.classList.toggle('unlocked', STATE.badges[b]);
    });
}

// ─── LEVEL LOADING ──────────────────────────────────────────────────────────
function loadLevel(levelNum) {
    if (STATE.levelCompleteTimer) {
        clearTimeout(STATE.levelCompleteTimer);
        STATE.levelCompleteTimer = null;
    }

    const lvl = LEVELS[(levelNum - 1) % LEVELS.length];
    STATE.currentLevel = levelNum;
    STATE.phase = 'build';
    STATE.dataset = { ...lvl.data };
    STATE.footballCounts = {};
    STATE.currentQuestionIndex = 0;
    STATE.questions = [];
    STATE.levelScore = 0;
    STATE.levelMistakes = 0;
    STATE.answered = false;

    Object.keys(STATE.dataset).forEach(k => STATE.footballCounts[k] = 0);

    // UI Updates
    $('level-display').textContent = `Level ${levelNum} — ${lvl.label}`;
    $('score-display').textContent = STATE.score;
    updateStars();
    setPhase('build');

    // Build pictograph columns
    buildPictographColumns(lvl);

    // Reset panels
    $('build-panel').classList.remove('hidden-panel');
    $('question-panel').classList.add('hidden-panel');
    $('question-panel').classList.remove('active-panel');
    $('btn-validate').disabled = false;
    $('btn-validate').classList.remove('success');
    $('btn-validate').textContent = '✅ Check My Pictograph';
    hide('btn-retry');
    hide('btn-next');
    hide('btn-next-level');
    hide('level-complete-modal');

    resetHelper();
    resetQuestionPanel();

    // Hint
    if (lvl.halfFootball) {
        $('build-hint').textContent = 'Each ⚽ = 10 · Half ◐ = 5 students';
    } else {
        $('build-hint').textContent = 'Each ⚽ = 10 students';
    }
}

function resetQuestionPanel() {
    $('question-progress').textContent = 'Question 1 / 5';
    $('question-number').textContent = 'Q1';
    $('question-text').textContent = 'Build your pictograph and click Check My Pictograph.';
    $('answer-options').innerHTML = '';
    $('question-feedback').textContent = '';
    $('question-feedback').className = 'question-feedback';
    $('answer-insight').textContent = '';
    $('answer-insight').className = 'answer-insight hide';
}

function buildPictographColumns(lvl) {
    const area = $('pictograph-area');
    area.innerHTML = '';

    Object.entries(lvl.data).forEach(([cls, count]) => {
        const col = document.createElement('div');
        col.className = 'picto-column';
        col.innerHTML = `
            <div class="picto-label">Class ${cls}</div>
            <div class="picto-target">${count} students</div>
            <div class="picto-inline-feedback" id="inline-feedback-${cls}"></div>
            <div class="picto-stack" id="stack-${cls}" data-class="${cls}"></div>
            <div class="picto-buttons">
                <button class="btn-picto btn-add" onclick="addFootball(${cls})" title="Add Football">+ ⚽</button>
                <button class="btn-picto btn-remove" onclick="removeFootball(${cls})" title="Remove Football">− ⚽</button>
            </div>
        `;
        area.appendChild(col);
    });
}

// ─── ADD / REMOVE FOOTBALLS ─────────────────────────────────────────────────
function addFootball(cls) {
    if (STATE.phase !== 'build') return;
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const maxBalls = Math.ceil(STATE.dataset[cls] / lvl.perSymbol);
    if (STATE.footballCounts[cls] >= maxBalls + 5) return; // Allow more overshoot for learning

    STATE.footballCounts[cls]++;
    sfxAdd();
    renderStack(cls);
}

function removeFootball(cls) {
    if (STATE.phase !== 'build') return;
    if (STATE.footballCounts[cls] <= 0) return;

    // Animate removal
    const stack = $(`stack-${cls}`);
    const balls = stack.querySelectorAll('.football-icon');
    if (balls.length > 0) {
        const last = balls[balls.length - 1];
        last.classList.add('removing');
        setTimeout(() => {
            STATE.footballCounts[cls]--;
            sfxRemove();
            renderStack(cls);
        }, 280);
    }
}

function renderStack(cls) {
    const stack = $(`stack-${cls}`);
    const count = STATE.footballCounts[cls];
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    stack.innerHTML = '';
    stack.classList.remove('correct', 'wrong');
    clearInlineClassFeedback(cls);

    for (let i = 0; i < count; i++) {
        const ball = document.createElement('span');
        ball.className = 'football-icon';
        // Check if this is a half football (last ball has half value)
        const expectedFull = Math.floor(STATE.dataset[cls] / lvl.perSymbol);
        const hasHalf = lvl.halfFootball && (STATE.dataset[cls] % lvl.perSymbol !== 0);

        if (hasHalf && i === expectedFull && count === expectedFull + 1) {
            ball.textContent = '◐';
            ball.classList.add('half');
            ball.title = '5 students';
        } else {
            ball.textContent = '⚽';
            ball.title = '10 students';
        }
        ball.style.animationDelay = `${i * 0.06}s`;
        stack.appendChild(ball);
    }
}

function setInlineClassFeedback(cls, message, type = 'neutral') {
    const feedbackEl = $(`inline-feedback-${cls}`);
    if (!feedbackEl) return;

    feedbackEl.textContent = message || '';
    feedbackEl.className = 'picto-inline-feedback';
    if (message) {
        feedbackEl.classList.add('show', type);
    }
}

function clearInlineClassFeedback(cls) {
    setInlineClassFeedback(cls, '');
}

// ─── VALIDATE PICTOGRAPH ────────────────────────────────────────────────────
function validatePictograph() {
    if (STATE.phase !== 'build') return;
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    let allCorrect = true;

    Object.entries(STATE.dataset).forEach(([cls, count]) => {
        const expected = Math.ceil(count / lvl.perSymbol);
        const actual = STATE.footballCounts[cls];
        const stack = $(`stack-${cls}`);

        if (actual === expected) {
            stack.classList.add('correct');
            stack.classList.remove('wrong');
            clearInlineClassFeedback(cls);
        } else {
            stack.classList.add('wrong');
            stack.classList.remove('correct');
            allCorrect = false;

            const diff = Math.abs(expected - actual);
            const footballWord = diff === 1 ? 'football' : 'footballs';
            if (actual < expected) {
                setInlineClassFeedback(
                    cls,
                    `${diff} more ${footballWord} needed. Add ${diff}.`,
                    'need-more'
                );
            } else {
                setInlineClassFeedback(
                    cls,
                    `${diff} extra ${footballWord} added. Remove ${diff}.`,
                    'too-many'
                );
            }
        }
    });

    if (allCorrect) {
        sfxCorrect();
        STATE.levelScore += 20;
        STATE.score += 20;
        $('score-display').textContent = STATE.score;

        $('btn-validate').classList.add('success');
        $('btn-validate').textContent = '✅ Correct! Starting Questions...';
        $('btn-validate').disabled = true;

        spawnSparkles();
        setTimeout(() => startQuestionPhase(), 1200);
    } else {
        sfxWrong();
        STATE.buildMistakes++;
        STATE.totalMistakes++;
        STATE.levelMistakes++;

        // Show hint in helper
        showBuildHint();
    }
}

function showBuildHint() {
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const helper = $('helper-content');
    let html = '<div class="helper-explanation">';
    html += '<div class="helper-step helper-highlight">🔍 <strong>Check your counts:</strong></div>';

    Object.entries(STATE.dataset).forEach(([cls, count]) => {
        const expected = Math.ceil(count / lvl.perSymbol);
        const actual = STATE.footballCounts[cls];
        const isOk = actual === expected;
        html += `<div class="helper-step" style="border-left-color: ${isOk ? 'var(--success-light)' : 'var(--error-light)'}">
            Class ${cls}: ${isOk ? '✅' : '❌'} You placed ${actual}, need ${expected} footballs
            <br><span class="formula">${count} ÷ ${lvl.perSymbol} = ${expected}</span>
        </div>`;
    });
    html += '</div>';
    helper.innerHTML = html;
}

// ─── QUESTION PHASE ─────────────────────────────────────────────────────────
function startQuestionPhase() {
    STATE.phase = 'question';
    setPhase('question');
    generateQuestions();
    showQuestion(0);

    $('question-panel').classList.remove('hidden-panel');
    $('question-panel').classList.add('active-panel');
}

function setPhase(phase) {
    const dots = document.querySelectorAll('.phase-dot');
    const labels = document.querySelectorAll('.phase-label');
    if (phase === 'build') {
        dots[0].classList.add('active');
        dots[1].classList.remove('active');
    } else {
        dots[0].classList.remove('active');
        dots[1].classList.add('active');
    }
}

// ─── QUESTION GENERATION ────────────────────────────────────────────────────
function generateQuestions() {
    const d = STATE.dataset;
    const classes = Object.keys(d).map(Number);
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    const pool = [];

    // 1. Comparison
    const [c1, c2] = shuffle(classes).slice(0, 2);
    const moreClass = d[c1] > d[c2] ? c1 : c2;
    pool.push({
        type: 'Comparison',
        text: `Which class has more students: Class ${c1} or Class ${c2}?`,
        answer: `Class ${moreClass}`,
        options: [`Class ${c1}`, `Class ${c2}`],
        explanation: `Class ${c1} has ${d[c1]} students and Class ${c2} has ${d[c2]} students. Class ${moreClass} has more!`,
        explainClass: moreClass,
        comparisonClasses: [c1, c2],
    });

    // 2. Difference
    const [d1, d2] = shuffle(classes).slice(0, 2);
    const diff = Math.abs(d[d1] - d[d2]);
    const largerClass = d[d1] >= d[d2] ? d1 : d2;
    const smallerClass = d[d1] >= d[d2] ? d2 : d1;
    pool.push({
        type: 'Difference',
        text: `How many more students are in Class ${largerClass} than Class ${smallerClass}?`,
        answer: String(diff),
        options: shuffle([diff, diff + 10, diff - 10, diff + 20].filter(x => x >= 0)).map(String),
        explanation: `${Math.max(d[d1], d[d2])} − ${Math.min(d[d1], d[d2])} = ${diff} students`,
        explainClass: d1,
        differenceClasses: [largerClass, smallerClass],
    });

    // 3. Total Count
    const total = classes.reduce((s, c) => s + d[c], 0);
    pool.push({
        type: 'Total Count',
        text: `How many students are there in all five classes together?`,
        answer: String(total),
        options: shuffle([total, total + 20, total - 10, total + 30]).map(String),
        explanation: `${classes.map(c => d[c]).join(' + ')} = ${total} students`,
        allClasses: classes,
        totalStudents: total,
    });

    // 4. Symbol Logic
    const sc = shuffle(classes)[0];
    const symCount = Math.ceil(d[sc] / perSymbol);
    pool.push({
        type: 'Symbol Logic',
        text: `If Class ${sc} has ${symCount} football${symCount!==1?'s':''}, how many students does it represent?`,
        answer: String(d[sc]),
        options: shuffle([d[sc], d[sc] + 10, d[sc] - 10, symCount]).filter(x => x > 0).map(String),
        explanation: `${symCount} × ${perSymbol} = ${d[sc]} students`,
        explainClass: sc,
        symbolCount: symCount,
        studentCount: d[sc],
    });

    // 5. Mean Value
    const mean = total / classes.length;
    pool.push({
        type: 'Mean Value',
        text: `Find the average number of students across all five classes.`,
        answer: String(mean),
        options: shuffle([mean, mean + 10, mean - 5, total]).map(String),
        explanation: `(${classes.map(c => d[c]).join(' + ')}) ÷ ${classes.length} = ${total} ÷ ${classes.length} = ${mean}`,
        allClasses: classes,
        totalStudents: total,
        meanValue: mean,
    });

    // 6. Missing Symbol
    const mc = shuffle(classes)[0];
    const needed = Math.ceil(d[mc] / perSymbol);
    pool.push({
        type: 'Missing Symbol',
        text: `Class ${mc} has ${d[mc]} students. How many footballs are needed?`,
        answer: String(needed),
        options: shuffle([needed, needed + 1, needed - 1, needed + 2].filter(x => x > 0)).map(String),
        explanation: `${d[mc]} ÷ ${perSymbol} = ${needed} footballs`,
        explainClass: mc,
        studentCount: d[mc],
        footballsNeeded: needed,
    });

    // Select 5 random questions
    STATE.questions = shuffle(pool).slice(0, 5);
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── SHOW QUESTION ──────────────────────────────────────────────────────────
function showQuestion(index) {
    STATE.currentQuestionIndex = index;
    STATE.answered = false;
    const q = STATE.questions[index];
    if (!q) return;

    $('question-progress').textContent = `Question ${index + 1} / ${STATE.questions.length}`;
    $('question-number').textContent = `Q${index + 1}`;
    $('question-text').textContent = q.text;
    $('question-feedback').textContent = '';
    $('question-feedback').className = 'question-feedback';
    $('answer-insight').textContent = '';
    $('answer-insight').className = 'answer-insight hide';

    const optionsDiv = $('answer-options');
    optionsDiv.innerHTML = '';

    // Ensure unique options and always include correct answer
    let opts = [...new Set(q.options)];
    if (!opts.includes(q.answer)) {
        opts.push(q.answer);
    }
    // Pad to 4 if needed
    let safetyCounter = 0;
    let multiplier = 1;
    while (opts.length < 4 && safetyCounter < 10) {
        safetyCounter++;
        let pad;
        if (!isNaN(parseInt(q.answer))) {
            pad = String(parseInt(q.answer) + (multiplier * 5));
        } else {
            pad = `Class ${multiplier}`;
        }
        if (!opts.includes(pad)) {
            opts.push(pad);
        }
        multiplier++;
    }
    opts = shuffle(opts);

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = opt;
        btn.onclick = () => checkAnswer(btn, opt, q);
        optionsDiv.appendChild(btn);
    });

    hide('btn-retry');
    hide('btn-next');
    hide('btn-next-level');
    resetHelper();
}

// ─── CHECK ANSWER ───────────────────────────────────────────────────────────
function checkAnswer(btn, selected, question) {
    if (STATE.answered) return;
    STATE.answered = true;
    STATE.questionsAnswered++;

    const allBtns = $('answer-options').querySelectorAll('.answer-btn');
    allBtns.forEach(b => b.style.pointerEvents = 'none');

    const isCorrect = selected === question.answer;

    if (isCorrect) {
        btn.classList.add('correct-answer');
        sfxCorrect();
        STATE.questionsCorrect++;
        STATE.correctStreak++;
        STATE.levelScore += 15;
        STATE.score += 15;
        $('score-display').textContent = STATE.score;
        $('question-feedback').textContent = '🎉 Correct! Well done!';
        $('question-feedback').className = 'question-feedback correct-feedback';

        spawnSparkles();
        if (STATE.correctStreak >= 3) spawnCheer();

        // Badge checks
        if (STATE.score >= 100 && !STATE.badges.golden) {
            STATE.badges.golden = true;
            showBadgePopup('🏅 Golden Football Badge Unlocked!');
        }
        if (STATE.correctStreak >= 5 && !STATE.badges.solver) {
            STATE.badges.solver = true;
            showBadgePopup('🧠 Super Solver Badge Unlocked!');
        }
        if (question.type === 'Mean Value' && !STATE.badges.mean) {
            STATE.badges.mean = true;
            showBadgePopup('📐 Mean Master Badge Unlocked!');
        }

        // Show next/finish
        if (STATE.currentQuestionIndex < STATE.questions.length - 1) {
            show('btn-next');
        } else {
            show('btn-next-level');
            STATE.levelCompleteTimer = setTimeout(() => {
                showLevelComplete();
                STATE.levelCompleteTimer = null;
            }, 800);
        }

    } else {
        btn.classList.add('wrong-answer');
        sfxWrong();
        STATE.totalMistakes++;
        STATE.levelMistakes++;
        STATE.questionMistakes++;
        STATE.correctStreak = 0;

        // Track weak topic
        STATE.weakTopics[question.type] = (STATE.weakTopics[question.type] || 0) + 1;

        // Highlight correct
        allBtns.forEach(b => {
            if (b.textContent === question.answer) b.classList.add('correct-answer');
        });

        $('question-feedback').textContent = '';
        $('question-feedback').className = 'question-feedback';

        // Show educational insight below answer options
        showAnswerInsight(question);
        scrollToWrongAnswerFeedback();

        // Animate counting on pictograph
        if (question.explainClass || question.comparisonClasses || question.differenceClasses || question.allClasses) {
            animateCountingOnPictograph(question);
        }

        show('btn-retry');
        if (STATE.currentQuestionIndex < STATE.questions.length - 1) {
            show('btn-next');
        } else {
            show('btn-next-level');
        }
    }

    updateStars();
}

// ─── VISUAL EXPLANATION ─────────────────────────────────────────────────────
function showVisualExplanation(question) {
    const helper = $('helper-content');
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;

    let html = '<div class="helper-explanation">';
    html += `<div class="helper-step helper-highlight">📝 <strong>${question.type}</strong></div>`;
    html += `<div class="helper-step">❓ ${question.text}</div>`;

    // Animated counting if there's a class to reference
    if (question.explainClass) {
        const cls = question.explainClass;
        const count = STATE.dataset[cls];
        const balls = Math.ceil(count / perSymbol);

        html += `<div class="helper-step">Class ${cls} has ${balls} football${balls!==1?'s':''}:</div>`;
        html += `<div class="helper-step"><span class="football-count">`;
        for (let i = 0; i < balls; i++) {
            html += `<span class="counting-ball" style="animation-delay:${i * 0.3}s">⚽</span>`;
        }
        html += `</span></div>`;

        // Step-by-step count
        html += `<div class="helper-step">`;
        let runningBalls = '';
        let runningCount = 0;
        for (let i = 1; i <= balls; i++) {
            runningBalls += '⚽';
            runningCount += perSymbol;
            if (i < balls) {
                html += `${runningBalls} ${runningCount} → `;
            } else {
                html += `${runningBalls} <strong>${runningCount}</strong>`;
            }
        }
        html += `</div>`;
    }

    // Formula
    html += `<div class="helper-step"><span class="formula">${question.explanation}</span></div>`;
    html += `<div class="helper-step"><span class="result">✅ Correct Answer: ${question.answer}</span></div>`;
    html += '</div>';

    helper.innerHTML = html;
}

// ─── ANIMATE COUNTING ON PICTOGRAPH ────────────────────────────────────────
function animateCountingOnPictograph(question) {
    // If it's a comparison question, animate both classes
    if (question.type === 'Comparison' && question.comparisonClasses) {
        animateComparison(question.comparisonClasses);
        return;
    }
    
    // If it's a difference question, animate both classes with subtraction
    if (question.type === 'Difference' && question.differenceClasses) {
        animateDifference(question.differenceClasses);
        return;
    }
    
    // If it's a total count question, animate all 5 classes with sum
    if (question.type === 'Total Count' && question.allClasses) {
        animateTotalCount(question.allClasses);
        return;
    }
    
    // If it's a symbol logic question, animate the class with multiplication
    if (question.type === 'Symbol Logic' && question.symbolCount) {
        animateSymbolLogic(question.explainClass, question.symbolCount, question.studentCount);
        return;
    }
    
    // If it's a mean value question, animate all 5 classes with average
    if (question.type === 'Mean Value' && question.allClasses) {
        animateMeanValue(question.allClasses, question.totalStudents, question.meanValue);
        return;
    }
    
    // If it's a missing symbol question, animate with division result
    if (question.type === 'Missing Symbol' && question.footballsNeeded) {
        animateMissingSymbol(question.explainClass, question.studentCount, question.footballsNeeded);
        return;
    }
    
    // Otherwise, animate single class
    const cls = question.explainClass;
    const stack = $(`stack-${cls}`);
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    const count = STATE.dataset[cls];
    const ballCount = Math.ceil(count / perSymbol);
    
    if (!stack) return;
    
    // Add counting mode styling
    stack.classList.add('counting-mode');
    
    // Get all footballs in the stack
    const footballs = Array.from(stack.querySelectorAll('.football-icon'));
    
    // Animate counting for each football
    let delayMs = 200; // Start after a brief pause
    footballs.forEach((football, index) => {
        if (index >= ballCount) return; // Only count actual footballs, not extras
        
        setTimeout(() => {
            // Add counting animation to this football
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12); // Beep sound
            
            // Show counter label in the center of the stack
            if (index === 0) {
                // Clear any previous label
                const oldLabel = stack.querySelector('.counting-label-overlay');
                if (oldLabel) oldLabel.remove();
            } else {
                // Remove previous label
                const oldLabel = stack.querySelector('.counting-label-overlay');
                if (oldLabel) oldLabel.remove();
            }
            
            // Add new counter label
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stack.appendChild(label);
            
            // Remove the counting active class after animation completes
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, delayMs + (index * 150)); // 150ms between each football
    });
    
    // After all footballs are counted, show the calculation
    setTimeout(() => {
        // Remove counter label
        const label = stack.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        // Add complete mode and show calculation
        stack.classList.add('counting-complete');
        const calcDisplay = document.createElement('div');
        calcDisplay.className = 'calculation-display';
        calcDisplay.textContent = `${ballCount} × ${perSymbol} = ${count}`;
        stack.appendChild(calcDisplay);
        
        // Success sound
        playTone(784, 0.3, 'sine', 0.14);
        
        // Remove animation classes after 2 seconds
        setTimeout(() => {
            stack.classList.remove('counting-mode', 'counting-complete');
            if (calcDisplay) calcDisplay.remove();
        }, 2000);
        
    }, delayMs + (ballCount * 150) + 100);
}

// ─── ANIMATE COMPARISON (TWO CLASSES) ──────────────────────────────────────
function animateComparison(classes) {
    const [c1, c2] = classes;
    const stack1 = $(`stack-${c1}`);
    const stack2 = $(`stack-${c2}`);
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    
    if (!stack1 || !stack2) return;
    
    const count1 = STATE.dataset[c1];
    const count2 = STATE.dataset[c2];
    const ballCount1 = Math.ceil(count1 / perSymbol);
    const ballCount2 = Math.ceil(count2 / perSymbol);
    
    // ─── Animate Class 1 ───
    stack1.classList.add('counting-mode');
    const footballs1 = Array.from(stack1.querySelectorAll('.football-icon'));
    
    let delayMs = 200;
    footballs1.forEach((football, index) => {
        if (index >= ballCount1) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stack1.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stack1.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, delayMs + (index * 150));
    });
    
    // Show calculation for class 1
    const calcTime1 = delayMs + (ballCount1 * 150) + 100;
    setTimeout(() => {
        const label = stack1.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        const calcDisplay = document.createElement('div');
        calcDisplay.className = 'calculation-display';
        calcDisplay.textContent = `${ballCount1} × ${perSymbol} = ${count1}`;
        calcDisplay.id = `calc-class-${c1}`;
        stack1.appendChild(calcDisplay);
        
        playTone(784, 0.3, 'sine', 0.14);
    }, calcTime1);
    
    // ─── Animate Class 2 (after Class 1) ───
    const startSecondClass = calcTime1 + 300; // Wait after first class
    
    stack2.classList.add('counting-mode');
    const footballs2 = Array.from(stack2.querySelectorAll('.football-icon'));
    
    footballs2.forEach((football, index) => {
        if (index >= ballCount2) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stack2.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stack2.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, startSecondClass + (index * 150));
    });
    
    // Show calculation for class 2
    const calcTime2 = startSecondClass + (ballCount2 * 150) + 100;
    setTimeout(() => {
        const label = stack2.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        const calcDisplay = document.createElement('div');
        calcDisplay.className = 'calculation-display';
        calcDisplay.textContent = `${ballCount2} × ${perSymbol} = ${count2}`;
        calcDisplay.id = `calc-class-${c2}`;
        stack2.appendChild(calcDisplay);
        
        playTone(784, 0.3, 'sine', 0.14);
    }, calcTime2);
    
    // ─── Clean up after animation ───
    const comparisonTime = calcTime2 + 1500;
    setTimeout(() => {
        stack1.classList.remove('counting-mode');
        stack2.classList.remove('counting-mode');
        
        const calc1 = $(`calc-class-${c1}`);
        const calc2 = $(`calc-class-${c2}`);
        if (calc1) calc1.remove();
        if (calc2) calc2.remove();
        // Inline feedback will show in answer-insight div
    }, comparisonTime);
}

// ─── ANIMATE DIFFERENCE (SUBTRACTION) ───────────────────────────────────────
function animateDifference(classes) {
    const [largerClass, smallerClass] = classes;
    const stackLarger = $(`stack-${largerClass}`);
    const stackSmaller = $(`stack-${smallerClass}`);
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    
    if (!stackLarger || !stackSmaller) return;
    
    const countLarger = STATE.dataset[largerClass];
    const countSmaller = STATE.dataset[smallerClass];
    const ballCountLarger = Math.ceil(countLarger / perSymbol);
    const ballCountSmaller = Math.ceil(countSmaller / perSymbol);
    const difference = countLarger - countSmaller;
    
    // ─── Animate Larger Class ───
    stackLarger.classList.add('counting-mode');
    const footballsLarger = Array.from(stackLarger.querySelectorAll('.football-icon'));
    
    let delayMs = 200;
    footballsLarger.forEach((football, index) => {
        if (index >= ballCountLarger) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stackLarger.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stackLarger.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, delayMs + (index * 150));
    });
    
    // Show calculation for larger class
    const calcTimeLarger = delayMs + (ballCountLarger * 150) + 100;
    setTimeout(() => {
        const label = stackLarger.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        const calcDisplay = document.createElement('div');
        calcDisplay.className = 'calculation-display';
        calcDisplay.textContent = `${ballCountLarger} × ${perSymbol} = ${countLarger}`;
        calcDisplay.id = `calc-class-${largerClass}`;
        stackLarger.appendChild(calcDisplay);
        
        playTone(784, 0.3, 'sine', 0.14);
    }, calcTimeLarger);
    
    // ─── Animate Smaller Class (after larger class) ───
    const startSecondClass = calcTimeLarger + 300;
    
    stackSmaller.classList.add('counting-mode');
    const footballsSmaller = Array.from(stackSmaller.querySelectorAll('.football-icon'));
    
    footballsSmaller.forEach((football, index) => {
        if (index >= ballCountSmaller) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stackSmaller.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stackSmaller.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, startSecondClass + (index * 150));
    });
    
    // Show calculation for smaller class
    const calcTimeSmaller = startSecondClass + (ballCountSmaller * 150) + 100;
    setTimeout(() => {
        const label = stackSmaller.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        const calcDisplay = document.createElement('div');
        calcDisplay.className = 'calculation-display';
        calcDisplay.textContent = `${ballCountSmaller} × ${perSymbol} = ${countSmaller}`;
        calcDisplay.id = `calc-class-${smallerClass}`;
        stackSmaller.appendChild(calcDisplay);
        
        playTone(784, 0.3, 'sine', 0.14);
    }, calcTimeSmaller);
    
    // ─── Clean up after animation ───
    const subtractionTime = calcTimeSmaller + 1500;
    setTimeout(() => {
        stackLarger.classList.remove('counting-mode');
        stackSmaller.classList.remove('counting-mode');
        
        const calcLarger = $(`calc-class-${largerClass}`);
        const calcSmaller = $(`calc-class-${smallerClass}`);
        if (calcLarger) calcLarger.remove();
        if (calcSmaller) calcSmaller.remove();
        // Inline feedback will show in answer-insight div
    }, subtractionTime);
}

// ─── ANIMATE TOTAL COUNT (ALL 5 CLASSES WITH SUM) ──────────────────────────────
function animateTotalCount(allClasses) {
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    const stacks = [];
    let totalCount = 0;
    let cumulativeDelay = 200;
    
    // Prepare stacks
    allClasses.forEach(cls => {
        const stack = $(`stack-${cls}`);
        if (stack) {
            stacks.push({ cls, stack, count: STATE.dataset[cls] });
            totalCount += STATE.dataset[cls];
        }
    });
    
    // Animate each class sequentially
    stacks.forEach((item, idx) => {
        const { cls, stack, count } = item;
        const ballCount = Math.ceil(count / perSymbol);
        const footballs = Array.from(stack.querySelectorAll('.football-icon'));
        
        // Add counting mode to this stack
        setTimeout(() => {
            stack.classList.add('counting-mode');
        }, cumulativeDelay);
        
        // Count footballs for this class
        footballs.forEach((football, fIdx) => {
            if (fIdx >= ballCount) return;
            
            setTimeout(() => {
                football.classList.add('counting-active');
                playTone(659, 0.2, 'sine', 0.12);
                
                const oldLabel = stack.querySelector('.counting-label-overlay');
                if (oldLabel) oldLabel.remove();
                
                const label = document.createElement('div');
                label.className = 'counting-label-overlay';
                label.textContent = String(fIdx + 1);
                stack.appendChild(label);
                
                setTimeout(() => {
                    football.classList.remove('counting-active');
                }, 200);
                
            }, cumulativeDelay + (fIdx * 150));
        });
        
        // Show calculation for this class
        const calcTime = cumulativeDelay + (ballCount * 150) + 100;
        setTimeout(() => {
            const label = stack.querySelector('.counting-label-overlay');
            if (label) label.remove();
            
            const calcDisplay = document.createElement('div');
            calcDisplay.className = 'calculation-display';
            calcDisplay.textContent = `${ballCount} × ${perSymbol} = ${count}`;
            calcDisplay.id = `calc-class-${cls}-total`;
            stack.appendChild(calcDisplay);
            
            playTone(784, 0.3, 'sine', 0.14);
        }, calcTime);
        
        // Update delay for next class
        cumulativeDelay = calcTime + 200;
    });
    
    // Show final sum result
    const finalTime = cumulativeDelay + 1000;
    setTimeout(() => {
        // Remove all calc displays
        stacks.forEach(({ cls }) => {
            const calc = $(`calc-class-${cls}-total`);
            if (calc) calc.remove();
            const stack = $(`stack-${cls}`);
            if (stack) stack.classList.remove('counting-mode');
        });
        // Inline feedback will show in answer-insight div
    }, finalTime);
}

// ─── ANIMATE SYMBOL LOGIC (CLASS × FOOTBALLS) ────────────────────────────────
function animateSymbolLogic(cls, symbolCount, studentCount) {
    const stack = $(`stack-${cls}`);
    if (!stack) return;
    
    stack.classList.add('counting-mode');
    const footballs = Array.from(stack.querySelectorAll('.football-icon'));
    
    let delayMs = 200;
    footballs.forEach((football, index) => {
        if (index >= symbolCount) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stack.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stack.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, delayMs + (index * 150));
    });
    
    // Show multiplication result
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    
    setTimeout(() => {
        const label = stack.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        // Inline feedback will show in answer-insight div
        stack.classList.remove('counting-mode');
    }, delayMs + (symbolCount * 150) + 2000);
}

// ─── ANIMATE MEAN VALUE (AVERAGE ACROSS 5 CLASSES) ───────────────────────────
function animateMeanValue(allClasses, totalStudents, meanValue) {
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    const stacks = [];
    let cumulativeDelay = 200;
    
    // Prepare stacks
    allClasses.forEach(cls => {
        const stack = $(`stack-${cls}`);
        if (stack) {
            stacks.push({ cls, stack, count: STATE.dataset[cls] });
        }
    });
    
    // Animate each class sequentially
    stacks.forEach((item, idx) => {
        const { cls, stack, count } = item;
        const ballCount = Math.ceil(count / perSymbol);
        const footballs = Array.from(stack.querySelectorAll('.football-icon'));
        
        // Add counting mode to this stack
        setTimeout(() => {
            stack.classList.add('counting-mode');
        }, cumulativeDelay);
        
        // Count footballs for this class
        footballs.forEach((football, fIdx) => {
            if (fIdx >= ballCount) return;
            
            setTimeout(() => {
                football.classList.add('counting-active');
                playTone(659, 0.2, 'sine', 0.12);
                
                const oldLabel = stack.querySelector('.counting-label-overlay');
                if (oldLabel) oldLabel.remove();
                
                const label = document.createElement('div');
                label.className = 'counting-label-overlay';
                label.textContent = String(fIdx + 1);
                stack.appendChild(label);
                
                setTimeout(() => {
                    football.classList.remove('counting-active');
                }, 200);
                
            }, cumulativeDelay + (fIdx * 150));
        });
        
        // Show calculation for this class
        const calcTime = cumulativeDelay + (ballCount * 150) + 100;
        setTimeout(() => {
            const label = stack.querySelector('.counting-label-overlay');
            if (label) label.remove();
            
            const calcDisplay = document.createElement('div');
            calcDisplay.className = 'calculation-display';
            calcDisplay.textContent = `${ballCount} × ${perSymbol} = ${count}`;
            calcDisplay.id = `calc-class-${cls}-mean`;
            stack.appendChild(calcDisplay);
            
            playTone(784, 0.3, 'sine', 0.14);
        }, calcTime);
        
        // Update delay for next class
        cumulativeDelay = calcTime + 200;
    });
    
    // Show final average result
    const finalTime = cumulativeDelay + 1000;
    setTimeout(() => {
        // Remove all calc displays
        stacks.forEach(({ cls }) => {
            const calc = $(`calc-class-${cls}-mean`);
            if (calc) calc.remove();
            const stack = $(`stack-${cls}`);
            if (stack) stack.classList.remove('counting-mode');
        });
        // Inline feedback will show in answer-insight div
    }, finalTime);
}

// ─── ANIMATE MISSING SYMBOL (DIVISION) ──────────────────────────────────────
function animateMissingSymbol(cls, studentCount, footballsNeeded) {
    const stack = $(`stack-${cls}`);
    if (!stack) return;
    
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    
    stack.classList.add('counting-mode');
    const footballs = Array.from(stack.querySelectorAll('.football-icon'));
    
    let delayMs = 200;
    footballs.forEach((football, index) => {
        if (index >= footballsNeeded) return;
        
        setTimeout(() => {
            football.classList.add('counting-active');
            playTone(659, 0.2, 'sine', 0.12);
            
            const oldLabel = stack.querySelector('.counting-label-overlay');
            if (oldLabel) oldLabel.remove();
            
            const label = document.createElement('div');
            label.className = 'counting-label-overlay';
            label.textContent = String(index + 1);
            stack.appendChild(label);
            
            setTimeout(() => {
                football.classList.remove('counting-active');
            }, 200);
            
        }, delayMs + (index * 150));
    });
    
    // Show division result  
    setTimeout(() => {
        const label = stack.querySelector('.counting-label-overlay');
        if (label) label.remove();
        
        stack.classList.remove('counting-mode');
        // Inline feedback will show in answer-insight div
    }, delayMs + (footballsNeeded * 150) + 2000);
}

function resetHelper() {
    $('helper-content').innerHTML = `
        <div class="helper-idle">
            <div class="helper-mascot">🤖</div>
            <p>I'll help you learn from mistakes!</p>
            <p class="helper-tip">${STATE.phase === 'build' ? 'Build your pictograph first!' : 'Answer the questions!'}</p>
        </div>
    `;
}

function showAnswerInsight(question) {
    const insightEl = $('answer-insight');
    const lvl = LEVELS[(STATE.currentLevel - 1) % LEVELS.length];
    const perSymbol = lvl.perSymbol;
    
    let insight = '';
    
    if (question.type === 'Comparison') {
        const [c1, c2] = question.comparisonClasses;
        const count1 = STATE.dataset[c1];
        const count2 = STATE.dataset[c2];
        const result = count1 > count2 ? c1 : (count2 > count1 ? c2 : 'equal');
        const diff = Math.abs(count1 - count2);
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: Which class has MORE students?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>Class ${c1}:</strong> ${count1} students 🏃 <br/>
                <strong>Class ${c2}:</strong> ${count2} students 🏃
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: Class ${result}</strong> <br/>
                ${result === 'equal' ? `Both classes have exactly <strong>${count1}</strong> students - EQUAL!` : `Class ${result} has <strong>${diff}</strong> more student${diff !== 1 ? 's' : ''} than Class ${result === c1 ? c2 : c1}`}
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve:</strong> <br/>
                1️⃣ Count the footballs for each class<br/>
                2️⃣ Compare which class has MORE footballs<br/>
                3️⃣ The class with more footballs has more students!
            </div>
        `;
    } 
    else if (question.type === 'Difference') {
        const [d1, d2] = question.differenceClasses;
        const count1 = STATE.dataset[d1];
        const count2 = STATE.dataset[d2];
        const larger = Math.max(count1, count2);
        const smaller = Math.min(count1, count2);
        const diff = larger - smaller;
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: What is the DIFFERENCE between the classes?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>Class ${d1}:</strong> ${count1} students 🏃 <br/>
                <strong>Class ${d2}:</strong> ${count2} students 🏃
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: ${diff} students</strong>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve:</strong> <br/>
                1️⃣ Find the LARGER number: <strong>${larger}</strong><br/>
                2️⃣ Find the SMALLER number: <strong>${smaller}</strong><br/>
                3️⃣ Subtract: ${larger} − ${smaller} = <strong>${diff}</strong>
            </div>
        `;
    }
    else if (question.type === 'Total Count') {
        let total = 0;
        question.allClasses.forEach(cls => { total += STATE.dataset[cls]; });
        const counts = question.allClasses.map(c => STATE.dataset[c]);
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: How many students in ALL classes?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>All Classes Combined:</strong><br/>
                ${question.allClasses.map((c, i) => `Class ${c}: <strong>${counts[i]}</strong> students`).join(' 🤝 ')}
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: ${total} students</strong>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve:</strong> <br/>
                ADD all the numbers together:<br/>
                ${counts.join(' + ')} = <strong>${total}</strong>
            </div>
        `;
    }
    else if (question.type === 'Symbol Logic') {
        const cls = question.explainClass;
        const count = STATE.dataset[cls];
        const balls = Math.ceil(count / perSymbol);
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: How many students does Class ${cls} represent?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>Rule:</strong> Each ⚽ football = <strong>${perSymbol} students</strong><br/>
                <strong>Class ${cls} has:</strong> <strong>${balls}</strong> footballs
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: ${count} students</strong>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve:</strong> <br/>
                1️⃣ Count the ⚽ footballs: <strong>${balls}</strong><br/>
                2️⃣ Multiply by ${perSymbol} (students per football)<br/>
                3️⃣ ${balls} × ${perSymbol} = <strong>${count}</strong> students
            </div>
        `;
    }
    else if (question.type === 'Mean Value') {
        let total = 0;
        question.allClasses.forEach(cls => { total += STATE.dataset[cls]; });
        const mean = Math.round(total / question.allClasses.length);
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: What is the AVERAGE (mean) across all classes?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>All 5 Classes:</strong> ${question.allClasses.map(c => STATE.dataset[c]).join(', ')} students
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: ${mean} students</strong>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve (Average = Total ÷ Count):</strong> <br/>
                1️⃣ Add all numbers: ${question.allClasses.map(c => STATE.dataset[c]).join(' + ')} = <strong>${total}</strong><br/>
                2️⃣ Count how many classes: <strong>5 classes</strong><br/>
                3️⃣ Divide: ${total} ÷ 5 = <strong>${mean}</strong> average
            </div>
        `;
    }
    else if (question.type === 'Missing Symbol') {
        const cls = question.explainClass;
        const count = STATE.dataset[cls];
        const footballs = Math.floor(count / perSymbol);
        const remainder = count % perSymbol;
        
        insight = `
            <div style="font-weight: 700; color: #d32f2f; margin-bottom: 10px;">📋 Question: How many footballs does Class ${cls} need?</div>
            <div style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                <strong>Class ${cls} has:</strong> <strong>${count}</strong> students<br/>
                <strong>Rule:</strong> Each ⚽ = ${perSymbol} students
            </div>
            <div style="background: rgba(46,125,50,0.1); padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid var(--success);">
                <strong>✅ Correct Answer: ${footballs} football${footballs !== 1 ? 's' : ''}${remainder > 0 ? ` + 1 half football ◐` : ''}</strong>
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>💡 How to solve (Division):</strong> <br/>
                1️⃣ Total students: <strong>${count}</strong><br/>
                2️⃣ Divide by ${perSymbol}: ${count} ÷ ${perSymbol} = <strong>${footballs}</strong>${remainder > 0 ? ` remainder ${remainder}` : ''}<br/>
                ${remainder > 0 ? `3️⃣ The remainder <strong>${remainder}</strong> means we need 1 <strong>half football ◐</strong> for those students!` : ''}
            </div>
        `;
    }
    
    if (insight) {
        insightEl.innerHTML = insight;
        insightEl.className = 'answer-insight show';
    }
}

function scrollToWrongAnswerFeedback() {
    const questionCard = $('question-card');
    const insightEl = $('answer-insight');
    const feedbackEl = $('question-feedback');

    if (questionCard) {
        questionCard.scrollTo({ top: questionCard.scrollHeight, behavior: 'smooth' });
    }

    if (insightEl) {
        insightEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (feedbackEl) {
        feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ─── RETRY / NEXT ───────────────────────────────────────────────────────────
function retryQuestion() {
    sfxClick();
    showQuestion(STATE.currentQuestionIndex);
}

function nextQuestion() {
    sfxClick();
    showQuestion(STATE.currentQuestionIndex + 1);
}

function nextLevel() {
    sfxClick();
    hide('level-complete-modal');
    if (STATE.levelCompleteTimer) {
        clearTimeout(STATE.levelCompleteTimer);
        STATE.levelCompleteTimer = null;
    }

    if (STATE.currentLevel >= LEVELS.length) {
        showFinalStatsModal();
        return;
    }

    const completedLabel = LEVELS[(STATE.currentLevel - 1) % LEVELS.length].label;
    STATE.currentLevel++;
    const nextLabel = LEVELS[(STATE.currentLevel - 1) % LEVELS.length].label;
    loadLevel(STATE.currentLevel);
    sfxLevelUp();
    showLevelTransitionPopup(`✅ ${completedLabel} level completed! Build the ${nextLabel} pictograph now.`);
}

// ─── STARS ──────────────────────────────────────────────────────────────────
function updateStars() {
    const starsBox = $('stars-display');
    const total = STATE.questionsAnswered;
    const correct = STATE.questionsCorrect;
    const ratio = total > 0 ? correct / total : 0;

    let starCount = 0;
    if (ratio >= 0.9) starCount = 3;
    else if (ratio >= 0.7) starCount = 2;
    else if (ratio >= 0.4) starCount = 1;

    STATE.stars = starCount;
    starsBox.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'star ' + (i < starCount ? 'filled' : 'empty');
        s.textContent = i < starCount ? '⭐' : '☆';
        starsBox.appendChild(s);
    }
}

// ─── LEVEL COMPLETE ─────────────────────────────────────────────────────────
function showLevelComplete() {
    // Stars for this level based on mistakes
    let lcStars = 3;
    if (STATE.levelMistakes > 0) lcStars = 2;
    if (STATE.levelMistakes > 2) lcStars = 1;

    const isFinalLevel = STATE.currentLevel >= LEVELS.length;
    $('lc-title').textContent = isFinalLevel
        ? `🎉 Hard Level Complete! Game Finished!`
        : `Level ${STATE.currentLevel} Complete!`;

    const starsDiv = $('lc-stars');
    starsDiv.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'lc-star';
        s.textContent = i < lcStars ? '⭐' : '☆';
        s.style.animationDelay = `${i * 0.2}s`;
        starsDiv.appendChild(s);
    }

    $('lc-score').textContent = STATE.levelScore;
    $('lc-stars-count').textContent = `${lcStars} / 3`;
    $('lc-mistakes').textContent = STATE.levelMistakes;
    STATE.levelStars[STATE.currentLevel] = lcStars;

    const nextBtn = $('lc-next-btn');
    if (nextBtn) {
        nextBtn.textContent = isFinalLevel ? '🏁 Finish Game' : '🚀 Play Next Level';
    }

    show('level-complete-modal');
    launchConfetti();
    sfxLevelUp();
}

function showFinalStatsModal() {
    const totalStars = Object.values(STATE.levelStars).reduce((sum, stars) => sum + stars, 0);
    $('final-score').textContent = STATE.score;
    $('final-stars').textContent = `${totalStars} / ${LEVELS.length * 3}`;
    $('final-mistakes').textContent = STATE.totalMistakes;
    show('final-stats-modal');
    launchConfetti();
}

// ─── BADGE POPUP ────────────────────────────────────────────────────────────
function showBadgePopup(text) {
    const el = document.createElement('div');
    el.className = 'floating-star';
    el.textContent = text;
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.fontSize = '1rem';
    el.style.fontFamily = 'var(--font-display)';
    el.style.color = 'var(--star-gold)';
    el.style.textShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.whiteSpace = 'nowrap';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function showLevelTransitionPopup(text) {
    const existing = document.querySelector('.level-transition-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'level-transition-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

// ─── EYE CANDY / EFFECTS ───────────────────────────────────────────────────
function spawnSparkles() {
    const emojis = ['✨', '⭐', '💫', '🌟'];
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'sparkle';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.left = (30 + Math.random() * 40) + '%';
            el.style.top = (30 + Math.random() * 30) + '%';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 1100);
        }, i * 80);
    }
}

function spawnCheer() {
    const emojis = ['👏', '🎉', '🥳', '💪', '🙌'];
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'cheer-emoji';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.left = (10 + Math.random() * 80) + '%';
            el.style.bottom = '60px';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2200);
        }, i * 150);
    }
}

// ─── CONFETTI ───────────────────────────────────────────────────────────────
function launchConfetti() {
    const canvas = $('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#ff6f00','#42a5f5','#66bb6a','#ffc107','#ef5350','#ab47bc','#26c6da'];

    for (let i = 0; i < 120; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * -canvas.height,
            w: 6 + Math.random() * 6,
            h: 4 + Math.random() * 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 4,
            rot: Math.random() * 360,
            vr: (Math.random() - 0.5) * 8,
            life: 1,
        });
    }

    let frame;
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        pieces.forEach(p => {
            if (p.life <= 0) return;
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            p.vy += 0.08;
            if (p.y > canvas.height) p.life -= 0.05;
            p.life -= 0.003;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
            ctx.restore();
        });

        if (alive) {
            frame = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(frame);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animate();
}

// ─── WINDOW RESIZE ──────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    const canvas = $('confetti-canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// ─── KEYBOARD SHORTCUTS ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        hide('help-modal');
        hide('teacher-modal');
    }
});
