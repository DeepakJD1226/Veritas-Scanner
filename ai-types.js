export const AI_MODEL = 'onnx-community/tmr-ai-text-detector-ONNX';
export const AI_REVISION = 'b9aa251e5bcda7e429fcc936767d921435945b60';
export function emptyAI(reason, status = 'unavailable') { return { status, score: null, reason, model: AI_MODEL, revision: AI_REVISION, checkedTokens: 0, totalTokens: 0, chunks: [] }; }
export function aiProbability(result) { const values = Array.isArray(result) ? result : []; const ai = values.find(v => v && typeof v === 'object' && 'label' in v && String(v.label).toLowerCase() === 'ai'); if (!ai || typeof ai.score !== 'number' || !Number.isFinite(ai.score) || ai.score < 0 || ai.score > 1)
    throw new Error('AI label or score is missing. No authorship conclusion is available.'); return ai.score; }
export function summaryScore(chunks) { let sum = 0, total = 0, covered = 0; for (const c of chunks) {
    const added = Math.max(0, c.endToken - Math.max(covered, c.startToken));
    sum += c.score * added;
    total += added;
    covered = Math.max(covered, c.endToken);
} return total ? sum / total : null; }
