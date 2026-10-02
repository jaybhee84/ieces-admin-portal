import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PrintPreviewProvider } from "./components/PrintPreview/PrintPreviewContext";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PrintPreviewProvider>
      <App />
    </PrintPreviewProvider>
  </React.StrictMode>,
);
