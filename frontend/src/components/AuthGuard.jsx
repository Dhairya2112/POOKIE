import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

export function AuthGuard({ children, requireOnboarding = true }) {
  const {
    token,
    logout,
    setUsername,
    setOnboardingCompleted,
    onboardingCompleted,
    setEulaAccepted,
  } = useAppStore();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      // 1. Immediately abort if no token (no fetch attempt)
      if (!token) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsChecking(false);
        }
        return;
      }

      // 2. Fetch profile if token exists, strictly wrapped in try/catch/finally
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`}/api/v1/user/profile/`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!res.ok) {
          throw new Error(`Authentication failed with status: ${res.status}`);
        }

        const data = await res.json();

        if (isMounted) {
          // Sync profile data to store
          if (data && data.username) setUsername(data.username);
          if (data?.preferences?.preferred_name)
            setUsername(data.preferences.preferred_name);

          if (data?.preferences?.privacy_consent_granted === true) {
            setOnboardingCompleted(true);
            setEulaAccepted(true);
          }

          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("AuthGuard fetch failed:", err);
        if (isMounted) {
          logout(); // Clear bad token state
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          // Guaranteed terminal state resolution
          setIsChecking(false);
        }
      }
    };

    verifySession();

    return () => {
      isMounted = false;
    };
  }, [token, logout, setUsername, setOnboardingCompleted, setEulaAccepted]);

  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#030303] text-zinc-400">
        <svg
          className="animate-spin w-8 h-8 mb-4 text-[#8052ff]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"></path>
        </svg>
        <span className="text-[10px] tracking-widest font-mono uppercase">
          Verifying Session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Handle routing based on onboarding status
  if (requireOnboarding && !onboardingCompleted) {
    return <Navigate to="/onboarding/name" replace />;
  }

  if (!requireOnboarding && onboardingCompleted) {
    // If they finished onboarding, don't let them sit on the onboarding route
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
