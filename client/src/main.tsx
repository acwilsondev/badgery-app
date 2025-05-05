import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Set page title
document.title = "MeritMark - Achievement Badge System";

createRoot(document.getElementById("root")!).render(<App />);
