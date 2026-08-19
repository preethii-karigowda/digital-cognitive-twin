import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import {
  Brain, TrendingUp, TrendingDown, Minus, Activity,
  AlertTriangle, Lightbulb, Target, Loader2, CheckCircle,
  Clock, Play, Bell, ChevronRight, Zap,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { dashboardApi, type DashboardData } from "@/lib/api";
import {
  cognitiveScoreHistory, cognitiveMetrics as mockMetrics,
  aiInsights as mockInsights, recommendations as mockRecs, monthlyTrends as mockMonthly,
} from "@/data/mockData";

const fadeUp = {
  hidden:   { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.45 } }),
};

// ─── Severity badge ───────────────────────────────────────────────────────────
const SeverityBadge = ({ severity }: { severity: string }) => {
  const map: Record<string, string> = {
    severe:   "bg-red-500/20 text-red-400 border-red-500/30",
    moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    mild:     "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${map[severity] || "bg-muted/20 text-muted-foreground border-border/20"}`}>
      {severity}
    </span>
  );
};

// ─── Weekly reminder banner ───────────────────────────────────────────────────
const WeeklyReminder = ({ days }: { days: number | null }) => (
  <motion.div
    variants={fadeUp} custom={0}
    className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between gap-4"
  >
    <div className="flex items-center gap-3">
      <Bell className="w-5 h-5 text-yellow-400 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {days === null ? "Time for your first assessment!" : `Weekly assessment due — ${days} days since last test`}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Regular weekly testing enables accurate cognitive trend detection and early warnings.
        </p>
      </div>
    </div>
    <Link to="/tests" className="gradient-btn text-xs inline-flex items-center gap-1.5 shrink-0">
      <Play className="w-3 h-3" /> Take Test
    </Link>
  </motion.div>
);

