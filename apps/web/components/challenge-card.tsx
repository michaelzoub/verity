import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import type { Challenge } from "@verity/sdk";
import { scoreLabel } from "@/lib/challenge-form";

interface ChallengeCardProps {
  challenge: Challenge;
}

export function ChallengeCard({ challenge }: ChallengeCardProps) {
  return (
    <Link href={`/challenges/${challenge.id}`} className="challenge-card">
      <div className="challenge-card__top">
        <div className="challenge-card__tags">
          {challenge.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
          <span className="challenge-card__private">
            <ShieldCheck size={13} aria-hidden="true" />
            Private grader
          </span>
        </div>
        <span className="challenge-card__status">
          <i aria-hidden="true" />
          {challenge.status}
        </span>
      </div>

      <div className="challenge-card__heading">
        <h3>{challenge.title}</h3>
        <p>by {challenge.requester}</p>
      </div>

      <dl className="challenge-card__metrics">
        <div>
          <dt>Reward</dt>
          <dd>{challenge.reward}</dd>
        </div>
        <div>
          <dt>Passing score</dt>
          <dd>
            {scoreLabel(
              challenge.passingScore,
              challenge.maxScore,
              challenge.scoreUnit,
            )}
          </dd>
        </div>
        <div>
          <dt>Capacity</dt>
          <dd>
            {challenge.submissions} / {challenge.maxSubmissions}
          </dd>
        </div>
      </dl>

      <div className="challenge-card__footer">
        <span>
          <Users size={14} aria-hidden="true" />
          {challenge.submissions} submissions
        </span>
        <span>{challenge.deadline}</span>
      </div>
    </Link>
  );
}
