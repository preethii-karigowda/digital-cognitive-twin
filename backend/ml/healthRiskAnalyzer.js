/**
 * CogTwin Health Risk Analyzer
 * 
 * Medically Cautious Rules-Based & Fallback Analyzer for Potential Health Associations
 * 
 * Responsibilities:
 *  1. Analyze persistent cognitive patterns over session history & test results.
 *  2. Enforce the Persistence Rule: single bad test results yield a transient variation notice.
 *  3. Map persistent patterns to cautious potential associations & symptoms.
 *  4. Calculate Cognitive Monitoring Status (Low Concern, Monitor, Attention Recommended, Professional Evaluation Recommended).
 *  5. Enforce medical safety disclaimers (NEVER diagnose diseases).
 */

const MEDICAL_DISCLAIMER =
  "IMPORTANT: CogTwin is a cognitive monitoring and educational system, not a diagnostic medical device. " +
  "The observations and potential health associations in this report are AI-generated and should not be interpreted as a medical diagnosis. " +
  "Cognitive performance can be influenced by sleep, stress, fatigue, medications, illness, nutrition, testing environment, and many other factors. " +
  "Persistent or concerning changes should be discussed with a qualified healthcare professional.";

// Medically cautious domain mapping dictionary
const DOMAIN_ASSOCIATIONS = {
  memory: {
    testName: "Memory Recall",
    associations: [
      "Sleep-related cognitive impairment",
      "Chronic stress/anxiety-related concentration problems",
      "Vitamin/nutritional deficiencies",
      "Mild cognitive impairment",
      "Other neurological or cognitive conditions",
    ],
    symptoms: [
      "Forgetfulness",
      "Difficulty concentrating",
      "Difficulty learning or recalling new information",
      "Mental fatigue",
      "Reduced attention",
      "Difficulty completing familiar tasks",
    ],
    explanation:
      "Memory recall performance can fluctuate due to sleep disruption, elevated stress, or nutritional factors. " +
      "Persistent scores below baseline across multiple sessions warrant monitoring.",
    recommendedAction:
      "Monitor the trend and consider discussing persistent changes with a qualified healthcare professional.",
  },
  reaction: {
    testName: "Reaction Time",
    associations: [
      "Fatigue and sleep deprivation",
      "Stress or mental exhaustion",
      "Medication effects",
      "Reduced attention or alertness",
      "Neurological or cognitive conditions",
    ],
    symptoms: [
      "Slower responses to stimuli",
      "Difficulty concentrating",
      "Mental fatigue",
      "Reduced alertness",
    ],
    explanation:
      "Reaction speed is sensitive to sleep quality, stress levels, physical fatigue, and certain medications. " +
      "Persistent delays over time may reflect sustained neurocognitive fatigue.",
    recommendedAction:
      "Evaluate recent sleep patterns and stress levels. Consider consulting a healthcare professional if persistent.",
  },
  attention: {
    testName: "Attention Span",
    associations: [
      "Sleep deprivation",
      "High stress or anxiety",
      "Mental fatigue or burnout",
      "Attention-related difficulties",
    ],
    symptoms: [
      "Distractibility",
      "Difficulty sustaining focus on tasks",
      "Losing track of complex tasks",
      "Increased minor mistakes",
    ],
    explanation:
      "Sustained attention relies heavily on restful sleep and manageable stress levels. " +
      "Fluctuations are common, but persistent decline may indicate underlying burnout or fatigue.",
    recommendedAction:
      "Incorporate focus-restoration techniques and discuss persistent changes with a healthcare professional.",
  },
  decision: {
    testName: "Decision Making",
    associations: [
      "Cognitive fatigue or overload",
      "High stress and anxiety",
      "Reduced attention span",
      "Cognitive impairment",
    ],
    symptoms: [
      "Difficulty making decisions or processing complex choices",
      "Slower reasoning speed",
      "Increased error rate under pressure",
      "Difficulty handling complex tasks",
    ],
    explanation:
      "Decision-making efficiency can be compromised by decision fatigue, emotional stress, or lack of sleep. " +
      "Persistent decline over consecutive sessions suggests a need for rest and evaluation.",
    recommendedAction:
      "Reduce cognitive load, prioritize recovery, and seek professional guidance if patterns continue.",
  },
  pattern: {
    testName: "Pattern Recognition",
    associations: [
      "Reduced concentration",
      "Mental fatigue or sleep disruption",
      "Cognitive processing speed changes",
      "Neurological or cognitive conditions",
    ],
    symptoms: [
      "Difficulty identifying visual patterns or structural relationships",
      "Slower problem-solving speed",
      "Difficulty understanding relationships between information",
      "Mental fatigue during complex tasks",
    ],
    explanation:
      "Pattern recognition evaluates non-verbal reasoning and visual processing. " +
      "Lower performance across multiple sessions can stem from sustained fatigue, stress, or visual-cognitive strain.",
    recommendedAction:
      "Ensure adequate rest, limit screen fatigue, and consult a healthcare provider if persistent.",
  },
};

/**
 * Main analyzer function: inspects sessions & test results to generate health risk report data.
 * 
 * @param {Object} params
 * @param {Array} params.sessions - List of completed sessions sorted by date desc
 * @param {Array} params.testResults - List of test results sorted by date desc
 * @param {Object} params.baseline - User's baseline object
 * @returns {Object} Structured health risk report object
 */
