import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { conectarCache } from "./api/cache.js";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      staleTime: 0,
      retry: 1,
    },
  },
});

conectarCache(client);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <ToastContainer position="top-right" theme="colored" newestOnTop closeOnClick pauseOnFocusLoss={false} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
