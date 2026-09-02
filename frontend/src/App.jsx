import {
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { Suspense, lazy, useEffect, useCallback, useRef } from "react";
const NeuralMesh = lazy(() =>
  import("./components/NeuralMesh").then((m) => ({
    default: m.NeuralMesh || m.default,
  })),
);
import { AuthGuard } from "./components/AuthGuard";
import { useAppStore } from "./store/useAppStore";

// Phase 1: Route-Based Lazy Loading
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() =>
  import("./components/Login").then((module) => ({ default: module.Login })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const Onboarding = lazy(() =>
  import("./pages/Onboarding").then((module) => ({
    default: module.Onboarding,
  })),
);
const MobileChat = lazy(() =>
  import("./pages/MobileChat").then((module) => ({
    default: module.MobileChat,
  })),
);

// Loading Fallback Skeleton
const FullScreenLoader = () => (
  <div className="w-full h-screen flex flex-col items-center justify-center bg-[#030303]">
    <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-[#8052ff] animate-spin mb-4" />
    <div className="text-xs font-mono text-zinc-500 tracking-widest">
      INITIALIZING SETU...
    </div>
  </div>
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    refreshToken,
    setToken,
    setRefreshToken,
    logout,
    onboardingCompleted,
  } = useAppStore();

  const isRefreshingRef = useRef(false);
  const refreshTokenRef = useRef(refreshToken);

  // Keep ref updated with latest token
  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  const refreshAccessToken = useCallback(async () => {
    const rt = refreshTokenRef.current;
    if (!rt || isRefreshingRef.current) return null;

    isRefreshingRef.current = true;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/auth/refresh/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        },
      );
      if (response.ok) {
        const data = await response.json();
        if (data.access_token && data.refresh_token) {
          setToken(data.access_token);
          setRefreshToken(data.refresh_token);
          console.log("Token refreshed successfully.");
          return data.access_token;
        }
      } else if (response.status === 401 || response.status === 403) {
        console.error("Refresh token invalid or expired, logging out.");
        logout();
        refreshTokenRef.current = null; // Clear it to prevent looping
      } else {
        console.error("Transient error refreshing token:", response.status);
      }
    } catch (err) {
      console.error("Error refreshing token:", err);
    } finally {
      isRefreshingRef.current = false;
    }
    return null;
  }, [setToken, setRefreshToken, logout]);

  // Periodic refresh loop + initial refresh on boot
  useEffect(() => {
    if (!refreshTokenRef.current) return;

    // Refresh immediately on load if we have a refresh token
    refreshAccessToken();

    // Refresh every 10 minutes (600,000 ms)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        refreshAccessToken();
      }
    }, 600000);

    return () => clearInterval(interval);
  }, [refreshAccessToken]);

  const handleLoginSuccess = (newToken, newRefreshToken) => {
    setToken(newToken);
    setRefreshToken(newRefreshToken);
    navigate(onboardingCompleted ? "/dashboard" : "/onboarding/name");
  };

  // Only render NeuralMesh on internal app routes, not on Landing
  const isLanding = location.pathname === "/";

  return (
    <div
      className={`flex flex-col w-screen bg-[#030303] text-[var(--color-text-primary)] relative border border-white/10 ${isLanding ? "min-h-screen" : "h-screen overflow-hidden"}`}
    >
      <div
        className={`flex-1 relative z-10 w-full flex ${isLanding ? "" : "overflow-hidden"}`}
      >
        {!isLanding && <NeuralMesh />}
        <Suspense fallback={<FullScreenLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/auth"
              element={<Login onLoginSuccess={handleLoginSuccess} />}
            />
            <Route
              path="/onboarding/*"
              element={
                <AuthGuard requireOnboarding={false}>
                  <Onboarding />
                </AuthGuard>
              }
            />
            <Route
              path="/dashboard/*"
              element={
                <AuthGuard requireOnboarding={true}>
                  <Dashboard />
                </AuthGuard>
              }
            />
            <Route path="/mobile" element={<MobileChat />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default App;
