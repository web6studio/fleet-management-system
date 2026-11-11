import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./components/components.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The stream is the source of truth for anything that changes, so a query exists to
      // bootstrap and then gets out of the way. Retries cover a server still starting up.
      retry: 2,
      refetchOnWindowFocus: false,
    },
    // A command is accepted, not applied. Retrying it on the client's own initiative would
    // mean sending a stop twice without an operator asking for it.
    mutations: { retry: false },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
