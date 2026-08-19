/**
 * Groq AI Service — Real LLM-powered insights using llama3-8b-8192
 * Used for:
 *  - Personalized cognitive health insights
 *  - Smart recommendations
 *  - Anomaly explanations
 *  - Weekly report summaries
 */
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.1-8b-instant";
// ─── Core chat helper ─────────────────────────────────────────────────────────
async function chat(systemPrompt, userPrompt, maxTokens = 512) {
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("Groq API error:", err.message);
    return null;
  }
}
// ─── 1. Generate personalized AI insights ────────────────────────────────────
async function generatePersonalizedInsights(userData) {
  const {
    name, overallScore, baseline, cognitiveMetrics,
    trend, anomalyAlerts, sessionCount, daysSinceLastTest,
  } = userData;
  const metricsText = cognitiveMetrics
    .map((m) => `${m.name}: ${m.score ?? "N/A"} (baseline: ${m.baseline ?? "N/A"}, change: ${m.change > 0 ? "+" : ""}${m.change})`)
    .join(", ");
  const anomalyText = anomalyAlerts?.length
    ? anomalyAlerts.map((a) => `${a.testType} is ${a.severity} (z=${a.zScore}, ${a.direction} baseline)`).join("; ")
    : "No anomalies detected";
  const system = `You are CogTwin, an AI cognitive health assistant. You analyze brain health data and provide 
concise, empathetic, actionable insights. Always be encouraging but honest. Keep each insight to 1-2 sentences.
Respond ONLY with a JSON array of 3 insight objects with fields: type ("positive"|"warning"|"info"), title (max 6 words), description (1-2 sentences).`;

  const user = `User: ${name}
Overall cognitive score: ${overallScore ?? "No data yet"}
Sessions completed: ${sessionCount}
Days since last test: ${daysSinceLastTest ?? "Never tested"}
Trend: ${trend?.direction ?? "unknown"} (slope: ${trend?.slope ?? 0})
Metrics: ${metricsText}
Anomalies: ${anomalyText}
Baseline established: ${baseline?.established ? "Yes" : "No"}

Generate 3 personalized cognitive health insights for this user.`;

  const raw = await chat(system, user, 600);
  if (!raw) return null;

  try {
    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed.slice(0, 3).map((item, i) => ({
      id: i + 1,
      type: item.type || "info",
      title: item.title || "Cognitive Update",
      description: item.description || "",
      timestamp: "AI Generated",
    }));
  } catch {
    return null;
  }
}

// ─── 2. Generate smart recommendations ───────────────────────────────────────
async function generateSmartRecommendations(userData) {
  const {
    name, cognitiveMetrics, trend, declineInfo,
    peakInfo, baseline, sessionCount,
  } = userData;

  const weakMetrics = cognitiveMetrics
    .filter((m) => m.score !== null && m.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((m) => `${m.name}: ${m.score}`)
    .join(", ");

  const system = `You are CogTwin, an AI cognitive health coach. Generate personalized, science-backed recommendations 
to improve cognitive performance. Be specific and actionable. 
Respond ONLY with a JSON array of 4 recommendation objects with fields: 
title (max 5 words), description (2-3 sentences with specific advice), priority ("high"|"medium"|"low"), category ("cognitive"|"lifestyle"|"health"|"timing").`;

  const user = `User: ${name}
Weak areas: ${weakMetrics || "None identified yet"}
Trend: ${trend?.direction ?? "stable"}
Decline detected: ${declineInfo?.detected ? `Yes - ${declineInfo.severity}` : "No"}
Peak performance hour: ${peakInfo ? `${peakInfo.peakHour}:00 (avg ${peakInfo.peakAvg}/100)` : "Unknown"}
Sessions completed: ${sessionCount}
Baseline established: ${baseline?.established ? "Yes" : "No"}

Generate 4 personalized recommendations to improve this user's cognitive health.`;

  const raw = await chat(system, user, 700);
  if (!raw) return null;

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed.slice(0, 4).map((item, i) => ({
      id: i + 1,
      title: item.title || "Recommendation",
      description: item.description || "",
      priority: item.priority || "medium",
      category: item.category || "lifestyle",
    }));
  } catch {
    return null;
  }
}

// ─── 3. Explain an anomaly in plain language ──────────────────────────────────
async function explainAnomaly(testType, score, baseline, zScore, severity) {
  const system = `You are a cognitive health AI. Explain a cognitive test anomaly in plain, non-alarming language. 
Be empathetic and constructive. Keep it to 2-3 sentences. Do NOT use medical jargon.`;

  const user = `Test: ${testType}
Current score: ${score}/100
Personal baseline: ${baseline}/100
Z-score: ${zScore} (${severity} anomaly)
Direction: ${score < baseline ? "below" : "above"} baseline

Explain what this means and give one practical tip.`;

  return await chat(system, user, 200);
}

