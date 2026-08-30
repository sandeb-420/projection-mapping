import { HostPage } from "./pages/HostPage";
import { LabPage } from "./pages/LabPage";
import { PhonePage } from "./pages/PhonePage";
import { ProjectorPage } from "./pages/ProjectorPage";

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/phone") return <PhonePage />;
  if (path === "/projector") return <ProjectorPage />;
  if (path === "/lab") return <LabPage />;
  return <HostPage />;
}
