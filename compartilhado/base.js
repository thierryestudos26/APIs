import express from "express";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync
} from "node:fs";
import { dirname, join, basename } from "node:path";

export function criarRepositorio(arquivo) {
  if (process.env.DATA_DIR) arquivo = join(process.env.DATA_DIR, basename(arquivo));
  mkdirSync(dirname(arquivo), { recursive: true });

  let produtos = existsSync(arquivo)
    ? JSON.parse(readFileSync(arquivo, "utf8"))
    : [];

  function salvar(novosProdutos) {
    const temporario = arquivo + ".tmp";

    writeFileSync(
      temporario,
      JSON.stringify(novosProdutos, null, 2),
      "utf8"
    );

    renameSync(temporario, arquivo);
    produtos = novosProdutos;
  }

  return {
    listar() {
      return produtos;
    },

    buscar(id) {
      return produtos.find((produto) => produto.id === id);
    },

    criar(dados) {
      const produto = { id: randomUUID(), ...dados };
      salvar([...produtos, produto]);
      return produto;
    },

    atualizar(id, dados) {
      const produto = { id, ...dados };

      salvar(
        produtos.map((atual) =>
          atual.id === id ? produto : atual
        )
      );

      return produto;
    },

    excluir(id) {
      salvar(produtos.filter((produto) => produto.id !== id));
    }
  };
}

export function criarAplicacao(nome) {
  const app = express();

  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (req, res) => {
    res.json({ servico: nome, status: "online" });
  });

  return app;
}

export function iniciar(app, porta) {
  app.use((req, res) => {
    res.status(404).json({ erro: "Rota não encontrada." });
  });

  app.use((erro, req, res, next) => {
    if (res.headersSent) {
      return next(erro);
    }

    if (erro.type === "entity.parse.failed") {
      return res.status(400).json({ erro: "JSON inválido." });
    }

    if (erro.type === "entity.too.large") {
      return res.status(413).json({ erro: "Corpo muito grande." });
    }

    console.error(erro);
    res.status(500).json({ erro: "Erro interno do serviço." });
  });

  const servidor = app.listen(porta, "127.0.0.1", () => {
    console.log("Serviço disponível em http://localhost:" + porta);
  });

  servidor.on("error", (erro) => {
    console.error("Não foi possível iniciar o serviço:", erro.message);
    process.exit(1);
  });

  function encerrar() {
    servidor.close(() => process.exit(0));
  }

  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}
