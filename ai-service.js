// ai-service.js
// Groq AI Integration for Code Explanations

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

let _selectedModel = null;
const MODEL_PRIORITY = [
    'llama-3.1-70b',
    'llama3-70b',
    'llama-3.3-70b',
    'mixtral-8x7b',
    'gemma2-9b',
];

const MODEL_BLOCKLIST = ['qwen', 'whisper', 'guard', 'tool-use', 'vision', '1b', '3b', '7b-it'];

async function getBestModel(apiKey) {
    if (_selectedModel) return _selectedModel;
    try {
        const resp = await fetch(GROQ_MODELS_URL, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        if (!resp.ok) throw new Error('Could not fetch models');
        const data = await resp.json();
        const models = (data.data || []).map(m => m.id);
        const allowed = models.filter(id => !MODEL_BLOCKLIST.some(bad => id.toLowerCase().includes(bad)));
        for (const keyword of MODEL_PRIORITY) {
            const match = allowed.find(id => id.toLowerCase().includes(keyword));
            if (match) {
                _selectedModel = match;
                return match;
            }
        }
        _selectedModel = allowed[0] || 'llama-3.1-70b-versatile';
        return _selectedModel;
    } catch {
        return 'llama-3.1-70b-versatile';
    }
}

/**
 * Generates an explanation map for the code lines using Groq.
 */
async function generateExplanations(code, language, exampleInput, problemTitle, apiKey, rawTrace) {
    // 1. Pre-fill basic explanations immediately so it NEVER shows "-"
    for (const step of rawTrace.steps) {
        step.explanation = `Executing line ${step.line}...`;
    }

    if (!apiKey) return rawTrace; // skip AI if no key

    const prompt = `You are a DSA educator.
Analyze this code and explain what happens on each meaningful line.
Return a JSON object mapping the line number (as a string) to a short 1-sentence explanation.
Also provide a "problem_insight" field with a 2-sentence summary of the algorithm's strategy.

Code:
${code.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}

Example Input:
${exampleInput}
`;

    const model = await getBestModel(apiKey);
    const payload = {
        model: model,
        messages: [{ role: 'system', content: 'Return valid JSON only.' }, { role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
    };

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn("Groq API Error:", await response.text());
            return rawTrace; // Fallback to basic explanations
        }

        const data = await response.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (!rawText) return rawTrace;
        
        let explanations = {};
        try {
            explanations = JSON.parse(rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
        } catch (parseErr) {
            console.warn("Failed to parse AI explanations JSON:", parseErr);
        }

        // Annotate the raw trace with these AI explanations
        for (const step of rawTrace.steps) {
            const lineExp = explanations[step.line.toString()];
            if (lineExp) {
                step.explanation = lineExp;
            }
            if (explanations.problem_insight) {
                step.insight = explanations.problem_insight;
            }
        }
        
        return rawTrace;
    } catch (e) {
        console.error("AI Explanation Error:", e);
        return rawTrace;
    }
}
