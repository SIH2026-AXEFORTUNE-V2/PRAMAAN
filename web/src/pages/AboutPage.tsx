import { Link } from "react-router-dom";
import { Page } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";

const PILLARS = [
  ["One canonical evidence state", "Every claim is extracted once, checked against its source quote and located to a page and bounding box. All artefacts draw facts from it."],
  ["Evidence-locked generation", "Specialist agents may only state facts from the ledger, must keep certainty wording and must not choose between conflicting sources."],
  ["Deterministic verification", "Dates and numbers are normalised and compared per claim; uncertainty is compared on a fixed scale; artefacts are compared with each other."],
  ["Context-aware security", "The same finding can be allowed for technical teams, masked for leadership and redacted on public channels. Prompt injection is neutralised."],
  ["Human approval", "Nothing is exported until a person approves the exact version. Edits and regenerations reset approval."],
  ["Verifiable provenance", "Source, evidence state, contract, output and approval hashes are chained in an append-only ledger. No content, only hashes."],
];

export function AboutPage() {
  return (
    <Page title="PRAMAAN · Project overview" subtitle="AI Transformation Workspace">
      <Card className="p-6">
        <p className="text-lg leading-snug font-bold">Transform content without losing the truth.</p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Existing content generators optimise generation. PRAMAAN optimises trustworthy transformation: one source, multiple outputs, one evidence base, one
          verifiable lineage.
        </p>
        <p className="mt-4 text-xs font-semibold text-accent">Transform once · Verify every claim · Approve once · Preserve the complete lineage</p>
      </Card>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PILLARS.map(([h, b]) => (
          <Card key={h} className="p-4">
            <p className="text-sm font-semibold">{h}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{b}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5">
        <p className="text-xs font-semibold">Project information</p>
        <p className="mt-1 text-xs text-muted">
          Built in response to Smart India Hackathon problem statement SIH26154 (AI-driven multi-format content transformation). Demo sources are fictional; no
          real organisations, systems or people are represented.
        </p>
        <p className="mt-3 text-xs text-muted">
          Stack: FastAPI · asyncio task graph orchestrator · Hugging Face Inference Providers or a self-hosted OpenAI-compatible gateway · pypdf / pdfium ·
          React + TypeScript + Tailwind. API documentation at{" "}
          <a href="/docs" className="font-semibold text-accent hover:underline">
            /docs
          </a>
          .
        </p>
        <Link to="/workspace" className="mt-4 inline-block text-xs font-semibold text-accent hover:underline">
          Open the workspace
        </Link>
      </Card>
    </Page>
  );
}