function analyzeHealthRisks({ sessions = [], testResults = [], baseline = null }) {
  const types = ["memory", "reaction", "pattern", "attention", "decision"];
  const completedSessions = sessions.filter((s) => s.isComplete);
  const sessionCount = completedSessions.length;

  // Track findings per domain
  const potentialAssociations = [];
  let isTransientOnly = false;
  let singleBadTestCount = 0;

  // Helper to map severity string from zScore or anomaly
  function getSeverity(zScore, deviation) {
    const absZ = Math.abs(zScore || 0);
    if (absZ > 2.5 || deviation < -25) return "severe";
    if (absZ > 2.0 || deviation < -15) return "moderate";
    if (absZ > 1.5 || deviation < -10) return "mild";
    return "none";
  }

  // 1. Analyze each test domain across history for persistence
  types.forEach((type) => {
    // Get test results for this type sorted by date desc
    const typeResults = testResults.filter((r) => r.testType === type);
    const domainMeta = DOMAIN_ASSOCIATIONS[type];
    const base = baseline?.[type] ?? null;

    if (typeResults.length === 0) return;

    // Latest result
    const latestResult = typeResults[0];
    const latestScore = latestResult.score;
    const latestAnomaly = latestResult.anomaly || {};

    // Check if current score is significantly below baseline or low (<70)
    const isAbnormal =
      (base !== null && (base - latestScore >= 10 || latestAnomaly.zScore < -1.5)) ||
      latestScore < 70;

    if (!isAbnormal) return;

    // Check persistence across prior sessions / results
    const priorAbnormalResults = typeResults.slice(1, 5).filter((r) => {
      const pBase = base ?? 75;
      return (pBase - r.score >= 8 || (r.anomaly && r.anomaly.zScore < -1.2)) || r.score < 72;
    });

    const isPersistent = priorAbnormalResults.length >= 1 || sessionCount >= 3 && typeResults.length >= 3 &&
      typeResults.slice(0, 3).every(r => (base ? base - r.score >= 6 : r.score < 75));

    if (isPersistent) {
      const zVal = latestAnomaly.zScore ?? (base ? (latestScore - base) / 10 : 0);
      const devVal = base ? latestScore - base : 0;
      const severity = getSeverity(zVal, devVal);

      potentialAssociations.push({
        test: domainMeta.testName,
        pattern: base
          ? `Persistent score (${latestScore}) below personal baseline (${base}) across multiple sessions.`
          : `Persistent lower scores (latest: ${latestScore}) observed across multiple sessions.`,
        severity,
        possibleAssociations: domainMeta.associations,
        symptoms: domainMeta.symptoms,
        explanation: domainMeta.explanation,
        recommendedAction: domainMeta.recommendedAction,
      });
    } else {
      singleBadTestCount++;
    }
  });

  // 2. Determine Cognitive Monitoring Status
  let cognitiveMonitoringStatus = "Low Concern";
  let overallAssessment = "Your cognitive performance is stable and within normal baseline expectations.";

  const hasSevere = potentialAssociations.some((a) => a.severity === "severe");
  const hasModerate = potentialAssociations.some((a) => a.severity === "moderate");

  if (hasSevere || potentialAssociations.length >= 3) {
    cognitiveMonitoringStatus = "Professional Evaluation Recommended";
    overallAssessment =
      "Persistent severe or multi-domain cognitive score declines detected across recent sessions. " +
      "It is recommended to share these results with a qualified healthcare professional.";
  } else if (hasModerate || potentialAssociations.length >= 2) {
    cognitiveMonitoringStatus = "Attention Recommended";
    overallAssessment =
      "Persistent moderate score deviations detected across multiple cognitive domains. " +
      "Monitoring and lifestyle adjustments (sleep, stress management) are recommended.";
  } else if (potentialAssociations.length === 1 || singleBadTestCount > 0) {
    cognitiveMonitoringStatus = "Monitor";
    overallAssessment =
      "Mild or localized score variations detected. Continued routine tracking is recommended.";
  } else {
    cognitiveMonitoringStatus = "Low Concern";
    overallAssessment =
      "Your cognitive test scores remain consistent with your personal baseline.";
  }

  // 3. Handle Single Bad Test Notice (Persistence Rule)
  let transientNotice = null;
  if (potentialAssociations.length === 0 && singleBadTestCount > 0) {
    transientNotice =
      "Temporary variation detected. Factors such as sleep, stress, fatigue, or testing conditions may influence today's result. " +
      "No persistent abnormal patterns were identified.";
  }

  // 4. Return structured health report object
  return {
    overallAssessment,
    cognitiveMonitoringStatus,
    significantPatterns: potentialAssociations.map((a) => `${a.test}: ${a.pattern}`),
    potentialAssociations,
    transientNotice,
    recommendations: generateBasicRecommendations(potentialAssociations, cognitiveMonitoringStatus),
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

function generateBasicRecommendations(associations, status) {
  const recs = [];
  if (status === "Professional Evaluation Recommended") {
    recs.push("Consider scheduling an appointment with a healthcare professional to review persistent changes.");
  }
  if (associations.some((a) => a.test.includes("Memory"))) {
    recs.push("Practice 10 minutes of daily memory consolidation exercises and ensure 7-8 hours of sleep.");
  }
  if (associations.some((a) => a.test.includes("Reaction") || a.test.includes("Attention"))) {
    recs.push("Optimize your testing window to peak morning hours and reduce fatigue before assessments.");
  }
  recs.push("Maintain a consistent weekly testing schedule to track long-term baseline stability.");
  return recs;
}

module.exports = {
  analyzeHealthRisks,
  MEDICAL_DISCLAIMER,
};