// ─── Baseline progress banner ─────────────────────────────────────────────────
const BaselineBanner = ({ status }: { status: NonNullable<DashboardData["baselineStatus"]> }) => {
  if (status.status === "established") {
    return (
      <motion.div variants={fadeUp} custom={0}
        className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 flex items-center gap-3"
      >
        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-400">{status.message}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your cognitive fingerprint is active. All future tests are compared against your personal baseline.
          </p>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div variants={fadeUp} custom={0}
      className="p-4 rounded-xl border border-primary/30 bg-primary/5"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          {status.message}
        </p>
        <span className="text-xs text-primary font-bold">{status.progress}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all duration-700"
          style={{ width: `${status.progress}%` }} />
      </div>
      {status.status === "not_started" && (
        <p className="text-xs text-muted-foreground mt-2">
          Complete 3 full sessions (all 5 tests each) to establish your personal cognitive baseline.
        </p>
      )}
    </motion.div>
  );
};

// ─── Anomaly alert card ───────────────────────────────────────────────────────
const AnomalyCard = ({ alert }: { alert: DashboardData["anomalyAlerts"][0] }) => (
  <div className={`p-4 rounded-xl border ${
    alert.severity === "severe"   ? "border-red-500/30 bg-red-500/5" :
    alert.severity === "moderate" ? "border-yellow-500/30 bg-yellow-500/5" :
                                    "border-blue-500/30 bg-blue-500/5"
  }`}>
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className={`w-4 h-4 shrink-0 ${
          alert.severity === "severe" ? "text-red-400" :
          alert.severity === "moderate" ? "text-yellow-400" : "text-blue-400"
        }`} />
        <span className="text-sm font-semibold text-foreground capitalize">{alert.testType} Anomaly</span>
      </div>
      <SeverityBadge severity={alert.severity} />
    </div>
    <p className="text-xs text-muted-foreground">{alert.message}</p>
    <p className="text-xs text-foreground mt-2 font-medium">💡 {alert.recommendation}</p>
    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
      <span>Score: <strong className="text-foreground">{alert.score}</strong></span>
      <span>Baseline: <strong className="text-foreground">{alert.baseline}</strong></span>
      <span>Z-score: <strong className="text-foreground">{alert.zScore}</strong></span>
    </div>
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const DashboardPage = () => {
  const { user } = useAuth();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    dashboardApi.get()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const overallScore  = data?.overallScore ?? null;
  const metrics       = data?.cognitiveMetrics?.length ? data.cognitiveMetrics : mockMetrics;
  const scoreHistory  = data?.scoreHistory?.length ? data.scoreHistory : cognitiveScoreHistory;
  const monthly       = data?.monthlyTrends?.length ? data.monthlyTrends : mockMonthly;
  const insights      = data?.aiInsights?.length ? data.aiInsights : mockInsights;
  const recs          = data?.recommendations?.length ? data.recommendations : null;
  const stats         = data?.stats;
  const anomalyAlerts = data?.anomalyAlerts ?? [];
  const baselineStatus = data?.baselineStatus;
  const declineInfo   = data?.declineInfo;
  const peakInfo      = data?.peakInfo;

  const radarData = metrics.map((m) => ({
    subject: m.name.split(" ")[0],
    score: m.score ?? 0,
    fullMark: 100,
  }));

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <motion.div initial="hidden" animate="visible" className="space-y-6">

        {/* ── Header ── */}
        <motion.div variants={fadeUp} custom={0} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Welcome back, {user?.name || "User"} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Your cognitive health overview</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {stats && stats.streak > 0 && (
              <span className="text-xs glass-card px-3 py-1.5 text-orange-400 font-medium">
                🔥 {stats.streak} day streak
              </span>
            )}
            {stats && (
              <span className="text-xs glass-card px-3 py-1.5 text-muted-foreground">
                {stats.totalSessions} sessions · {stats.totalTests} tests
              </span>
            )}
            <div className="glass-card px-4 py-2 flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-muted-foreground">AI Twin Active</span>
            </div>
          </div>
        </motion.div>

        {/* ── Error ── */}
        {error && (
          <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-sm text-yellow-400">
            ⚠️ Could not load live data — showing demo data. ({error})
          </div>
        )}

        {/* ── Use Case 1: Weekly reminder ── */}
        {data?.weeklyReminderDue && (
          <WeeklyReminder days={data.daysSinceLastTest} />
        )}

        {/* ── Use Case 1: Baseline progress ── */}
        {baselineStatus && <BaselineBanner status={baselineStatus} />}

        {/* ── Cognitive Health Insight Card ── */}
        {data?.cognitiveHealthInsight && (
          <motion.div variants={fadeUp} custom={1}
            className="p-4 rounded-xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {data.cognitiveHealthInsight.title}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
                    {data.cognitiveHealthInsight.status}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.cognitiveHealthInsight.description}
                </p>
              </div>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0">
              View potential health associations <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        )}


        {/* ── Use Case 3: Decline alert ── */}
        {declineInfo?.detected && (
          <motion.div variants={fadeUp} custom={1}
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              declineInfo.severity === "severe"
                ? "border-red-500/40 bg-red-500/10"
                : "border-yellow-500/30 bg-yellow-500/5"
            }`}
          >
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${declineInfo.severity === "severe" ? "text-red-400" : "text-yellow-400"}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {declineInfo.severity === "severe" ? "⚠️ Significant Cognitive Decline Detected" : "📉 Gradual Decline Trend"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{declineInfo.recommendation}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Slope: {declineInfo.slope}/session · Confidence: {Math.round(declineInfo.confidence * 100)}% · {declineInfo.weeksOfDecline} sessions analyzed
              </p>
            </div>
            <Link to="/reports" className="text-xs text-primary hover:underline shrink-0">
              Export Report →
            </Link>
          </motion.div>
        )}

        {/* ── Use Case 4: Peak performance insight ── */}
        {peakInfo && peakInfo.improvement >= 5 && (
          <motion.div variants={fadeUp} custom={1}
            className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center gap-3"
          >
            <Zap className="w-5 h-5 text-green-400 shrink-0" />
            <p className="text-sm text-foreground">{peakInfo.insight}</p>
          </motion.div>
        )}

        {/* ── Score Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div variants={fadeUp} custom={2} className="glass-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Overall Score</span>
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold gradient-text">
                {overallScore ?? "—"}
              </span>
              {data?.trend && (
                <span className={`text-sm flex items-center gap-0.5 mb-1 ${
                  data.trend.direction === "improving" ? "text-green-400" :
                  data.trend.direction === "declining" ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {data.trend.direction === "improving" ? <TrendingUp className="w-3 h-3" /> :
                   data.trend.direction === "declining" ? <TrendingDown className="w-3 h-3" /> :
                   <Minus className="w-3 h-3" />}
                  {data.trend.direction}
                </span>
              )}
            </div>
            <div className="w-full h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary transition-all duration-700"
                style={{ width: `${overallScore ?? 0}%` }} />
            </div>
            {stats?.avgScore && (
              <p className="text-xs text-muted-foreground">Avg: {stats.avgScore}</p>
            )}
          </motion.div>

          {metrics.slice(0, 3).map((m, i) => (
            <motion.div key={m.name} variants={fadeUp} custom={i + 3} className="glass-card p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{m.name}</span>
                <Activity className="w-5 h-5 text-accent" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-foreground">{m.score ?? "—"}</span>
                <span className={`text-sm flex items-center gap-0.5 mb-1 ${
                  m.change > 0 ? "text-green-400" : m.change < 0 ? "text-red-400" : "text-muted-foreground"
                }`}>
                  {m.change > 0 ? <TrendingUp className="w-3 h-3" /> :
                   m.change < 0 ? <TrendingDown className="w-3 h-3" /> :
                   <Minus className="w-3 h-3" />}
                  {m.change > 0 ? "+" : ""}{m.change}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${m.score ?? 0}%` }} />
              </div>
              {m.baseline && (
                <p className="text-xs text-muted-foreground">Baseline: {m.baseline}</p>
              )}
            </motion.div>
          ))}
        </div>

        {/* ── Charts ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div variants={fadeUp} custom={6} className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Weekly Performance</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={scoreHistory}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(259,100%,62%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(259,100%,62%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217,33%,25%)" />
                <XAxis dataKey="date" stroke="hsl(215,20%,65%)" fontSize={12} />
                <YAxis stroke="hsl(215,20%,65%)" fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "hsl(217,33%,17%)", border: "1px solid hsl(217,33%,25%)", borderRadius: "12px", color: "hsl(210,40%,98%)" }} />
                <Area type="monotone" dataKey="score"    stroke="hsl(259,100%,62%)" fill="url(#scoreGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="memory"   stroke="hsl(220,80%,65%)"  fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
                <Area type="monotone" dataKey="attention" stroke="hsl(150,80%,50%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div variants={fadeUp} custom={7} className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Cognitive Radar</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(217,33%,25%)" />
                <PolarAngleAxis dataKey="subject" stroke="hsl(215,20%,65%)" fontSize={11} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(217,33%,25%)" fontSize={10} />
                <Radar name="Score" dataKey="score" stroke="hsl(259,100%,62%)" fill="hsl(259,100%,62%)" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* ── Use Case 2: Anomaly Alerts ── */}
        {anomalyAlerts.length > 0 && (
          <motion.div variants={fadeUp} custom={8} className="glass-card p-6 space-y-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" /> Anomaly Alerts
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {anomalyAlerts.length}
              </span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {anomalyAlerts.map((alert) => (
                <AnomalyCard key={alert.id} alert={alert} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Monthly Trend + AI Insights ── */}
        <div className="grid lg:grid-cols-3 gap-6">
          <motion.div variants={fadeUp} custom={9} className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217,33%,25%)" />
                <XAxis dataKey="month" stroke="hsl(215,20%,65%)" fontSize={12} />
                <YAxis stroke="hsl(215,20%,65%)" fontSize={12} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "hsl(217,33%,17%)", border: "1px solid hsl(217,33%,25%)", borderRadius: "12px", color: "hsl(210,40%,98%)" }} />
                <Bar dataKey="score" fill="hsl(259,100%,62%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div variants={fadeUp} custom={10} className="glass-card p-6 lg:col-span-2 space-y-3">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" /> AI Insights
            </h3>
            {insights.map((insight, idx) => (
              <div key={"id" in insight ? insight.id : idx}
                className={`p-4 rounded-xl border ${
                  insight.type === "positive" ? "border-green-500/20 bg-green-500/5" :
                  insight.type === "warning"  ? "border-yellow-500/20 bg-yellow-500/5" :
                                               "border-accent/20 bg-accent/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  {insight.type === "warning"
                    ? <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                    : insight.type === "positive"
                    ? <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                    : <Target className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  }
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                    {"timestamp" in insight && (
                      <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{insight.timestamp}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Recommendations ── */}
        <motion.div variants={fadeUp} custom={11} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" /> Personalized Recommendations
            </h3>
            <Link to="/twin" className="text-xs text-primary hover:underline flex items-center gap-1">
              Full Analysis <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(recs ?? mockRecs.slice(0, 5).map((r, i) => ({ id: i, title: r, description: "", priority: "medium" as const }))).map((rec) => (
              <div key={rec.id} className="p-4 rounded-xl bg-muted/30 border border-border/20 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                  {"priority" in rec && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      rec.priority === "high"   ? "bg-red-500/20 text-red-400" :
                      rec.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                                                  "bg-green-500/20 text-green-400"
                    }`}>{rec.priority}</span>
                  )}
                </div>
                {"description" in rec && rec.description && (
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Quick Actions ── */}
        <motion.div variants={fadeUp} custom={12} className="grid sm:grid-cols-3 gap-4">
          <Link to="/tests" className="glass-card-hover p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Start Assessment</p>
              <p className="text-xs text-muted-foreground">5 tests · ~15 min</p>
            </div>
          </Link>
          <Link to="/twin" className="glass-card-hover p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">AI Twin Analysis</p>
              <p className="text-xs text-muted-foreground">Train & predict</p>
            </div>
          </Link>
          <Link to="/reports" className="glass-card-hover p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">View Reports</p>
              <p className="text-xs text-muted-foreground">Export PDF</p>
            </div>
          </Link>
        </motion.div>

      </motion.div>
    </div>
  );
};

export default DashboardPage;
