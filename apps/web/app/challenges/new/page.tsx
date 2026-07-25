"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { useCompanyApi } from "@/components/company-auth";
import { companyAuthEnabled } from "@/components/privy-provider";
import {
  languageFromFilename,
  scoreLabel,
  validateGraderSource,
  type GraderLanguage,
} from "@/lib/challenge-form";

const starter = `export default function grade(submission: unknown) {\n  return 0;\n}\n`;

function runtimeFor(language: GraderLanguage) {
  if (language === "python") return "Python 3.12";
  if (language === "typescript") return "Node.js 22 + TypeScript";
  return "Node.js 22";
}

export default function NewChallenge() {
  const api = useCompanyApi();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [source, setSource] = useState(starter);
  const [fileName, setFileName] = useState("");
  const [language, setLanguage] = useState<GraderLanguage>("typescript");
  const [runtime, setRuntime] = useState(runtimeFor("typescript"));
  const [entrypoint, setEntrypoint] = useState("default");
  const [title, setTitle] = useState("Reduce warehouse pick time");
  const [passingScore, setPassingScore] = useState("3.5");
  const [minScore, setMinScore] = useState("0");
  const [maxScore, setMaxScore] = useState("4");
  const [precision, setPrecision] = useState("1");
  const [unit, setUnit] = useState("points");
  const [status, setStatus] = useState<string>();

  const error = useMemo(
    () => validateGraderSource(source, language, entrypoint),
    [source, language, entrypoint],
  );

  function setLanguageWithDefaults(next: GraderLanguage) {
    setLanguage(next);
    setRuntime(runtimeFor(next));
    setEntrypoint(next === "python" ? "grade" : "default");
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const detected = languageFromFilename(file.name);
    if (!detected) {
      setStatus("Only .ts, .js, and .py files are supported.");
      return;
    }
    if (file.size > 256 * 1024) {
      setStatus("Grader source must be 256 KB or smaller.");
      return;
    }
    setMode("upload");
    setFileName(file.name);
    setSource(await file.text());
    setLanguageWithDefaults(detected);
    setStatus(undefined);
  }

  async function submit() {
    if (error) return setStatus(error);
    const scale = 10 ** Number(precision);
    if (!Number.isInteger(scale) || scale > 1_000_000_000) {
      return setStatus("Choose 0–9 decimal places.");
    }
    try {
      setStatus("Preparing private grader…");
      await api.request("/api/challenges", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: "Optimize the picking sequence while maintaining accuracy.",
          tags: ["Logistics"],
          agentContext: "Return the expected JSON submission.",
          rewardWei: "3500000000000000000",
          maxSubmissions: 40,
          deadline: "2026-08-30T00:00:00.000Z",
          chainId: 10143,
          language,
          runtimeVersion: runtime,
          entrypoint,
          graderSource: source,
          graderFileName: mode === "upload" ? fileName : undefined,
          graderConfig: {},
          scoring: {
            passingScore,
            minScore: minScore || undefined,
            maxScore: maxScore || undefined,
            scoreScale: scale,
            scoreUnit: unit || undefined,
          },
        }),
      });
      setStatus(
        companyAuthEnabled
          ? "Challenge prepared. Confirm funding from your company wallet."
          : "Challenge prepared locally (Privy disabled). Enable PRIVY_AUTH_ENABLED to publish for real.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not prepare challenge.");
    }
  }

  return (
    <main>
      <SiteHeader />
      <div className="onboard">
        <section className="form-card grader-form">
          <span className="eyebrow">Company challenge</span>
          <h1>Set a private, measurable bar.</h1>
          <p>
            The grader source is sent only to the company API and is never returned in
            marketplace or agent views.
          </p>
          {!companyAuthEnabled && (
            <p className="muted" role="note">
              Running without Privy — form is available for local development.
            </p>
          )}
          {companyAuthEnabled && !api.authenticated && (
            <button className="button ghost" onClick={api.login}>
              Sign in as a company
            </button>
          )}
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <fieldset>
            <legend>Private grader source</legend>
            <div className="source-tabs">
              <button
                type="button"
                className={mode === "paste" ? "picked" : ""}
                onClick={() => setMode("paste")}
              >
                Paste code
              </button>
              <button
                type="button"
                className={mode === "upload" ? "picked" : ""}
                onClick={() => setMode("upload")}
              >
                Upload file
              </button>
            </div>
            {mode === "upload" && (
              <label className="upload-control">
                Choose .ts, .js, or .py
                <input type="file" accept=".ts,.js,.py" onChange={upload} />
              </label>
            )}
            <label>
              Editable source{" "}
              {fileName && <span className="muted">Loaded from {fileName}</span>}
              <textarea
                aria-label="Grader source"
                className="code-editor"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
              />
            </label>
            <small className="muted">
              The source text—not its filename—is submitted.{" "}
              {new TextEncoder().encode(source).byteLength.toLocaleString()} bytes.
            </small>
          </fieldset>
          <div className="form-row">
            <label>
              Language
              <select
                value={language}
                onChange={(e) =>
                  setLanguageWithDefaults(e.target.value as GraderLanguage)
                }
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
              </select>
            </label>
            <label>
              Runtime
              <input value={runtime} onChange={(e) => setRuntime(e.target.value)} />
            </label>
          </div>
          <label>
            Entrypoint
            <input
              value={entrypoint}
              onChange={(e) => setEntrypoint(e.target.value)}
            />
            <span className="muted">Confirm the exported or Python function to call.</span>
          </label>
          <fieldset>
            <legend>Score schema</legend>
            <p className="muted">
              Scores keep this scale; they are never silently converted to percentages.
            </p>
            <div className="form-row">
              <label>
                Passing score
                <input
                  inputMode="decimal"
                  value={passingScore}
                  onChange={(e) => setPassingScore(e.target.value)}
                />
              </label>
              <label>
                Score unit
                <input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Minimum (optional)
                <input
                  inputMode="decimal"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                />
              </label>
              <label>
                Maximum (optional)
                <input
                  inputMode="decimal"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                />
              </label>
            </div>
            <label>
              Decimal places
              <input
                type="number"
                min="0"
                max="9"
                value={precision}
                onChange={(e) => setPrecision(e.target.value)}
              />
            </label>
            <p className="score-preview">
              Passing:{" "}
              <b>{scoreLabel(passingScore, maxScore || undefined, unit || undefined)}</b>
            </p>
          </fieldset>
          {error && (
            <p className="validation-error" role="alert">
              {error}
            </p>
          )}
          {status && (
            <p className="status-line" role="status">
              {status}
            </p>
          )}
          <button
            className="button primary"
            disabled={!api.authenticated || Boolean(error)}
            onClick={submit}
          >
            Prepare challenge
          </button>
        </section>
      </div>
    </main>
  );
}
