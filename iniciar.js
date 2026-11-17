import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const servicos = [
  ["api-simples/server.js", 3001],
  ["api-rest/server.js", 3002],
  ["api-restful/server.js", 3003],
  ["front-end/server.js", 3000]
];

const processos = [];
let encerrando = false;

function encerrar(codigo = 0) {
  if (encerrando) {
    return;
  }

  encerrando = true;
  process.exitCode = codigo;

  for (const processo of processos) {
    if (processo.exitCode === null) {
      processo.kill("SIGTERM");
    }
  }
}

for (const [arquivo, porta] of servicos) {
  const processo = spawn(
    process.execPath,
    [fileURLToPath(new URL(arquivo, import.meta.url))],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: String(porta)
      }
    }
  );

  processos.push(processo);

  processo.on("error", (erro) => {
    console.error("Falha ao iniciar " + arquivo, erro.message);
    process.exitCode = 1;
  });

  processo.on("exit", (codigo) => {
    if (!encerrando) {
      console.error("O serviço " + arquivo + " foi encerrado.");
      process.exitCode = codigo || 1;
    }
  });
}

process.on("SIGINT", () => encerrar());
process.on("SIGTERM", () => encerrar());
