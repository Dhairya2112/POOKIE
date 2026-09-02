import { create } from "zustand";

const generateUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const useAppStore = create((set) => ({
  token: localStorage.getItem("setu_token"),
  refreshToken: localStorage.getItem("setu_refresh_token"),
  username: localStorage.getItem("setu_preferred_name") || "Agent",
  conversationId:
    localStorage.getItem("setu_conversation_id") ||
    (() => {
      const id = generateUUID();
      localStorage.setItem("setu_conversation_id", id);
      return id;
    })(),
  eulaAccepted: localStorage.getItem("setu_eula_accepted") === "true",
  onboardingCompleted:
    localStorage.getItem("setu_onboarding_completed") === "true",

  setToken: (token) => {
    if (token) localStorage.setItem("setu_token", token);
    else localStorage.removeItem("setu_token");
    set({ token });
  },

  setRefreshToken: (refreshToken) => {
    if (refreshToken) localStorage.setItem("setu_refresh_token", refreshToken);
    else localStorage.removeItem("setu_refresh_token");
    set({ refreshToken });
  },

  setUsername: (username) => {
    localStorage.setItem("setu_preferred_name", username);
    set({ username });
  },

  setConversationId: (id) => {
    localStorage.setItem("setu_conversation_id", id);
    set({ conversationId: id });
  },

  setEulaAccepted: (accepted) => {
    localStorage.setItem("setu_eula_accepted", accepted ? "true" : "false");
    set({ eulaAccepted: accepted });
  },

  setOnboardingCompleted: (completed) => {
    localStorage.setItem(
      "setu_onboarding_completed",
      completed ? "true" : "false",
    );
    set({ onboardingCompleted: completed });
  },

  logout: () => {
    localStorage.removeItem("setu_token");
    localStorage.removeItem("setu_refresh_token");
    localStorage.removeItem("setu_conversation_id");
    localStorage.removeItem("setu_onboarding_completed");
    localStorage.removeItem("setu_eula_accepted");
    localStorage.removeItem("setu_active_tab");
    const newId = generateUUID();
    localStorage.setItem("setu_conversation_id", newId);
    set({
      token: null,
      refreshToken: null,
      username: "Agent",
      conversationId: newId,
      eulaAccepted: false,
      onboardingCompleted: false,
    });
  },
}));
