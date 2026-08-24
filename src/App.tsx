import { HostPage } from "./pages/HostPage";
import { PhonePage } from "./pages/PhonePage";
import { ProjectorPage } from "./pages/ProjectorPage";

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/phone") return <PhonePage />;
  if (path === "/projector") return <ProjectorPage />;
  return <HostPage />;
}
