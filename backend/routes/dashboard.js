const express = require("express");
const TestResult = require("../models/TestResult");
const Session    = require("../models/Session");
const User       = require("../models/User");
const { protect } = require("../middleware/auth");
const { analyzeHealthRisks } = require("../ml/healthRiskAnalyzer");

const router = express.Router();

// ─── Linear regression ────────────────────────────────────────────────────────
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0, intercept: values[0] || 0 };
  const sumX  = (n * (n - 1)) / 2;
  const sumY  = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((acc, y, i) => acc + i * y, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = values.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = values.reduce((acc, y, i) => acc + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope: parseFloat(slope.toFixed(3)), r2: parseFloat(r2.toFixed(3)), intercept };
}

// ─── Use Case 1 & 2: Baseline status message ─────────────────────────────────
function getBaselineStatus(baseline, sessionCount) {
  if (!baseline || sessionCount === 0) {
    return {
      status: "not_started",
      message: "Complete 3 full sessions to establish your baseline",
      sessionsNeeded: 3,
      progress: 0,
    };
  }
  if (!baseline.established) {
    const done = baseline.sessionsCompleted || 0;
    const needed = Math.max(0, 3 - done);
    return {
      status: "in_progress",
      message: needed === 1
        ? "1 more session needed to establish your baseline!"
        : `${needed} more sessions needed to establish your baseline`,
      sessionsNeeded: needed,
      progress: Math.round((done / 3) * 100),
    };
  }
  return {
    status: "established",
    message: "✅ Baseline established! Your cognitive fingerprint is active.",
    sessionsNeeded: 0,
    progress: 100,
  };
}

// ─── Use Case 2 & 3: Anomaly alerts ──────────────────────────────────────────
async function getAnomalyAlerts(userId, baseline) {
  const alerts = [];
  if (!baseline?.established) return alerts;

  const recentResults = await TestResult.find({ userId, "anomaly.detected": true })
    .sort({ createdAt: -1 })
    .limit(10);

  recentResults.forEach((r) => {
    const base = baseline[r.testType];
    if (!base) return;
    const diff = Math.abs(r.score - base).toFixed(0);
    const direction = r.score < base ? "below" : "above";
    const severityColor = r.anomaly.severity === "severe" ? "danger"
      : r.anomaly.severity === "moderate" ? "warning" : "info";

    alerts.push({
      id: r._id,
      testType: r.testType,
      score: r.score,
      baseline: base,
      zScore: r.anomaly.zScore,
      severity: r.anomaly.severity,
      severityColor,
      direction,
      message: `Your ${r.testType} score (${r.score}) is ${diff} points ${direction} your baseline (${base})`,
      recommendation: getAnomalyRecommendation(r.testType, r.anomaly.severity, direction),
      date: r.createdAt,
    });
  });

  return alerts.slice(0, 5);
}

function getAnomalyRecommendation(testType, severity, direction) {
  if (direction === "above") return `Excellent ${testType} performance! You're in peak cognitive state.`;
  const recs = {
    reaction:  "Your reaction time is slower than usual. Get adequate sleep and reduce caffeine.",
    memory:    "Memory performance is lower. Try memory exercises and ensure quality sleep.",
    pattern:   "Pattern recognition is affected. Take breaks and reduce mental fatigue.",
    attention: "Attention span is reduced. Try mindfulness meditation and limit distractions.",
    decision:  "Decision-making is impaired. Reduce stress and avoid major decisions when fatigued.",
  };
  const base = recs[testType] || "Consider rest and stress reduction.";
  if (severity === "severe") return base + " Consider consulting a healthcare professional.";
  return base;
}

// ─── Use Case 3: Decline detection ───────────────────────────────────────────
function detectDecline(sessions) {
  if (sessions.length < 4) return null;
  const recent = sessions.slice(0, 8).map((s) => s.overallScore).filter(Boolean).reverse();
  if (recent.length < 4) return null;
  const reg = linearRegression(recent);
  if (reg.slope < -1.5 && reg.r2 > 0.4) {
    return {
      detected: true,
      slope: reg.slope,
      confidence: reg.r2,
      weeksOfDecline: Math.min(recent.length, 8),
      recommendation: reg.slope < -3
        ? "Consistent significant decline detected. Please consult a healthcare professional."
        : "Gradual decline detected. Review sleep, stress, and lifestyle factors.",
      severity: reg.slope < -3 ? "severe" : "moderate",
    };
  }
  return null;
}

