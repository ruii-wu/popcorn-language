// /scenario is retired — the scenario now runs inline in the main app (App.tsx).
// This redirect keeps the dock entry and any deep links working.
import { Navigate } from 'react-router-dom';

export default function Scenario() {
  return <Navigate to="/" replace />;
}
