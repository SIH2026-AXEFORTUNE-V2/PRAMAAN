import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { WorkspacePage } from "@/pages/WorkspacePage";

const ArtifactPage = lazy(() => import("@/pages/ArtifactPage").then((m) => ({ default: m.ArtifactPage })));
const ArtifactsPage = lazy(() => import("@/pages/ArtifactsPage").then((m) => ({ default: m.ArtifactsPage })));
const AgentsPage = lazy(() => import("@/pages/AgentsPage").then((m) => ({ default: m.AgentsPage })));
const ConnectorsPage = lazy(() => import("@/pages/ConnectorsPage").then((m) => ({ default: m.ConnectorsPage })));
const AuditPage = lazy(() => import("@/pages/AuditPage").then((m) => ({ default: m.AuditPage })));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage })));
const EvaluationPage = lazy(() => import("@/pages/EvaluationPage").then((m) => ({ default: m.EvaluationPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));

const fallback = (
  <div className="p-6">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="mt-4 h-64 w-full" />
  </div>
);
const L = (el: React.ReactNode) => <Suspense fallback={fallback}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/workspace" replace /> },
      { path: "workspace", element: <WorkspacePage /> },
      { path: "workspace/:tid", element: <WorkspacePage /> },
      { path: "workspace/:tid/artifact/:type", element: L(<ArtifactPage />) },
      { path: "artifacts", element: L(<ArtifactsPage />) },
      { path: "agents", element: L(<AgentsPage />) },
      { path: "connectors", element: L(<ConnectorsPage />) },
      { path: "audit", element: L(<AuditPage />) },
      { path: "templates", element: L(<TemplatesPage />) },
      { path: "evaluation", element: L(<EvaluationPage />) },
      { path: "settings", element: L(<SettingsPage />) },
      { path: "about", element: L(<AboutPage />) },
      {
        path: "*",
        element: (
          <EmptyState
            className="h-full"
            title="Page not found"
            body="This route does not exist."
            action={<Link to="/workspace" className="text-xs font-semibold text-accent hover:underline">Go to workspace</Link>}
          />
        ),
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
