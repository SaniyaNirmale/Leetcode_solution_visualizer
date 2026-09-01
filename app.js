/* ═══════════════════════════════════════════════════
   app.js
   Main application controller.
   Manages state, UI transitions, code rendering,
   step navigation, and orchestrates the visualizer.
   ═══════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
const App = {
    trace:       null,   // Full trace from AI
    stepIndex:   0,      // 0-based current step
    isPlaying:   false,
    playTimer:   null,
    playSpeed:   1800,   // ms per step in auto-play
    codeLines:   [],     // Cached split lines of user code
};

// ══════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════
const $ = id => document.getElementById(id);

// Header
const settingsBtn    = $('settingsBtn');
const settingsModal  = $('settingsModal');
const closeModal     = $('closeModal');
const cancelModal    = $('cancelModal');
const saveApiKey     = $('saveApiKey');
const apiKeyInput    = $('apiKeyInput');
const apiStatus      = $('apiStatus');
const apiWarning     = $('apiWarning');
const apiWarningBtn  = $('apiWarningBtn');

// Controls
const languageSelect = $('languageSelect');
const problemTitle   = $('problemTitle');
const exampleInput   = $('exampleInput');   // now a textarea
const buildBtn       = $('buildBtn');
const resetBtn       = $('resetBtn');
const prevBtn        = $('prevBtn');
const nextBtn        = $('nextBtn');
const playBtn        = $('playBtn');
const playBtnIcon    = $('playBtnIcon');
const playBtnText    = $('playBtnText');
const speedSelect    = $('speedSelect');
const clearCodeBtn   = $('clearCodeBtn');
const editorStat     = $('editorStat');

// Sections
const inputSection   = $('inputSection');
const loadingSection = $('loadingSection');
const errorSection   = $('errorSection');
const vizSection     = $('vizSection');
const problemBanner  = $('problemBanner');

// Left panel
const stepLabel      = $('stepLabel');
const progressThumb  = $('progressThumb');
const stepBoxText    = $('stepBoxText');
const whyBox         = $('whyBox');
const whyBoxText     = $('whyBoxText');

// Right panel
const codeViewer     = $('codeViewer');
const narrationText  = $('narrationText');

// Code input
const codeInput      = $('codeInput');
const lineNums       = $('lineNums');

// ══════════════════════════════════════════
// API KEY MANAGEMENT
// ══════════════════════════════════════════
function getApiKey() {
    return localStorage.getItem('dsa_viz_api_key') || '';
}

function setApiKey(key) {
    localStorage.setItem('dsa_viz_api_key', key.trim());
}

function checkApiKeyWarning() {
    if (!getApiKey()) {
        apiWarning.style.display = 'flex';
    } else {
        apiWarning.style.display = 'none';
    }
}

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function openModal() {
    apiKeyInput.value = getApiKey();
    apiStatus.style.display = 'none';
    settingsModal.classList.add('open');
    apiKeyInput.focus();
}

function closeModalFn() {
    settingsModal.classList.remove('open');
}

settingsBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFn);
cancelModal.addEventListener('click', closeModalFn);
settingsModal.addEventListener('click', e => {
    if (e.target === settingsModal) closeModalFn();
});

saveApiKey.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showApiStatus('Please enter a key', 'error');
        return;
    }

    saveApiKey.disabled = true;
    saveApiKey.textContent = 'Validating...';
    showApiStatus('Checking key...', '');

    const valid = await validateApiKey(key);

    if (valid) {
        setApiKey(key);
        showApiStatus('✓ Key saved and validated!', 'success');
        checkApiKeyWarning();
        setTimeout(closeModalFn, 1400);
    } else {
        showApiStatus('✗ Invalid key or network error. Please check and retry.', 'error');
    }

    saveApiKey.disabled = false;
    saveApiKey.textContent = 'Save Key';
});

function showApiStatus(msg, type) {
    apiStatus.style.display = 'block';
    apiStatus.textContent = msg;
    apiStatus.className = `api-status${type ? ' ' + type : ''}`;
}

apiWarningBtn.addEventListener('click', openModal);


// Clear button
if (clearCodeBtn) {
    clearCodeBtn.addEventListener('click', () => {
        codeInput.value = '';
        exampleInput.value = '';
        problemTitle.value = '';
        updateLineNumbers();
        updateEditorStat();
        codeInput.focus();
    });
}

// Speed selector
if (speedSelect) {
    speedSelect.addEventListener('change', () => {
        App.playSpeed = parseInt(speedSelect.value, 10);
    });
}

// ══════════════════════════════════════════
// LINE NUMBERS IN CODE EDITOR
// ══════════════════════════════════════════
function updateLineNumbers() {
    const lines = codeInput.value.split('\n').length;
    lineNums.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
}

function updateEditorStat() {
    if (!editorStat) return;
    const lines = codeInput.value.split('\n').length;
    const chars = codeInput.value.length;
    editorStat.textContent = codeInput.value.trim() === ''
        ? '0 lines'
        : `${lines} line${lines !== 1 ? 's' : ''} · ${chars} chars`;
}



codeInput.addEventListener('input', () => {
    updateLineNumbers();
    updateEditorStat();
});
codeInput.addEventListener('scroll', () => {
    lineNums.scrollTop = codeInput.scrollTop;
});
codeInput.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeInput.selectionStart;
        const end   = codeInput.selectionEnd;
        codeInput.value = codeInput.value.slice(0, start) + '    ' + codeInput.value.slice(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 4;
        updateLineNumbers();
    }
});

function showSection(name) {
    inputSection.style.display   = name === 'input'   ? 'flex'  : 'none';
    loadingSection.style.display = name === 'loading' ? 'flex'  : 'none';
    errorSection.style.display   = name === 'error'   ? 'flex'  : 'none';
    vizSection.style.display     = name === 'viz'     ? 'block' : 'none';

    if (name === 'input') inputSection.style.flexDirection = 'column';

    // Hide template chips / side panel when not on input screen
    const templatesBar = document.querySelector('.templates-bar');
    if (templatesBar) templatesBar.style.display = name === 'input' ? '' : 'none';
}

// ══════════════════════════════════════════
// BUILD & ANALYZE
// ══════════════════════════════════════════
buildBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
    const code    = codeInput.value.trim();
    const lang    = languageSelect.value;
    const example = exampleInput.value.trim();
    const title   = problemTitle.value.trim();
    const apiKey  = getApiKey();

    // Validation
    if (!code) {
        codeInput.focus();
        codeInput.style.outline = '2px solid #dc2626';
        setTimeout(() => { codeInput.style.outline = ''; }, 2000);
        return;
    }
    if (!example) {
        exampleInput.focus();
        exampleInput.style.outline = '2px solid #dc2626';
        setTimeout(() => { exampleInput.style.outline = ''; }, 2000);
        return;
    }
    if (!apiKey) {
        openModal();
        return;
    }

    stopPlay();
    showSection('loading');
    startLoadingAnimation();

    try {
        let trace = await executeDeterministicTrace(code, example);
        
        // Pass the raw mathematical trace to AI for explanation text
        try {
            trace = await generateExplanations(code, lang, example, title, apiKey, trace);
        } catch (aiErr) {
            console.warn("AI explanation failed, falling back to raw deterministic trace:", aiErr);
        }
        
        // ── STATE INHERITANCE ──
        // If the AI omitted arrays in subsequent steps to save tokens, carry them over from previous step
        if (trace.steps && trace.steps.length > 0) {
            for (let i = 1; i < trace.steps.length; i++) {
                if (!trace.steps[i].visualization) trace.steps[i].visualization = {};
                const currVis = trace.steps[i].visualization;
                const prevVis = trace.steps[i-1].visualization || {};
                
                // Inherit type if missing
                if (!currVis.type) currVis.type = prevVis.type || trace.visualization_type;
                
                if (currVis.type === (prevVis.type || trace.visualization_type)) {
                    if ((!currVis.nodes || currVis.nodes.length === 0) && prevVis.nodes?.length > 0) currVis.nodes = JSON.parse(JSON.stringify(prevVis.nodes));
                    if ((!currVis.connections || currVis.connections.length === 0) && prevVis.connections?.length > 0) currVis.connections = JSON.parse(JSON.stringify(prevVis.connections));
                    if ((!currVis.elements || currVis.elements.length === 0) && prevVis.elements?.length > 0) currVis.elements = JSON.parse(JSON.stringify(prevVis.elements));
                    if ((!currVis.grid || currVis.grid.length === 0) && prevVis.grid?.length > 0) currVis.grid = JSON.parse(JSON.stringify(prevVis.grid));
                    
                    if ((!currVis.pointers || Object.keys(currVis.pointers).length === 0) && prevVis.pointers) currVis.pointers = JSON.parse(JSON.stringify(prevVis.pointers));
                    if ((!currVis.highlighted_nodes || currVis.highlighted_nodes.length === 0) && prevVis.highlighted_nodes?.length > 0) currVis.highlighted_nodes = JSON.parse(JSON.stringify(prevVis.highlighted_nodes));
                    if ((!currVis.highlighted || currVis.highlighted.length === 0) && prevVis.highlighted?.length > 0) currVis.highlighted = JSON.parse(JSON.stringify(prevVis.highlighted));
                    if ((!currVis.secondary || currVis.secondary.length === 0) && prevVis.secondary?.length > 0) currVis.secondary = JSON.parse(JSON.stringify(prevVis.secondary));
                }

                if (!trace.steps[i].variables || Object.keys(trace.steps[i].variables).length === 0) {
                    if (trace.steps[i-1].variables) trace.steps[i].variables = JSON.parse(JSON.stringify(trace.steps[i-1].variables));
                }
            }
        }

        App.trace      = trace;
        App.stepIndex  = 0;
        App.codeLines  = code.split('\n');
        initVisualization();
        showSection('viz');
        showProblemBanner(trace);
    } catch (err) {
        showSection('error');
        $('errorText').textContent = err.message || 'Unknown error occurred.';
    }
}

// Animate loading steps
let _loadingTimers = [];
function startLoadingAnimation() {
    const steps = ['ls1', 'ls2', 'ls3'];
    steps.forEach(id => {
        const el = $(id);
        if (el) { el.classList.remove('active', 'done'); }
    });
    _loadingTimers.forEach(clearTimeout);
    _loadingTimers = [];

    let delay = 0;
    steps.forEach((id, i) => {
        if (i > 0) {
            const prevId = steps[i-1];
            _loadingTimers.push(setTimeout(() => {
                const prev = $(prevId);
                if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
            }, delay));
            delay += 400;
        }
        _loadingTimers.push(setTimeout(() => {
            const el = $(id);
            if (el) el.classList.add('active');
        }, delay));
        delay += 1400;
    });
}

// Error buttons
$('retryBtn').addEventListener('click', startAnalysis);
$('errorResetBtn').addEventListener('click', () => {
    showSection('input');
    problemBanner.style.display = 'none';
});

// ══════════════════════════════════════════
// PROBLEM BANNER
// ══════════════════════════════════════════
function showProblemBanner(trace) {
    const titleEl = $('problemLabel');
    const descEl  = $('problemDescText');

    titleEl.textContent = trace.title || 'Problem';
    descEl.textContent  = trace.description || '';
    problemBanner.style.display = 'flex';
}

// ══════════════════════════════════════════
// INITIALIZE VISUALIZATION
// ══════════════════════════════════════════
function initVisualization() {
    resetVisualizer();

    // Render the code into the viewer
    renderCodeViewer(App.codeLines, App.trace.visualization_type);

    // Enable controls
    resetBtn.disabled = false;
    updateNavButtons();

    // Render first step
    renderStep(0);
}

// ── Render code in right panel ──
function renderCodeViewer(lines, lang) {
    codeViewer.innerHTML = '';
    
    // Normalize lang for Prism
    const prismLang = lang === 'python' ? 'python' : 'java';
    
    lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'code-line';
        div.id = `code-line-${i + 1}`;
        
        let highlighted = '';
        if (window.Prism && Prism.languages[prismLang]) {
            highlighted = Prism.highlight(line, Prism.languages[prismLang], prismLang);
        } else {
            // Fallback just escape html
            highlighted = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        div.innerHTML = `
            <span class="code-line-num">${i + 1}</span>
            <span class="code-line-content">${highlighted}</span>
        `;
        codeViewer.appendChild(div);
    });
}



// ══════════════════════════════════════════
// STEP RENDERING
// ══════════════════════════════════════════
function renderStep(idx) {
    if (!App.trace || !App.trace.steps) return;

    const step  = App.trace.steps[idx];
    const total = App.trace.steps.length;
    if (!step) return;

    // Progress
    const pct = ((idx + 1) / total) * 100;
    progressThumb.style.width = pct + '%';
    stepLabel.textContent = `Step ${idx + 1} of ${total}`;

    // Explanation
    stepBoxText.textContent = step.explanation || '—';

    // Insight
    if (step.insight) {
        whyBox.style.display = 'block';
        whyBoxText.textContent = step.insight;
    } else {
        whyBox.style.display = 'none';
    }

    // Narration
    narrationText.textContent = step.explanation || '—';

    // Highlight code line
    highlightCodeLine(step.line);

    // Variables
    renderVariables(step.variables || {});

    // Visualization
    renderVisualization(step, App.trace.visualization_type);

    // Update nav buttons
    updateNavButtons();
}

// ── Highlight a line in the code viewer ──
function highlightCodeLine(lineNum) {
    // Remove previous highlights
    document.querySelectorAll('.code-line.active').forEach(el => {
        el.classList.remove('active');
    });

    if (!lineNum) return;

    // Find the line element
    const lineEl = $(`code-line-${lineNum}`);
    if (lineEl) {
        lineEl.classList.add('active');
        // Scroll into view (center it)
        lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
        // Try to find by approximate match (AI might return 1-indexed)
        const approx = $(`code-line-${Math.max(1, lineNum)}`);
        if (approx) {
            approx.classList.add('active');
            approx.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function updateNavButtons() {
    if (!App.trace) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        playBtn.disabled = true;
        return;
    }
    const total = App.trace.steps.length;
    prevBtn.disabled = App.stepIndex <= 0;
    nextBtn.disabled = App.stepIndex >= total - 1;
    playBtn.disabled = total <= 1;
}

nextBtn.addEventListener('click', stepForward);
prevBtn.addEventListener('click', stepBack);

function stepForward() {
    if (!App.trace) return;
    const total = App.trace.steps.length;
    if (App.stepIndex < total - 1) {
        App.stepIndex++;
        renderStep(App.stepIndex);
    }
}

function stepBack() {
    if (!App.trace) return;
    if (App.stepIndex > 0) {
        App.stepIndex--;
        renderStep(App.stepIndex);
    }
}

// ── Keyboard navigation ──
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        stepForward();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepBack();
    } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
    }
});

// ══════════════════════════════════════════
// AUTO-PLAY
// ══════════════════════════════════════════
playBtn.addEventListener('click', togglePlay);

function togglePlay() {
    if (App.isPlaying) {
        stopPlay();
    } else {
        startPlay();
    }
}

function startPlay() {
    if (!App.trace) return;
    if (App.stepIndex >= App.trace.steps.length - 1) {
        App.stepIndex = 0;
        renderStep(0);
    }
    App.isPlaying = true;
    playBtnIcon.textContent = '⏸';
    playBtnText.textContent = 'Pause';
    playBtn.className = 'btn btn-ghost';

    scheduleNextPlay();
}

function scheduleNextPlay() {
    if (!App.isPlaying) return;
    App.playTimer = setTimeout(() => {
        if (App.stepIndex < App.trace.steps.length - 1) {
            App.stepIndex++;
            renderStep(App.stepIndex);
            scheduleNextPlay();
        } else {
            stopPlay();
        }
    }, App.playSpeed);
}

function stopPlay() {
    App.isPlaying = false;
    clearTimeout(App.playTimer);
    playBtnIcon.textContent = '▶';
    playBtnText.textContent = 'Play';
    playBtn.className = 'btn btn-success';
}

// ══════════════════════════════════════════
// RESET
// ══════════════════════════════════════════
resetBtn.addEventListener('click', resetToInput);

function resetToInput() {
    stopPlay();
    App.trace      = null;
    App.stepIndex  = 0;
    App.codeLines  = [];

    showSection('input');
    problemBanner.style.display = 'none';

    resetBtn.disabled = true;
    prevBtn.disabled  = true;
    nextBtn.disabled  = true;
    playBtn.disabled  = true;
    playBtn.className = 'btn btn-success';
    playBtnIcon.textContent = '▶';
    playBtnText.textContent = 'Play';
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(function init() {
    // Pre-load API key so user doesn't have to enter it manually
    const DEFAULT_KEY = '';

    showSection('input');
    checkApiKeyWarning();
    updateEditorStat();

    // Pre-fill API key input in modal
    apiKeyInput.value = getApiKey();
})();
