import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const root = (
  googleClientId
    ? <GoogleOAuthProvider clientId={googleClientId}><App /></GoogleOAuthProvider>
    : <App />
);

createRoot(document.getElementById("root")!).render(root);
