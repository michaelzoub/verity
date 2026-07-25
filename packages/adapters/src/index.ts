import type { ChallengeRecord, Company, GradingJob, IndexerCheckpoint, Submission, WalletNonce } from "@verity/domain";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export interface ChallengeRepository { saveChallenge(challenge: ChallengeRecord): Promise<void>; getChallenge(id: string): Promise<ChallengeRecord | undefined>; }
export interface SubmissionRepository { saveSubmission(submission: Submission): Promise<void>; getSubmission(id: string): Promise<Submission | undefined>; countForChallenge(challengeId: string): Promise<number>; }
export interface JobQueue { enqueue(job: GradingJob): Promise<void>; dequeue(): Promise<GradingJob | undefined>; }
export interface ObjectStore { putObject(key: string, body: string | Uint8Array, privateObject?: boolean): Promise<void>; getObject(key: string): Promise<Uint8Array>; }
export interface CheckpointStore { get(key: string): Promise<IndexerCheckpoint | undefined>; put(key: string, checkpoint: IndexerCheckpoint): Promise<void>; }
export interface GraderRunner { grade(input: unknown): Promise<{ outcome: string; scoreBasisPoints?: number }>; }
export class MemoryStore implements ChallengeRepository, SubmissionRepository, JobQueue, ObjectStore, CheckpointStore {
  challenges = new Map<string, ChallengeRecord>(); companies = new Map<string, Company>(); submissions = new Map<string, Submission>(); jobs: GradingJob[] = []; objects = new Map<string, Uint8Array>(); checkpoints = new Map<string, IndexerCheckpoint>(); walletNonces = new Map<string, WalletNonce>();
  async saveChallenge(c: ChallengeRecord) { this.challenges.set(c.id, c); } async getChallenge(id: string) { return this.challenges.get(id); }
  async saveCompany(c: Company) { this.companies.set(c.id, c); }
  async saveSubmission(s: Submission) { this.submissions.set(s.id, s); } async countForChallenge(id: string) { return [...this.submissions.values()].filter(s => s.challengeId === id).length; }
  async getSubmission(id: string) { return this.submissions.get(id); } async dequeue() { return this.jobs.find(j => j.status === "queued" || j.status === "retry"); } async enqueue(j: GradingJob) { this.jobs.push(j); }
  async saveWalletNonce(nonce: WalletNonce) { this.walletNonces.set(nonce.nonce, nonce); } async getWalletNonce(nonce: string) { return this.walletNonces.get(nonce); }
  async putObject(key: string, body: string | Uint8Array) { this.objects.set(key, typeof body === "string" ? new TextEncoder().encode(body) : body); } async getObject(key: string) { return this.objects.get(key) ?? new Uint8Array(); }
  async get(key: string) { return this.checkpoints.get(key); } async put(key: string, c: IndexerCheckpoint) { this.checkpoints.set(key, c); }
}

/** Durable local adapter used by dev:infra and E2E; production can replace this behind the same interfaces. */
export class JsonFileStore extends MemoryStore {
  constructor(private readonly file = process.env.VERITY_DB_FILE ?? ".verity/data.json") { super(); }
  async load() { try { const d = JSON.parse(await readFile(this.file, "utf8")); for (const c of d.challenges ?? []) this.challenges.set(c.id, c); for (const c of d.companies ?? []) this.companies.set(c.id, c); for (const s of d.submissions ?? []) this.submissions.set(s.id, s); this.jobs.push(...(d.jobs ?? [])); for (const n of d.walletNonces ?? []) this.walletNonces.set(n.nonce, n); for (const [k, v] of Object.entries(d.checkpoints ?? {})) this.checkpoints.set(k, v as IndexerCheckpoint); } catch {} }
  async flush() { await mkdir(dirname(this.file), { recursive: true }); await writeFile(this.file, JSON.stringify({ challenges: [...this.challenges.values()], companies: [...this.companies.values()], submissions: [...this.submissions.values()], jobs: this.jobs, walletNonces: [...this.walletNonces.values()], checkpoints: Object.fromEntries(this.checkpoints) }, null, 2)); }
  override async saveChallenge(c: ChallengeRecord) { await super.saveChallenge(c); await this.flush(); }
  async saveCompany(c: Company) { this.companies.set(c.id, c); await this.flush(); }
  override async saveSubmission(s: Submission) { await super.saveSubmission(s); await this.flush(); }
  override async enqueue(j: GradingJob) { await super.enqueue(j); await this.flush(); }
  override async saveWalletNonce(n: WalletNonce) { await super.saveWalletNonce(n); await this.flush(); }
  override async put(key: string, c: IndexerCheckpoint) { await super.put(key, c); await this.flush(); }
}