// ─── 4. Generate weekly report summary ───────────────────────────────────────
async function generateWeeklyReport(userData) {
  const {
    name, overallScore, sessionCount, cognitiveMetrics,
    trend, anomalyAlerts, baseline,
  } = userData;

  const metricsText = cognitiveMetrics
    .map((m) => `${m.name}: ${m.score ?? "N/A"}`)
    .join(", ");

  const system = `You are CogTwin, an AI cognitive health assistant. Write a brief, encouraging weekly cognitive health 
summary for the user. Be warm, professional, and actionable. Keep it to 3-4 sentences total.`;

  const user = `User: ${name}
This week's overall score: ${overallScore ?? "No data"}
Total sessions: ${sessionCount}
Metrics: ${metricsText}
Trend: ${trend?.direction ?? "stable"}
Anomalies this week: ${anomalyAlerts?.length ?? 0}
Baseline: ${baseline?.established ? "Established" : "In progress"}

Write a weekly cognitive health summary.`;

  return await chat(system, user, 300);
}

// ─── 5. Answer a cognitive health question ────────────────────────────────────
async function answerHealthQuestion(question, userContext) {
  const system = `You are CogTwin, an AI cognitive health assistant. Answer questions about brain health, 
cognitive performance, and the user's test results. Be helpful, accurate, and concise (2-4 sentences). 
Do NOT provide medical diagnoses. Always recommend consulting a doctor for medical concerns.`;

  const user = `User context: Score ${userContext.overallScore ?? "N/A"}, trend: ${userContext.trend ?? "unknown"}, sessions: ${userContext.sessionCount ?? 0}

Question: ${question}`;

  return await chat(system, user, 400);
}

// ─── 6. Generate AI Health Risk & Associations Report ──────────────────────
async function generateHealthRiskReport(userData) {
  const {
    name,
    baseline,
    currentScores,
    historicalScores,
    zScores,
    anomalySeverities,
    deviationPercentages,
    trendSlopes,
    r2,
    consecutiveDecliningSessions,
    affectedDomains,
    sessionCount,
  } = userData;

  const system = `You are CogTwin, an AI cognitive health assistant. Analyze brain health data to generate a medically cautious interpretation.
CRITICAL MEDICAL SAFETY & NON-DIAGNOSIS RULES:
1. NEVER diagnose any disease or medical condition. Never say "You have Alzheimer's", "You have dementia", "You have ADHD", "You have Parkinson's", etc.
2. Use cautious wording: "May be associated with", "Can sometimes be seen with", "Potential factors include", "This pattern alone does not indicate a diagnosis".
3. Highlight non-medical factors such as sleep deprivation, stress, mental fatigue, nutrition, and testing environment.
4. Never recommend prescription medications or stopping medications.
5. Apply the PERSISTENCE RULE: Only include items in "potentialAssociations" if there is persistent decline or repeated anomalies across multiple sessions. Do NOT create disease/health associations for a single isolated bad score.
6. Return ONLY valid JSON matching this exact structure:
{
  "overallAssessment": "string",
  "cognitiveMonitoringStatus": "Low Concern" | "Monitor" | "Attention Recommended" | "Professional Evaluation Recommended",
  "significantPatterns": ["string"],
  "potentialAssociations": [
    {
      "test": "string (e.g. Memory Recall)",
      "pattern": "string",
      "severity": "mild" | "moderate" | "severe",
      "possibleAssociations": ["string"],
      "symptoms": ["string"],
      "explanation": "string",
      "recommendedAction": "string"
    }
  ],
  "recommendations": ["string"],
  "disclaimer": "string"
}`;

  const userPrompt = `User: ${name}
Sessions completed: ${sessionCount}
Baseline established: ${baseline?.established ? "Yes" : "No"}
Baseline values: ${JSON.stringify(baseline || {})}
Current scores: ${JSON.stringify(currentScores || {})}
Historical overall scores: ${JSON.stringify(historicalScores || [])}
Z-Scores per test: ${JSON.stringify(zScores || {})}
Anomaly Severities: ${JSON.stringify(anomalySeverities || {})}
Deviation percentages from baseline: ${JSON.stringify(deviationPercentages || {})}
Trend slopes: ${JSON.stringify(trendSlopes || {})} (R²: ${r2 ?? 0})
Consecutive declining sessions: ${consecutiveDecliningSessions ?? 0}
Affected domains: ${JSON.stringify(affectedDomains || [])}

Analyze the data and generate the structured JSON health risk interpretation.`;

  const raw = await chat(system, userPrompt, 1000);
  if (!raw) return null;

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    // Validate required fields
    if (!parsed.cognitiveMonitoringStatus || !Array.isArray(parsed.potentialAssociations)) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.error("Groq health risk report parse error:", err);
    return null;
  }
}

module.exports = {
  generatePersonalizedInsights,
  generateSmartRecommendations,
  explainAnomaly,
  generateWeeklyReport,
  answerHealthQuestion,
  generateHealthRiskReport,
};

