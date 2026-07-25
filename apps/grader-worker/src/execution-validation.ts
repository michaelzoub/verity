import Ajv from "ajv";
import type { RequiredFunction, TrustedFunctionCall } from "@verity/domain";

export function validateTrustedExecution(
  finalOutput: unknown,
  trace: TrustedFunctionCall[],
  requiredFunctions: RequiredFunction[],
  submissionSchema: Record<string, unknown>,
) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  if (Object.keys(submissionSchema).length && !ajv.validate(submissionSchema, finalOutput)) return "SUBMISSION_INVALID" as const;
  for (let index = 0; index < trace.length; index++) {
    if (trace[index].sequence !== index) return "SUBMISSION_INVALID" as const;
  }
  const first = new Map<string, number>(), last = new Map<string, number>();
  for (const call of trace) {
    if (!first.has(call.name)) first.set(call.name, call.sequence);
    last.set(call.name, call.sequence);
  }
  for (const requirement of requiredFunctions) {
    const calls = trace.filter(call => call.name === requirement.name);
    const minimum = requirement.minCalls ?? (requirement.required ? 1 : 0);
    if (calls.length < minimum || (requirement.maxCalls !== undefined && calls.length > requirement.maxCalls)) return "SUBMISSION_INVALID" as const;
    for (const call of calls) {
      if (Object.keys(requirement.argumentsSchema).length && !ajv.validate(requirement.argumentsSchema, call.arguments)) return "SUBMISSION_INVALID" as const;
      if (Object.keys(requirement.outputSchema).length && !ajv.validate(requirement.outputSchema, call.output)) return "SUBMISSION_INVALID" as const;
    }
    for (const name of requirement.order?.after ?? []) {
      if (calls.length && last.has(name) && first.get(requirement.name)! <= last.get(name)!) return "SUBMISSION_INVALID" as const;
    }
    for (const name of requirement.order?.before ?? []) {
      if (calls.length && first.has(name) && last.get(requirement.name)! >= first.get(name)!) return "SUBMISSION_INVALID" as const;
    }
  }
  return undefined;
}