// ─── Use Case 4: Peak performance time analysis ───────────────────────────────
async function getPeakPerformanceInsight(userId) {
  const results = await TestResult.find({ userId }).sort({ createdAt: -1 }).limit(50);
  if (results.length < 10) return null;

  const byHour = {};
  results.forEach((r) => {
    const h = new Date(r.createdAt).getHours();
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(r.score);
  });

  const hourAvgs = Object.entries(byHour)
    .map(([h, scores]) => ({
      hour: parseInt(h),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }))
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.avg - a.avg);

  if (hourAvgs.length < 2) return null;

  const peak = hourAvgs[0];
  const low  = hourAvgs[hourAvgs.length - 1];
  const diff = Math.round(peak.avg - low.avg);

  const fmt = (h) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h % 12 || 12;
    return `${h12} ${ampm}`;
  };

  return {
    peakHour: peak.hour,
    peakAvg: Math.round(peak.avg),
    lowHour: low.hour,
    lowAvg: Math.round(low.avg),
    improvement: diff,
    insight: diff >= 5
      ? `You're ${diff}% sharper at ${fmt(peak.hour)} than at ${fmt(low.hour)}. Schedule important cognitive tasks in the morning!`
      : `Your performance is fairly consistent throughout the day.`,
  };
}

// ─── AI Insights generator ────────────────────────────────────────────────────
function generateDashboardInsights(sessions, baseline, declineInfo, peakInfo) {
  const insights = [];

  if (sessions.length === 0) {
    return [{
      id: 1, type: "info",
      title: "Welcome to CogTwin!",
      description: "Complete your first cognitive assessment to start building your Digital Twin profile.",
      timestamp: "Just now",
    }];
  }

  const latest = sessions[0];
  const prev   = sessions[1];

  // Score change
  if (prev?.overallScore && latest?.overallScore) {
    const diff = latest.overallScore - prev.overallScore;
    if (diff >= 5) {
      insights.push({ id: insights.length + 1, type: "positive",
        title: "Cognitive Score Improving 📈",
        description: `Your overall score improved by ${diff.toFixed(0)} points since your last session. Keep up the great work!`,
        timestamp: "Latest session" });
    } else if (diff <= -5) {
      insights.push({ id: insights.length + 1, type: "warning",
        title: "Score Decline Detected ⚠️",
        description: `Your score dropped by ${Math.abs(diff).toFixed(0)} points. Get more sleep, reduce stress, and stay hydrated.`,
        timestamp: "Latest session" });
    }
  }

  // Baseline comparison (Use Case 2)
  if (baseline?.established && latest?.overallScore) {
    const diff = latest.overallScore - baseline.overall;
    if (diff >= 8) {
      insights.push({ id: insights.length + 1, type: "positive",
        title: "Above Baseline Performance 🌟",
        description: `You're performing ${diff.toFixed(0)} points above your personal baseline. Your brain is in excellent shape!`,
        timestamp: "vs. baseline" });
    } else if (diff <= -8) {
      insights.push({ id: insights.length + 1, type: "warning",
        title: "Below Baseline Alert 🔔",
        description: `Performance is ${Math.abs(diff).toFixed(0)} points below your baseline. This may indicate fatigue or stress. Consider rest.`,
        timestamp: "vs. baseline" });
    }
  }

  // Decline detection (Use Case 3)
  if (declineInfo?.detected) {
    insights.push({ id: insights.length + 1, type: "warning",
      title: declineInfo.severity === "severe" ? "⚠️ Significant Decline Detected" : "📉 Gradual Decline Trend",
      description: declineInfo.recommendation,
      timestamp: `${declineInfo.weeksOfDecline} sessions analyzed` });
  }

  // Peak performance (Use Case 4)
  if (peakInfo?.improvement >= 5) {
    insights.push({ id: insights.length + 1, type: "positive",
      title: "⏰ Peak Performance Window Found",
      description: peakInfo.insight,
      timestamp: "Time analysis" });
  }

  // Baseline milestone
  if (sessions.length === 3 && baseline?.established) {
    insights.push({ id: insights.length + 1, type: "info",
      title: "🎯 Baseline Established!",
      description: "Your Digital Twin has learned your cognitive fingerprint. Future sessions will be compared against your personal baseline.",
      timestamp: "Milestone" });
  }

  if (insights.length === 0) {
    insights.push({ id: 1, type: "info",
      title: "Digital Twin Updated",
      description: `Your cognitive model has been updated with ${sessions.length} sessions of data. Keep testing weekly for best results.`,
      timestamp: "Latest session" });
  }

  return insights.slice(0, 4);
}

