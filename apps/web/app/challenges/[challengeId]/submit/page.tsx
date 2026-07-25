"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SourceFile } from "@verity/domain";
import type { Challenge } from "@verity/sdk";
import { SiteHeader } from "@/components/site-header";
import { publicApi } from "@/lib/verity-api";

export default function Submit() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge>();
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [wallet, setWallet] = useState("");
  const [finalOutput, setFinalOutput] = useState('{"score":"1"}');
  const [status, setStatus] = useState("Connect a payout wallet and select source files.");
  const [busy, setBusy] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!apiUrl) return setStatus("API URL is not configured.");
    publicApi.GET("/api/challenges/{challengeId}", {
      params: { path: { challengeId } },
      cache: "no-store",
    })
      .then(({ data }) => {
        if (!data) throw new Error("Challenge is not available.");
        setChallenge(data as Challenge);
      })
      .catch(error => setStatus(error instanceof Error ? error.message : "Challenge is not available."));
  }, [apiUrl, challengeId]);

  async function connect() {
    const provider = window.ethereum as { request(args: { method: string; params?: unknown[] }): Promise<unknown> } | undefined;
    if (!provider) throw new Error("Install or open an EVM wallet to sign in.");
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
    const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
    if (!accounts[0] || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) throw new Error("A valid payout wallet is required.");
    setWallet(accounts[0]);
    setStatus("Payout wallet verified locally. Sign the challenge nonce to submit.");
  }

  async function chooseFiles(list: FileList | null) {
    const selected = Array.from(list ?? []);
    const sourceFiles = await Promise.all(selected.map(async file => ({
      path: file.webkitRelativePath || file.name,
      content: await file.text(),
    })));
    setFiles(sourceFiles);
  }

  async function submit() {
    const provider = window.ethereum as { request(args: { method: string; params?: unknown[] }): Promise<unknown> } | undefined;
    if (!apiUrl || !challenge || !provider || !wallet || !files.length) return;
    if (!files.some(file => file.path === challenge.publicSpec.entrypoint)) {
      return setStatus(`The source bundle must include ${challenge.publicSpec.entrypoint}.`);
    }
    setBusy(true);
    try {
      const parsedOutput = JSON.parse(finalOutput);
      setStatus("Requesting a challenge-bound payout-wallet nonce…");
      const { data: nonceBody } = await publicApi.POST("/api/challenges/{challengeId}/wallet-nonces", {
        params: { path: { challengeId } },
      });
      if (!nonceBody?.nonce || !nonceBody.message) throw new Error("Could not request wallet nonce.");

      setStatus("Sign the payout-wallet verification message…");
      const signature = await provider.request({
        method: "personal_sign",
        params: [nonceBody.message, wallet],
      }) as string;

      setStatus("Uploading source files and queueing isolated grading…");
      const { data: body } = await publicApi.POST("/api/challenges/{challengeId}/submissions", {
        params: { path: { challengeId } },
        body: {
          payload: { sourceFiles: files, language: challenge.publicSpec.language, finalOutput: parsedOutput, artifacts: [] },
          nonce: nonceBody.nonce,
          signature,
        },
      });
      if (!body?.submission) throw new Error("Submission failed.");
      router.push(`/submissions/${body.submission.id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed.");
      setBusy(false);
    }
  }

  return (
    <main>
      <SiteHeader />
      <div className="submit">
        <Link href={`/challenges/${challengeId}`} className="back">← {challenge?.title ?? "Challenge"}</Link>
        <span className="eyebrow">Verified-wallet submission</span>
        <h1>Upload the source you want graded.</h1>
        <p>No wallet means no submission. The signature binds this challenge and payout address; it does not authorize a transaction.</p>
        <label>
          Source files
          <input type="file" multiple onChange={event => void chooseFiles(event.target.files)} />
          <span className="muted">{files.length ? files.map(file => file.path).join(", ") : `Must include ${challenge?.publicSpec.entrypoint ?? "the declared entrypoint"}`}</span>
        </label>
        <label>Final output (JSON)<textarea className="solution" value={finalOutput} onChange={event => setFinalOutput(event.target.value)} /></label>
        <div className="wallet-card">
          <span>Payout wallet</span>
          <b>{wallet ? `${wallet.slice(0, 8)}…${wallet.slice(-6)}` : "Not connected"}</b>
          <small>This exact recovered address receives any passing payout.</small>
        </div>
        <button className="button ghost" type="button" onClick={() => void connect().catch(error => setStatus(error instanceof Error ? error.message : "Wallet connection failed."))}>
          {wallet ? "Wallet connected" : "Sign in with payout wallet"}
        </button>
        <button className="button primary" disabled={busy || !challenge || !wallet || files.length === 0} onClick={submit}>
          {busy ? "Submitting…" : "Sign & submit"}
        </button>
        <p className="status-line" role="status">{status}</p>
      </div>
    </main>
  );
}
