import { mkdir, readFile, writeFile } from "node:fs/promises";

const contracts = ["ChallengeEscrow", "ChallengeFactory"];
await mkdir("artifacts/contracts", { recursive: true });
for (const name of contracts) {
  const foundry = JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"));
  const artifact = {
    contractName: name,
    compiler: foundry.metadata?.compiler,
    abi: foundry.abi,
    bytecode: foundry.bytecode.object,
    deployedBytecode: foundry.deployedBytecode.object,
  };
  await writeFile(`artifacts/contracts/${name}.json`, `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(`artifacts/contracts/${name}.abi.json`, `${JSON.stringify(foundry.abi, null, 2)}\n`);
  await writeFile(`artifacts/contracts/${name}.bytecode.txt`, `${foundry.bytecode.object}\n`);
}
console.log(`Generated contract artifacts: ${contracts.join(", ")}`);