// ─── Recommendations generator ────────────────────────────────────────────────
function generateRecommendations(metrics, baseline, declineInfo, peakInfo) {
  const recs = [];

  // Weakest metric
  const weak = metrics
    .filter((m) => m.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  if (weak.length > 0 && weak[0].score < 80) {
    const exercises = {
      "Memory":            "Practice the N-back memory task for 10 minutes daily to strengthen short-term memory pathways.",
      "Reaction Time":     "Play reaction-based games or try the Stroop test daily to sharpen neural response speed.",
      "Pattern":           "Solve Sudoku or pattern puzzles for 15 minutes daily to improve logical reasoning.",
      "Attention":         "Try 10-minute mindfulness meditation sessions to improve sustained focus and reduce mind-wandering.",
      "Decision Making":   "Practice chess or strategic games to improve decision-making speed and accuracy under pressure.",
    };
    const key = Object.keys(exercises).find((k) => weak[0].name.includes(k)) || weak[0].name;
    recs.push({
      id: 1, priority: "high", category: "cognitive",
      title: `Improve ${weak[0].name}`,
      description: exercises[key] || `Practice ${weak[0].name.toLowerCase()} exercises daily for 10-15 minutes.`,
    });
  }

  // Decline-specific (Use Case 3)
  if (declineInfo?.detected) {
    recs.push({
      id: recs.length + 1, priority: "high", category: "health",
      title: declineInfo.severity === "severe" ? "Consult Healthcare Professional" : "Address Cognitive Decline",
      description: declineInfo.severity === "severe"
        ? "Your cognitive scores show a consistent decline over multiple weeks. Please consult a healthcare professional and share your CogTwin report."
        : "Consistent decline detected. Review sleep quality, stress levels, and consider lifestyle changes.",
    });
  }

  // Peak hours (Use Case 4)
  if (peakInfo) {
    const fmt = (h) => { const ampm = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12} ${ampm}`; };
    recs.push({
      id: recs.length + 1, priority: "medium", category: "timing",
      title: `Schedule Tests at ${fmt(peakInfo.peakHour)}`,
      description: `Your cognitive performance peaks at ${fmt(peakInfo.peakHour)} (avg: ${peakInfo.peakAvg}/100). Schedule important tasks and assessments during this window.`,
    });
  }

  recs.push({
    id: recs.length + 1, priority: "high", category: "lifestyle",
    title: "Optimize Sleep Schedule",
    description: "Aim for 7-8 hours of quality sleep. Sleep consolidates memory and restores cognitive function. Consistent sleep times improve baseline performance by up to 20%.",
  });

  recs.push({
    id: recs.length + 1, priority: "medium", category: "lifestyle",
    title: "Aerobic Exercise 3x/Week",
    description: "30 minutes of aerobic exercise increases BDNF (brain-derived neurotrophic factor), improving memory and attention span by up to 20%.",
  });

  recs.push({
    id: recs.length + 1, priority: "medium", category: "wellness",
    title: "Weekly Assessment Reminder",
    description: "Take your cognitive assessment every 7 days. Consistent weekly testing enables accurate trend detection and early warning of cognitive changes.",
  });

  return recs.slice(0, 5);
}

// ─── GET /api/dashboard ───────────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const user   = await User.findById(userId);

    const allSessions = await Session.find({ userId, isComplete: true })
      .sort({ createdAt: -1 }).limit(50);

    const latestSession = allSessions[0] || null;
    const overallScore  = latestSession?.overallScore ?? null;

    // Cognitive metrics
    const testTypes = ["memory", "reaction", "pattern", "attention", "decision"];
    const cognitiveMetrics = await Promise.all(
      testTypes.map(async (type) => {
        const [latest, prev] = await Promise.all([
          TestResult.findOne({ userId, testType: type }).sort({ createdAt: -1 }),
          TestResult.findOne({ userId, testType: type }).sort({ createdAt: -1 }).skip(1),
        ]);
        const score     = latest?.score ?? null;
        const prevScore = prev?.score ?? null;
        const change    = score !== null && prevScore !== null ? score - prevScore : 0;
        const status    = change >= 3 ? "improving" : change <= -3 ? "declining" : "stable";
        return {
          name: type === "reaction" ? "Reaction Time" : type.charAt(0).toUpperCase() + type.slice(1),
          score, change: parseFloat(change.toFixed(1)), status,
          baseline: user.baseline?.[type] ?? null,
        };
      })
    );

    // Weekly history
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekSessions = await Session.find({ userId, isComplete: true, createdAt: { $gte: sevenDaysAgo } })
      .sort({ createdAt: 1 });
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const scoreHistory = weekSessions.map((s) => ({
      date: days[new Date(s.createdAt).getDay()],
      score: s.overallScore,
      memory: s.scores.memory, reaction: s.scores.reaction,
      pattern: s.scores.pattern, attention: s.scores.attention, decision: s.scores.decision,
    }));

    // Monthly trends
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const monthlySessions = await Session.find({ userId, isComplete: true, createdAt: { $gte: sixMonthsAgo } })
      .sort({ createdAt: 1 });
    const monthMap = {};
    monthlySessions.forEach((s) => {
      const key = new Date(s.createdAt).toLocaleString("default", { month: "short" });
      if (!monthMap[key]) monthMap[key] = [];
      monthMap[key].push(s.overallScore);
    });
    const monthlyTrends = Object.entries(monthMap).map(([month, scores]) => ({
      month, score: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    }));

    // Trend
    const trendScores = allSessions.map((s) => s.overallScore).filter(Boolean).reverse();
    const trend = linearRegression(trendScores);

    // Use Case 3: decline detection
    const declineInfo = detectDecline(allSessions);

    // Use Case 4: peak performance
    const peakInfo = await getPeakPerformanceInsight(userId);

    // Anomaly alerts (Use Case 2)
    const anomalyAlerts = await getAnomalyAlerts(userId, user.baseline);

    // Baseline status (Use Case 1)
    const baselineStatus = getBaselineStatus(user.baseline, allSessions.length);

    // AI insights
    const aiInsights = generateDashboardInsights(allSessions, user.baseline, declineInfo, peakInfo);

    // Recommendations
    const recommendations = generateRecommendations(cognitiveMetrics, user.baseline, declineInfo, peakInfo);

    // Health Risk Analysis for Dashboard Cognitive Health Insight card
    const allTestResults = await TestResult.find({ userId }).sort({ createdAt: -1 }).limit(50);
    const healthRiskAnalysis = analyzeHealthRisks({
      sessions: allSessions,
      testResults: allTestResults,
      baseline: user.baseline,
    });

    let cognitiveHealthInsight = null;
    if (healthRiskAnalysis.potentialAssociations.length > 0) {
      const topPattern = healthRiskAnalysis.potentialAssociations[0];
      cognitiveHealthInsight = {
        title: "Cognitive Health Insight",
        description: `Your recent ${topPattern.test.toLowerCase()} performance shows a persistent pattern compared with your personal baseline over recent sessions.`,
        hasAssociations: true,
        status: healthRiskAnalysis.cognitiveMonitoringStatus,
      };
    } else if (declineInfo?.detected) {
      cognitiveHealthInsight = {
        title: "Cognitive Health Insight",
        description: `Your cognitive scores show a persistent decline over the last ${declineInfo.weeksOfDecline} sessions.`,
        hasAssociations: true,
        status: declineInfo.severity === "severe" ? "Attention Recommended" : "Monitor",
      };
    } else if (healthRiskAnalysis.transientNotice) {
      cognitiveHealthInsight = {
        title: "Cognitive Health Insight",
        description: healthRiskAnalysis.transientNotice,
        hasAssociations: false,
        status: "Monitor",
      };
    }

    // Weekly reminder check
    const lastSession = allSessions[0];
    const daysSinceLastTest = lastSession
      ? Math.floor((Date.now() - new Date(lastSession.createdAt)) / (1000 * 60 * 60 * 24))
      : null;
    const weeklyReminderDue = daysSinceLastTest === null || daysSinceLastTest >= 7;

    // Stats
    const totalTests = await TestResult.countDocuments({ userId });
    const avgScore = allSessions.length > 0
      ? parseFloat((allSessions.reduce((a, s) => a + (s.overallScore || 0), 0) / allSessions.length).toFixed(1))
      : null;

    res.json({
      overallScore,
      cognitiveMetrics,
      scoreHistory,
      monthlyTrends,
      trend: {
        direction: trend.slope > 0.5 ? "improving" : trend.slope < -0.5 ? "declining" : "stable",
        slope: trend.slope,
        confidence: trend.r2,
      },
      aiInsights,
      recommendations,
      anomalyAlerts,
      baselineStatus,
      declineInfo,
      peakInfo,
      cognitiveHealthInsight,
      weeklyReminderDue,
      daysSinceLastTest,
      baseline: user.baseline,
      stats: {
        totalTests,
        totalSessions: allSessions.length,
        avgScore,
        streak: user.streak?.current || 0,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

