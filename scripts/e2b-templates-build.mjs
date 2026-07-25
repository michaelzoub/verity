import { spawn } from "node:child_process";
const templates = [["verity-grader-typescript", "E2B_TEMPLATE_TS"], ["verity-grader-javascript", "E2B_TEMPLATE_JS"], ["verity-grader-python", "E2B_TEMPLATE_PYTHON"]];
if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
for (const [name, env] of templates) {
  await new Promise((resolve, reject) => { const child = spawn("npm", ["exec", "--", "e2b", "template", "create", "--path", `templates/${name}`, name], { stdio: "inherit", env: process.env }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`template build failed: ${name}`))); });
  console.log(`${env}=${process.env[env] ?? "<copy the real template ID printed by E2B into .env>"}`);
}
