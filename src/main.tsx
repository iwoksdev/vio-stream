import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AccountProvider, ServicesProvider } from "./platform";
import "./styles.css";
import "./platform.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccountProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </AccountProvider>
  </React.StrictMode>,
);
