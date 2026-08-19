const express = require("express");
const User = require("../models/User");
const TestResult = require("../models/TestResult");
const Session = require("../models/Session");
const { protect } = require("../middleware/auth");
const { analyzeHealthRisks } = require("../ml/healthRiskAnalyzer");
const { generateHealthRiskReport } = require("../ml/groqAI");

const router = express.Router();

// GET /api/profile  — get full profile with stats
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    const totalTests = await TestResult.countDocuments({ userId });
    const sessions = await Session.find({ userId, isComplete: true });
    const avgScore =
      sessions.length > 0
        ? parseFloat(
            (sessions.reduce((a, s) => a + (s.overallScore || 0), 0) / sessions.length).toFixed(1)
          )
        : null;

    res.json({
      user: user.toSafeObject(),
      stats: {
        totalTests,
        totalSessions: sessions.length,
        avgScore,
        streak: user.streak?.current || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/profile  — update profile
router.patch("/", protect, async (req, res) => {
  try {
    const { name, age } = req.body;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (age) updates.age = age;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile/reports  — get test history and AI health report for reports page
router.get("/reports", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    // Recent individual test results
    const testResults = await TestResult.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const formattedResults = testResults.map((r) => ({
      id: r._id,
      date: new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      test: capitalize(r.testType === "reaction" ? "Reaction Time" : r.testType),
      score: r.score,
      duration: r.durationSeconds ? `${r.durationSeconds}s` : "—",
      anomaly: r.anomaly,
    }));

    // Monthly trends
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const sessions = await Session.find({
      userId,
      isComplete: true,
      createdAt: { $gte: sixMonthsAgo },
    }).sort({ createdAt: 1 });

    const monthMap = {};
    sessions.forEach((s) => {
      const key = new Date(s.createdAt).toLocaleString("default", { month: "short" });
      if (!monthMap[key]) monthMap[key] = [];
      monthMap[key].push(s.overallScore);
    });

    const monthlyTrends = Object.entries(monthMap).map(([month, scores]) => ({
      month,
      score: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    }));

    // Build Health Risk Interpretation & Potential Associations Report
    const allSessions = await Session.find({ userId, isComplete: true }).sort({ createdAt: -1 });
    const fallbackHealthReport = analyzeHealthRisks({
      sessions: allSessions,
      testResults,
      baseline: user.baseline,
    });

    let healthReport = null;

    // Build context for Groq AI
    const types = ["memory", "reaction", "pattern", "attention", "decision"];
    const currentScores = {};
    const zScores = {};
    const anomalySeverities = {};
    const deviationPercentages = {};
    const affectedDomains = [];

    types.forEach((type) => {
      const latestResult = testResults.find((r) => r.testType === type);
      if (latestResult) {
        currentScores[type] = latestResult.score;
        zScores[type] = latestResult.anomaly?.zScore ?? null;
        anomalySeverities[type] = latestResult.anomaly?.severity ?? "none";
        deviationPercentages[type] = latestResult.deviationFromBaseline ?? null;
        if (latestResult.score < 75 || (latestResult.anomaly && latestResult.anomaly.detected)) {
          affectedDomains.push(type);
        }
      }
    });

    const historicalScores = allSessions.map((s) => s.overallScore).filter(Boolean);

    try {
      healthReport = await generateHealthRiskReport({
        name: user.name,
        baseline: user.baseline,
        currentScores,
        historicalScores,
        zScores,
        anomalySeverities,
        deviationPercentages,
        trendSlopes: {},
        r2: 0,
        consecutiveDecliningSessions: 0,
        affectedDomains,
        sessionCount: allSessions.length,
      });
    } catch (e) {
      console.error("Failed to generate AI health risk report:", e.message);
    }

    if (!healthReport) {
      healthReport = fallbackHealthReport;
    } else {
      // Ensure fallback disclaimer & transient notice are included if needed
      if (!healthReport.disclaimer) {
        healthReport.disclaimer = fallbackHealthReport.disclaimer;
      }
      if (fallbackHealthReport.transientNotice && (!healthReport.potentialAssociations || healthReport.potentialAssociations.length === 0)) {
        healthReport.transientNotice = fallbackHealthReport.transientNotice;
      }
    }

    res.json({
      testResults: formattedResults,
      monthlyTrends,
      healthReport,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function capitalize(str) {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

module.exports = router;

