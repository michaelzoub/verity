import type { ChallengeRecord, Company, GradingJob, IndexerCheckpoint, Submission, WalletNonce } from "@verity/domain";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

type Json = postgres.JSONValue;
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Json;

/** The only persistence implementation. Metadata/queues are Postgres; private bytes are Supabase Storage. */
export class SupabaseStore {
  challenges = new Map<string, ChallengeRecord>();
  companies = new Map<string, Company>();
  submissions = new Map<string, Submission>();
  jobs: GradingJob[] = [];
  checkpoints = new Map<string, IndexerCheckpoint>();
  walletNonces = new Map<string, WalletNonce>();
  private sql: ReturnType<typeof postgres>;
  private storage: ReturnType<typeof createClient>;

  constructor(private readonly options = {
    databaseUrl: process.env.DATABASE_URL!,
    url: process.env.SUPABASE_URL!,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    gradersBucket: process.env.SUPABASE_GRADERS_BUCKET!,
    submissionsBucket: process.env.SUPABASE_SUBMISSIONS_BUCKET!,
    artifactsBucket: process.env.SUPABASE_ARTIFACTS_BUCKET!,
  }) {
    if (!options.databaseUrl || !options.url || !options.serviceRole || !options.gradersBucket || !options.submissionsBucket || !options.artifactsBucket) {
      throw new Error("Supabase database, service role, and private bucket configuration is required");
    }
    this.sql = postgres(options.databaseUrl, { max: 4, ssl: "require" });
    this.storage = createClient(options.url, options.serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async load() {
    this.challenges.clear(); this.companies.clear(); this.submissions.clear();
    this.walletNonces.clear(); this.jobs.length = 0; this.checkpoints.clear();
    const rows = await this.sql`select kind,id,value from verity_records`;
    for (const row of rows) {
      const value = row.value as any;
      if (row.kind === "challenge") this.challenges.set(row.id, value);
      else if (row.kind === "company") this.companies.set(row.id, value);
      else if (row.kind === "submission") this.submissions.set(row.id, value);
      else if (row.kind === "nonce") this.walletNonces.set(row.id, value);
      else if (row.kind === "checkpoint") this.checkpoints.set(row.id, value);
    }
    const jobs = await this.sql`select value from verity_jobs order by created_at`;
    this.jobs.push(...jobs.map((row: any) => row.value));
  }

  private async record(kind: string, id: string, value: unknown) {
    await this.sql`
      insert into verity_records(kind,id,value) values (${kind},${id},${this.sql.json(json(value))})
      on conflict(kind,id) do update set value=excluded.value,updated_at=now()
    `;
  }
  async saveChallenge(value: ChallengeRecord) { this.challenges.set(value.id, value); await this.record("challenge", value.id, value); }
  async getChallenge(id: string) { return this.challenges.get(id); }
  async listChallenges(indexedOnly = false) {
    const rows = indexedOnly
      ? await this.sql`select id,value from verity_records where kind='challenge' and coalesce((value->>'indexed')::boolean,false) = true order by updated_at desc`
      : await this.sql`select id,value from verity_records where kind='challenge' order by updated_at desc`;
    const challenges = rows.map(row => row.value as ChallengeRecord);
    for (const challenge of challenges) this.challenges.set(challenge.id, challenge);
    return challenges;
  }
  async findChallengeByCreationKey(companyId: string, creationKey: string) {
    return [...this.challenges.values()].find(value =>
      value.companyId === companyId && value.creationKey === creationKey
    );
  }
  async saveCompany(value: Company) { this.companies.set(value.id, value); await this.record("company", value.id, value); }
  async findOrCreateCompany(candidate: Company) {
    const value = await this.sql.begin(async sql => {
      await sql`
        insert into verity_records(kind,id,value) values ('company',${candidate.id},${sql.json(json(candidate))})
        on conflict do nothing
      `;
      const rows = await sql`select value from verity_records where kind='company' and value->>'privySubject'=${candidate.privySubject} limit 1`;
      if (!rows[0]) throw new Error("company_identity_persistence_failed");
      return rows[0].value as Company;
    });
    this.companies.set(value.id, value); return value;
  }
  async saveSubmission(value: Submission) { this.submissions.set(value.id, value); await this.record("submission", value.id, value); }
  async getSubmission(id: string) { return this.submissions.get(id); }
  async saveWalletNonce(value: WalletNonce) { this.walletNonces.set(value.nonce, value); await this.record("nonce", value.nonce, value); }
  async getWalletNonce(id: string) { return this.walletNonces.get(id); }
  async get(key: string) { return this.checkpoints.get(key); }
  async put(key: string, value: IndexerCheckpoint) { this.checkpoints.set(key, value); await this.record("checkpoint", key, value); }

  async createSubmissionJob(nonceId: string, submission: Submission, job: GradingJob, maxSubmissions: number) {
    const result = await this.sql.begin(async sql => {
      const challengeRows = await sql`select value from verity_records where kind='challenge' and id=${submission.challengeId} for update`;
      const challenge = challengeRows[0]?.value as ChallengeRecord | undefined;
      if (!challenge || !challenge.indexed || challenge.status !== "live") return "challenge_not_live";
      if (Date.now() >= new Date(challenge.deadline).getTime()) return "expired";
      const nonceRows = await sql`select value from verity_records where kind='nonce' and id=${nonceId} for update`;
      const nonce = nonceRows[0]?.value as WalletNonce | undefined;
      if (!nonce || nonce.usedAt || nonce.challengeId !== submission.challengeId || Date.now() > new Date(nonce.expiresAt).getTime()) return "invalid_nonce";
      const duplicateRows = await sql`
        select id from verity_records
        where kind='submission'
          and value->>'challengeId'=${submission.challengeId}
          and lower(value->>'agentWallet')=lower(${submission.agentWallet})
          and value->>'submissionHash'=${submission.submissionHash}
        limit 1
      `;
      if (duplicateRows.length) return "duplicate";
      const countRows = await sql`select count(*)::int as count from verity_records where kind='submission' and value->>'challengeId'=${submission.challengeId}`;
      if (Number(countRows[0].count) >= maxSubmissions) return "capacity";
      nonce.usedAt = new Date().toISOString();
      await sql`update verity_records set value=${sql.json(json(nonce))},updated_at=now() where kind='nonce' and id=${nonceId}`;
      await sql`insert into verity_records(kind,id,value) values ('submission',${submission.id},${sql.json(json(submission))})`;
      await sql`insert into verity_jobs(id,value,status,created_at) values (${job.id},${sql.json(json(job))},${job.status},${job.createdAt})`;
      return "created";
    });
    if (result === "created") {
      const nonce = this.walletNonces.get(nonceId); if (nonce) nonce.usedAt = new Date().toISOString();
      this.submissions.set(submission.id, submission); this.jobs.push(job);
    }
    return result;
  }

  async dequeue() {
    const rows = await this.sql.begin(async sql => {
      await sql`
        update verity_jobs
        set status='retry', claimed_at=null,
            value=jsonb_set(
              jsonb_set(value,'{status}','"retry"'::jsonb),
              '{attempts}',to_jsonb(((value->>'attempts')::int + 1))
            )
        where status='running' and claimed_at < now() - interval '5 minutes'
      `;
      return sql`with next as (
        select id from verity_jobs where status in ('queued','retry')
        order by created_at for update skip locked limit 1
      )
      update verity_jobs j
      set status='running', claimed_at=now(), value=jsonb_set(j.value,'{status}','"running"'::jsonb)
      from next where j.id=next.id returning j.value
      `;
    });
    const job = rows[0]?.value as GradingJob | undefined;
    if (job) {
      const index = this.jobs.findIndex(value => value.id === job.id);
      if (index >= 0) this.jobs[index] = job; else this.jobs.push(job);
    }
    return job;
  }

  async updateJob(job: GradingJob) {
    const index = this.jobs.findIndex(value => value.id === job.id);
    if (index >= 0) this.jobs[index] = job;
    await this.sql`update verity_jobs set status=${job.status},claimed_at=${job.claimedAt ?? null},value=${this.sql.json(json(job))} where id=${job.id}`;
  }

  async completeJob(jobId: string, attempt: number, submission: Submission) {
    const updated = await this.sql.begin(async sql => {
      const jobs = await sql`
        update verity_jobs set status='complete',value=jsonb_set(value,'{status}','"complete"'::jsonb)
        where id=${jobId} and status='running' and (value->>'attempts')::int=${attempt}
        returning id
      `;
      if (!jobs.length) return false;
      await sql`
        insert into verity_records(kind,id,value) values ('submission',${submission.id},${sql.json(json(submission))})
        on conflict(kind,id) do update set value=excluded.value,updated_at=now()
      `;
      return true;
    });
    if (updated) {
      this.submissions.set(submission.id, submission);
      const job = this.jobs.find(value => value.id === jobId); if (job) job.status = "complete";
    }
    return updated;
  }

  async claimPayout(challengeId: string, submissionId: string) {
    const rows = await this.sql`
      insert into verity_records(kind,id,value)
      values ('payout_claim',${challengeId},${this.sql.json(json({ submissionId, claimedAt: new Date().toISOString() }))})
      on conflict(kind,id) do nothing returning id
    `;
    return rows.length === 1;
  }
  async releasePayoutClaim(challengeId: string, submissionId: string) {
    await this.sql`delete from verity_records where kind='payout_claim' and id=${challengeId} and value->>'submissionId'=${submissionId}`;
  }
  async withSettlementSignerLock<T>(operation: () => Promise<T>) {
    return this.sql.begin(async sql => {
      await sql`select pg_advisory_xact_lock(hashtext('verity:settlement-signer'))`;
      return operation();
    });
  }

  async applyIndexerEvent(event: { eventId: string; chainId: number; contractAddress: string; blockNumber: number; value: unknown }, records: { challenge?: ChallengeRecord; submission?: Submission }) {
    const inserted = await this.sql.begin(async sql => {
      const rows = await sql`
        insert into verity_indexer_events(event_id,chain_id,contract_address,block_number,value)
        values (${event.eventId},${event.chainId},${event.contractAddress},${event.blockNumber},${sql.json(json(event.value))})
        on conflict(event_id) do nothing returning event_id
      `;
      if (!rows.length) return false;
      for (const [kind, value] of [["challenge", records.challenge], ["submission", records.submission]] as const) {
        if (value) await sql`
          insert into verity_records(kind,id,value) values (${kind},${value.id},${sql.json(json(value))})
          on conflict(kind,id) do update set value=excluded.value,updated_at=now()
        `;
      }
      return true;
    });
    if (inserted) {
      if (records.challenge) this.challenges.set(records.challenge.id, records.challenge);
      if (records.submission) this.submissions.set(records.submission.id, records.submission);
    }
    return inserted;
  }

  async resetIndexerProjection(contractAddress: string, challenge: ChallengeRecord, submissions: Submission[]) {
    await this.sql.begin(async sql => {
      await sql`delete from verity_indexer_events where chain_id=${challenge.chainId} and lower(contract_address)=lower(${contractAddress})`;
      await sql`update verity_records set value=${sql.json(json(challenge))},updated_at=now() where kind='challenge' and id=${challenge.id}`;
      for (const submission of submissions) {
        await sql`update verity_records set value=${sql.json(json(submission))},updated_at=now() where kind='submission' and id=${submission.id}`;
      }
    });
    this.challenges.set(challenge.id, challenge);
    for (const submission of submissions) this.submissions.set(submission.id, submission);
  }

  private bucketFor(key: string) {
    if (key.startsWith("graders/")) return this.options.gradersBucket;
    if (key.startsWith("submissions/")) return this.options.submissionsBucket;
    return this.options.artifactsBucket;
  }
  async putObject(key: string, body: string | Uint8Array) {
    const { error } = await this.storage.storage.from(this.bucketFor(key)).upload(key, body, { upsert: false, contentType: "application/octet-stream" });
    if (error) throw error;
  }
  async getObject(key: string) {
    const { data, error } = await this.storage.storage.from(this.bucketFor(key)).download(key);
    if (error || !data) throw error ?? new Error("private_object_missing");
    return new Uint8Array(await data.arrayBuffer());
  }
  async close() { await this.sql.end(); }
}
