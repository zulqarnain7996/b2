import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AdminRealtimeNotifier } from "./components/feedback/AdminRealtimeNotifier";
import { ToastProvider } from "./components/feedback/ToastProvider";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AdminRealtimeNotifier />
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  </React.StrictMode>,
);
