import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, Download, Calendar, Loader2, AlertTriangle, ShieldAlert,
  CheckCircle, Info, Stethoscope, Activity, ArrowRight, Lightbulb
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  profileApi,
  type FormattedTestResult,
  type MonthlyTrend,
  type HealthReportData,
  type CognitiveMonitoringStatusType,
} from "@/lib/api";
import { testResults as mockResults, monthlyTrends as mockMonthly } from "@/data/mockData";
import jsPDF from "jspdf";

const defaultDisclaimer =
  "IMPORTANT: CogTwin is a cognitive monitoring and educational system, not a diagnostic medical device. " +
  "The observations and potential health associations in this report are AI-generated and should not be interpreted as a medical diagnosis. " +
  "Cognitive performance can be influenced by sleep, stress, fatigue, medications, illness, nutrition, testing environment, and many other factors. " +
  "Persistent or concerning changes should be discussed with a qualified healthcare professional.";

const defaultMockHealthReport: HealthReportData = {
  overallAssessment:
    "Persistent cognitive patterns suggest monitoring is recommended. Scores in memory recall have shown a deviation from baseline across recent sessions.",
  cognitiveMonitoringStatus: "Monitor",
  significantPatterns: [
    "Memory Recall: Scores have remained below personal baseline over multiple sessions.",
  ],
  potentialAssociations: [
    {
      test: "Memory Recall",
      pattern: "Memory scores have remained significantly below your personal baseline across multiple sessions.",
      severity: "moderate",
      possibleAssociations: [
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
        "Memory performance can fluctuate due to multiple factors including sleep disruption, elevated stress, or nutritional factors. Persistent changes across multiple assessments warrant monitoring.",
      recommendedAction:
        "Monitor the trend and consider discussing persistent changes with a qualified healthcare professional.",
    },
  ],
  recommendations: [
    "Maintain a regular sleep schedule of 7-8 hours per night.",
    "Practice memory recall exercises daily for 10-15 minutes.",
    "Schedule cognitive assessments during peak morning hours.",
    "Discuss persistent cognitive changes with a healthcare professional.",
  ],
  disclaimer: defaultDisclaimer,
};

const StatusBadge = ({ status }: { status: CognitiveMonitoringStatusType }) => {
  const map: Record<CognitiveMonitoringStatusType, { color: string; icon: typeof CheckCircle }> = {
    "Low Concern": { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
    "Monitor": { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Info },
    "Attention Recommended": { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
    "Professional Evaluation Recommended": { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: ShieldAlert },
  };

  const config = map[status] || map["Low Concern"];
  const IconComponent = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${config.color}`}>
      <IconComponent className="w-3.5 h-3.5" />
      {status}
    </span>
  );
};

const SeverityBadge = ({ severity }: { severity: "mild" | "moderate" | "severe" }) => {
  const map = {
    mild: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    severe: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${map[severity] || map.mild}`}>
      {severity} severity
    </span>
  );
};

const ReportsPage = () => {
  const [testResults, setTestResults] = useState<FormattedTestResult[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [healthReport, setHealthReport] = useState<HealthReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    profileApi
      .reports()
      .then(({ testResults: tr, monthlyTrends: mt, healthReport: hr }) => {
        setTestResults(tr.length ? tr : []);
        setMonthlyTrends(mt.length ? mt : []);
        setHealthReport(hr || null);
      })
      .catch(() => {
        setTestResults([]);
        setMonthlyTrends([]);
        setHealthReport(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const displayResults = testResults.length ? testResults : mockResults;
  const displayMonthly = monthlyTrends.length ? monthlyTrends : mockMonthly;
  const activeHealthReport = healthReport || defaultMockHealthReport;

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const checkPageBreak = (needed = 25) => {
      if (y + needed > 270) {
        doc.addPage();
        y = 20;
      }
    };

    // ── Title & Header ──
    doc.setFontSize(18);
    doc.setTextColor(108, 59, 255);
    doc.text("CogTwin — Cognitive Health Report", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Generated Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y);
    y += 12;

    // Line separator
    doc.setDrawColor(220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // ── SECTION 1: Cognitive Monitoring Status ──
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("1. COGNITIVE MONITORING STATUS", margin, y);
    y += 8;

    doc.setFontSize(11);
    doc.setTextColor(108, 59, 255);
    doc.text(`Status: ${activeHealthReport.cognitiveMonitoringStatus}`, margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(60);
    const assessmentLines = doc.splitTextToSize(
      activeHealthReport.overallAssessment || "Cognitive performance is being tracked against personal baseline.",
      contentWidth
    );
    doc.text(assessmentLines, margin, y);
    y += assessmentLines.length * 6 + 8;

    // ── SECTION 2: Potential Health Associations ──
    checkPageBreak(30);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("2. POTENTIAL HEALTH ASSOCIATIONS", margin, y);
    y += 8;

    if (activeHealthReport.potentialAssociations && activeHealthReport.potentialAssociations.length > 0) {
      activeHealthReport.potentialAssociations.forEach((assoc, idx) => {
        checkPageBreak(50);

        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text(`${idx + 1}. ${assoc.test} — ${assoc.severity.toUpperCase()} SEVERITY`, margin, y);
        y += 6;

        doc.setFontSize(9.5);
        doc.setTextColor(80);
        
        const patternText = doc.splitTextToSize(`Observed Pattern: ${assoc.pattern}`, contentWidth - 5);
        doc.text(patternText, margin + 5, y);
        y += patternText.length * 5 + 3;

        const assocText = doc.splitTextToSize(`Potential Associations: ${assoc.possibleAssociations.join(", ")}`, contentWidth - 5);
        doc.text(assocText, margin + 5, y);
        y += assocText.length * 5 + 3;

        const symptomsText = doc.splitTextToSize(`Common Symptoms: ${assoc.symptoms.join(", ")}`, contentWidth - 5);
        doc.text(symptomsText, margin + 5, y);
        y += symptomsText.length * 5 + 3;

        const explanationText = doc.splitTextToSize(`Explanation: ${assoc.explanation}`, contentWidth - 5);
        doc.text(explanationText, margin + 5, y);
        y += explanationText.length * 5 + 3;

        const actionText = doc.splitTextToSize(`Recommended Action: ${assoc.recommendedAction}`, contentWidth - 5);
        doc.setTextColor(108, 59, 255);
        doc.text(actionText, margin + 5, y);
        y += actionText.length * 5 + 8;
      });
    } else if (activeHealthReport.transientNotice) {
      doc.setFontSize(10);
      doc.setTextColor(80);
      const noticeLines = doc.splitTextToSize(activeHealthReport.transientNotice, contentWidth);
      doc.text(noticeLines, margin, y);
      y += noticeLines.length * 5 + 8;
    } else {
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text("No persistent abnormal patterns detected. Results remain within personal baseline limits.", margin, y);
      y += 10;
    }

    // ── SECTION 3: Recent Test Results ──
    checkPageBreak(40);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("3. RECENT TEST HISTORY", margin, y);
    y += 8;

    doc.setFontSize(9.5);
    doc.setTextColor(100);
    doc.text("Date                     Test Type                   Score          Duration", margin, y);
    y += 5;
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(50);
    displayResults.slice(0, 10).forEach((r) => {
      checkPageBreak(8);
      const dateStr = (r.date || "").padEnd(20);
      const testStr = (r.test || "").padEnd(25);
      const scoreStr = String(r.score).padEnd(14);
      const durStr = r.duration || "—";
      doc.text(`${dateStr}${testStr}${scoreStr}${durStr}`, margin, y);
      y += 6;
    });

    y += 8;

    // ── SECTION 4: AI Recommendations ──
    checkPageBreak(30);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("4. AI RECOMMENDATIONS", margin, y);
    y += 8;

    doc.setFontSize(9.5);
    doc.setTextColor(60);
    const recs = activeHealthReport.recommendations || [
      "Maintain a regular sleep schedule of 7-8 hours per night.",
      "Schedule cognitive assessments during peak morning hours.",
      "Practice memory exercises daily.",
    ];
    recs.forEach((r) => {
      checkPageBreak(10);
      const rLines = doc.splitTextToSize(`•  ${r}`, contentWidth - 5);
      doc.text(rLines, margin + 5, y);
      y += rLines.length * 5 + 2;
    });

    y += 10;

    // ── SECTION 5: Medical Disclaimer Box ──
    checkPageBreak(45);
    doc.setDrawColor(230, 180, 50);
    doc.setFillColor(255, 252, 235);
    doc.roundedRect(margin, y, contentWidth, 35, 3, 3, "FD");

    doc.setFontSize(9);
    doc.setTextColor(150, 90, 0);
    doc.text("MEDICAL DISCLAIMER", margin + 5, y + 7);

    doc.setFontSize(8);
    doc.setTextColor(80, 60, 20);
    const disclaimerLines = doc.splitTextToSize(activeHealthReport.disclaimer || defaultDisclaimer, contentWidth - 10);
    doc.text(disclaimerLines, margin + 5, y + 14);

    doc.save("CogTwin_Cognitive_Health_Report.pdf");
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2.5">
              <Stethoscope className="w-7 h-7 text-primary" /> Reports & Health Insights
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Comprehensive cognitive trends, baseline analysis, and AI health risk interpretations
            </p>
          </div>
          <button onClick={generatePDF} className="gradient-btn inline-flex items-center gap-2 text-sm shrink-0">
            <Download className="w-4 h-4" /> Export PDF Report
          </button>
        </div>

        {/* ── Cognitive Monitoring Status Card ── */}
        <div className="glass-card p-6 space-y-4 border-l-4 border-l-primary">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Overall Assessment</span>
              <h2 className="text-xl font-bold text-foreground mt-0.5">Cognitive Monitoring Status</h2>
            </div>
            <div>
              <StatusBadge status={activeHealthReport.cognitiveMonitoringStatus} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {activeHealthReport.overallAssessment}
          </p>
        </div>

        {/* ── Potential Health Associations Section ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" /> Potential Health Associations
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI analysis of persistent baseline deviations, long-term trends, and multi-test patterns
              </p>
            </div>
          </div>

          {/* Persistent Findings Cards */}
          {activeHealthReport.potentialAssociations && activeHealthReport.potentialAssociations.length > 0 ? (
            <div className="grid gap-6">
              {activeHealthReport.potentialAssociations.map((assoc, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="glass-card p-6 space-y-5 border border-border/40 hover:border-primary/30 transition-all"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/20 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                      <h4 className="text-base font-bold text-foreground">{assoc.test}</h4>
                    </div>
                    <SeverityBadge severity={assoc.severity} />
                  </div>

                  {/* Observed Pattern */}
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observed Pattern</span>
                    <p className="text-sm text-foreground font-medium mt-1 bg-muted/30 p-3 rounded-lg border border-border/10">
                      {assoc.pattern}
                    </p>
                  </div>

                  {/* Associations & Symptoms Grid */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Possible Associations */}
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" /> Possible Health Associations
                      </span>
                      <ul className="space-y-1.5 mt-2">
                        {assoc.possibleAssociations.map((item, i) => (
                          <li key={i} className="text-xs text-foreground flex items-start gap-2">
                            <span className="text-primary font-bold">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Common Symptoms */}
                    <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 space-y-2">
                      <span className="text-xs font-semibold text-accent uppercase tracking-wide flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> Common Symptoms
                      </span>
                      <ul className="space-y-1.5 mt-2">
                        {assoc.symptoms.map((sym, i) => (
                          <li key={i} className="text-xs text-foreground flex items-start gap-2">
                            <span className="text-accent font-bold">•</span>
                            <span>{sym}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* What This Means */}
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What This Means</span>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {assoc.explanation}
                    </p>
                  </div>

                  {/* Recommended Next Step */}
                  <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
                    <Lightbulb className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-purple-300">Recommended Action:</span>
                      <p className="text-xs text-foreground mt-0.5">{assoc.recommendedAction}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : activeHealthReport.transientNotice ? (
            <div className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-400 shrink-0" />
                <h4 className="text-sm font-semibold text-blue-300">Temporary Variation Detected</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                {activeHealthReport.transientNotice}
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-xl glass-card text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto" />
              <h4 className="text-sm font-semibold text-foreground">No Persistent Abnormal Patterns Identified</h4>
              <p className="text-xs text-muted-foreground">
                Your cognitive test performance is stable and matches your personal baseline.
              </p>
            </div>
          )}

          {/* ── Medical Disclaimer Banner ── */}
          <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-yellow-400 shrink-0" />
              <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Medical Disclaimer & Safety Policy</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {activeHealthReport.disclaimer || defaultDisclaimer}
            </p>
          </div>
        </div>

        {/* ── Monthly Score Trend Chart ── */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Score Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={displayMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(217,33%,25%)" />
              <XAxis dataKey="month" stroke="hsl(215,20%,65%)" fontSize={12} />
              <YAxis stroke="hsl(215,20%,65%)" fontSize={12} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "hsl(217,33%,17%)", border: "1px solid hsl(217,33%,25%)", borderRadius: "12px", color: "hsl(210,40%,98%)" }} />
              <Bar dataKey="score" fill="hsl(259,100%,62%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Test History Results Table ── */}
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-border/20">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Recent Test History
            </h3>
          </div>
          {displayResults.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No test results yet. Complete some cognitive tests to see your history here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/20 text-left text-sm text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Test</th>
                    <th className="px-6 py-3 font-medium">Score</th>
                    <th className="px-6 py-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((r, i) => (
                    <tr key={"id" in r ? r.id : i} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-3 text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" /> {r.date}
                      </td>
                      <td className="px-6 py-3 text-sm text-foreground font-medium">{r.test}</td>
                      <td className="px-6 py-3">
                        <span className={`text-sm font-semibold ${r.score >= 85 ? "text-green-400" : r.score >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                          {r.score}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-muted-foreground">{r.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </motion.div>
    </div>
  );
};

export default ReportsPage;
