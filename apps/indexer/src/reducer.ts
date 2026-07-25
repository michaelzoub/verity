import type { CheckpointStore } from "@verity/adapters";
import type { IndexerCheckpoint } from "@verity/domain";
export type ChainEvent = { kind: "ChallengeCreated" | "SubmissionFinalized"; id: string; blockNumber: number; blockHash: string; logIndex: number; payload: Record<string, unknown> };
export class IdempotentIndexer { constructor(private readonly checkpoints: CheckpointStore, private readonly seen = new Set<string>()) {}
  async consume(key: string, events: ChainEvent[], onEvent: (event: ChainEvent) => Promise<void>) { const checkpoint = await this.checkpoints.get(key); for (const event of events.sort((a,b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)) { const eventKey = `${event.blockHash}:${event.logIndex}`; if (checkpoint && event.blockNumber <= checkpoint.blockNumber) continue; if (this.seen.has(eventKey)) continue; await onEvent(event); this.seen.add(eventKey); await this.checkpoints.put(key, { chainId: 0, contractAddress: key, blockNumber: event.blockNumber, blockHash: event.blockHash, updatedAt: new Date().toISOString() } satisfies IndexerCheckpoint); } }
}
