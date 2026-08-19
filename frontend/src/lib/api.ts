// ─── Central API Client ───────────────────────────────────────────────────────
// Dev:  Vite proxy → /api → http://localhost:5000/api
// Prod: VITE_API_URL is injected by Render at build time

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : import.meta.env.DEV
  ? "/api"
  : "https://digital-cognitive-twin.onrender.com/api";

function getToken(): string | null {
  return localStorage.getItem("cogtwin_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // 30-second timeout — Render free tier can take ~30s to wake up
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error(`Server error (${res.status})`);

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === "AbortError")
        throw new Error("Server is starting up. Please wait 30 seconds and try again.");
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"))
        throw new Error("Server is starting up. Please wait 30 seconds and try again.");
      throw err;
    }
    throw new Error("Unknown error");
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/auth/register", {
      method: "POST", body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: ApiUser }>("/auth/me"),
  updateProfile: (data: { name?: string; age?: number }) =>
    request<{ user: ApiUser }>("/auth/update-profile", {
      method: "PATCH", body: JSON.stringify(data),
    }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────
export const testsApi = {
  submit: (payload: { testType: string; score: number; durationSeconds?: number; sessionId?: string }) =>
    request<{ result: TestResult; session: SessionSummary; anomaly: AnomalyResult }>("/tests/submit", {
      method: "POST", body: JSON.stringify(payload),
    }),
  history: (params?: { limit?: number; testType?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ results: TestResult[] }>(`/tests/history${qs ? "?" + qs : ""}`);
  },
  sessions: (limit?: number) =>
    request<{ sessions: SessionData[] }>(`/tests/sessions${limit ? "?limit=" + limit : ""}`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => request<DashboardData>("/dashboard"),
};

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profileApi = {
  get: () => request<{ user: ApiUser; stats: UserStats }>("/profile"),
  update: (data: { name?: string; age?: number }) =>
    request<{ user: ApiUser }>("/profile", { method: "PATCH", body: JSON.stringify(data) }),
  reports: () =>
    request<{
      testResults: FormattedTestResult[];
      monthlyTrends: MonthlyTrend[];
      healthReport?: HealthReportData;
    }>("/profile/reports"),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => request<{ notifications: AppNotification[]; unreadCount: number }>("/notifications"),
  markRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/read/${id}`, { method: "POST" }),
  markAllRead: () =>
    request<{ success: boolean }>("/notifications/read-all", { method: "POST" }),
};

// ─── Reminders ────────────────────────────────────────────────────────────────
export const remindersApi = {
  getSettings: () =>
    request<{ settings: ReminderSettings }>("/reminders/settings"),
  saveSettings: (data: Partial<ReminderSettings>) =>
    request<{ settings: ReminderSettings; message: string }>("/reminders/settings", {
      method: "PUT", body: JSON.stringify(data),
    }),
  getStatus: () =>
    request<ReminderStatus>("/reminders/status"),
  sendTest: () =>
    request<{ success: boolean; message: string }>("/reminders/test", { method: "POST" }),
};

// ─── ML / Digital Twin ────────────────────────────────────────────────────────
export const mlApi = {
  getTwin:  () => request<TwinStatus>("/ml/twin"),
  train:    () => request<TrainResult>("/ml/train", { method: "POST" }),
  analyze:  () => request<AnalysisResult>("/ml/analyze"),
  predict:  () => request<PredictionResult>("/ml/predict"),
};

// ─── Groq AI ──────────────────────────────────────────────────────────────────
export const aiApi = {
  getInsights: () =>
    request<{ insights: AiInsight[]; model: string; source: string }>("/ai/insights", { method: "POST" }),
  getRecommendations: (extra?: object) =>
    request<{ recommendations: Recommendation[]; model: string; source: string }>("/ai/recommendations", {
      method: "POST", body: JSON.stringify(extra || {}),
    }),
  explainAnomaly: (data: { testType: string; score: number; baseline: number; zScore: number; severity: string }) =>
    request<{ explanation: string; model: string; source: string }>("/ai/explain-anomaly", {
      method: "POST", body: JSON.stringify(data),
    }),
  weeklyReport: () =>
    request<{ summary: string; model: string; source: string }>("/ai/weekly-report"),
  ask: (question: string) =>
    request<{ answer: string; question: string; model: string; source: string }>("/ai/ask", {
      method: "POST", body: JSON.stringify({ question }),
    }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CognitiveMonitoringStatusType =
  | "Low Concern"
  | "Monitor"
  | "Attention Recommended"
  | "Professional Evaluation Recommended";

export interface PotentialAssociationItem {
  test: string;
  pattern: string;
  severity: "mild" | "moderate" | "severe";
  possibleAssociations: string[];
  symptoms: string[];
  explanation: string;
  recommendedAction: string;
}

export interface HealthReportData {
  overallAssessment: string;
  cognitiveMonitoringStatus: CognitiveMonitoringStatusType;
  significantPatterns?: string[];
  potentialAssociations: PotentialAssociationItem[];
  transientNotice?: string | null;
  recommendations?: string[];
  disclaimer: string;
}

export interface CognitiveHealthInsight {
  title: string;
  description: string;
  hasAssociations: boolean;
  status: CognitiveMonitoringStatusType;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  joinedDate: string;
  baseline: {
    established: boolean;
    sessionsCompleted: number;
    memory: number | null;
    reaction: number | null;
    pattern: number | null;
    attention: number | null;
    decision: number | null;
    overall: number | null;
  };
  streak: { current: number; lastTestDate: string | null };
}

export interface TestResult {
  _id: string;
  userId: string;
  testType: string;
  score: number;
  durationSeconds: number | null;
  sessionId: string;
  anomaly: AnomalyResult;
  deviationFromBaseline: number | null;
  createdAt: string;
}

export interface AnomalyResult {
  detected: boolean;
  zScore: number | null;
  severity: "none" | "mild" | "moderate" | "severe";
}

export interface SessionSummary {
  sessionId: string;
  testsCompleted: number;
  isComplete: boolean;
  overallScore: number | null;
  insights: Insight[];
}

export interface SessionData {
  _id: string;
  sessionId: string;
  scores: Record<string, number | null>;
  overallScore: number | null;
  testsCompleted: number;
  isComplete: boolean;
  insights: Insight[];
  createdAt: string;
}

export interface Insight {
  type: "positive" | "warning" | "info";
  title: string;
  description: string;
}

export interface CognitiveMetric {
  name: string;
  score: number | null;
  change: number;
  status: "improving" | "stable" | "declining";
  baseline: number | null;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  memory: number | null;
  reaction: number | null;
  pattern: number | null;
  attention: number | null;
  decision: number | null;
}

export interface MonthlyTrend { month: string; score: number; }

export interface DashboardData {
  overallScore: number | null;
  cognitiveMetrics: CognitiveMetric[];
  scoreHistory: ScoreHistoryEntry[];
  monthlyTrends: MonthlyTrend[];
  trend: { direction: string; slope: number; confidence: number };
  aiInsights: AiInsight[];
  recommendations: Recommendation[];
  anomalyAlerts: AnomalyAlert[];
  baselineStatus: BaselineStatus;
  declineInfo: DeclineInfo | null;
  peakInfo: PeakInfo | null;
  cognitiveHealthInsight?: CognitiveHealthInsight | null;
  weeklyReminderDue: boolean;
  daysSinceLastTest: number | null;
  baseline: ApiUser["baseline"];
  stats: UserStats;
}


export interface AiInsight {
  id: number;
  type: "positive" | "warning" | "info";
  title: string;
  description: string;
  timestamp: string;
}

export interface Recommendation {
  id: number;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category?: string;
}

export interface UserStats {
  totalTests: number;
  totalSessions: number;
  avgScore: number | null;
  streak: number;
}

export interface FormattedTestResult {
  id: string;
  date: string;
  test: string;
  score: number;
  duration: string;
  anomaly: AnomalyResult;
}

export interface AppNotification {
  _id: string;
  type: "reminder" | "alert" | "insight" | "milestone" | "warning";
  severity: "info" | "warning" | "danger" | "success";
  title: string;
  message: string;
  read: boolean;
  actionUrl: string;
  createdAt: string;
}

export interface AnomalyAlert {
  id: string;
  testType: string;
  score: number;
  baseline: number;
  zScore: number;
  severity: "mild" | "moderate" | "severe";
  severityColor: "info" | "warning" | "danger";
  direction: "above" | "below";
  message: string;
  recommendation: string;
  date: string;
}

export interface BaselineStatus {
  status: "not_started" | "in_progress" | "established";
  message: string;
  sessionsNeeded: number;
  progress: number;
}

export interface DeclineInfo {
  detected: boolean;
  slope: number;
  confidence: number;
  weeksOfDecline: number;
  recommendation: string;
  severity: "moderate" | "severe";
}

export interface PeakInfo {
  peakHour: number;
  peakAvg: number;
  lowHour: number;
  lowAvg: number;
  improvement: number;
  insight: string;
}

export interface ReminderSettings {
  _id?: string;
  userId?: string;
  enabled: boolean;
  weeklyDay: number;
  weeklyHour: number;
  intervalDays: number;
  notifyOnAnomaly: boolean;
  notifyOnBaseline: boolean;
  notifyOnDecline: boolean;
  notifyWeekly: boolean;
  lastReminderSent?: string | null;
}

export interface ReminderStatus {
  isDue: boolean;
  daysSinceLast: number | null;
  intervalDays: number;
  nextDueDate: string | null;
  lastTestDate: string | null;
  reminderEnabled: boolean;
}

export interface FeatureStat {
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  consistency: number | null;
  trendSlope: number | null;
}

export interface TrendAnalysis {
  slope: number;
  r2: number;
  direction: "improving" | "declining" | "stable";
  confidence: number;
  predicted7Day: number;
  predicted30Day: number;
}

export interface TwinStatus {
  twin: {
    accuracy: number | null;
    trainedOn: number;
    lastTrained: string | null;
    trendAnalysis: TrendAnalysis | null;
    featureStats: Record<string, FeatureStat> | null;
    lastPrediction: { score: number; predictedAt: string } | null;
  } | null;
  baseline: ApiUser["baseline"];
  sessionCount: number;
  readyToTrain: boolean;
}

export interface TrainResult {
  message: string;
  accuracy: number;
  trainedOn: number;
  trendAnalysis: TrendAnalysis;
  featureStats: Record<string, FeatureStat>;
}

export interface AnalysisResult {
  featureStats: Record<string, FeatureStat> | null;
  trendAnalysis: TrendAnalysis | null;
  anomalySummary: { total: number; severe: number; moderate: number; mild: number } | null;
  recommendations: Recommendation[];
  sessionCount: number;
  baseline: ApiUser["baseline"];
}

export interface PredictionResult {
  predictedScore: number | null;
  confidence: number | null;
  basedOnSessions: number;
  trendAnalysis: TrendAnalysis | null;
}
