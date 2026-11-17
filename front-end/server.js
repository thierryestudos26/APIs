import express from "express";
import { fileURLToPath } from "node:url";

const app = express();

const portas = {
  simples: Number(process.env.CLIENTES_PORT || 3001),
  rest: Number(process.env.PRODUTOS_PORT || 3002),
  restful: Number(process.env.PEDIDOS_PORT || 3003)
};

app.disable("x-powered-by");
app.disable("etag");

app.use("/api", express.raw({
  type: () => true,
  limit: "16kb"
}));

app.use("/api/:servico", async (req, res) => {
  const servico = req.params.servico;

  if (!Object.hasOwn(portas, servico)) {
    return res.status(404).json({ erro: "Serviço não encontrado." });
  }

  const prefixo = "/api/" + servico;

  function enderecoPublico(endereco) {
    return typeof endereco === "string" &&
      endereco.startsWith("/") &&
      !endereco.startsWith("//")
      ? prefixo + endereco
      : endereco;
  }

  function adaptarLinks(valor) {
    if (Array.isArray(valor)) {
      return valor.map(adaptarLinks);
    }

    if (valor && typeof valor === "object") {
      return Object.fromEntries(
        Object.entries(valor).map(([chave, conteudo]) => [
          chave,
          chave === "href"
            ? enderecoPublico(conteudo)
            : adaptarLinks(conteudo)
        ])
      );
    }

    return valor;
  }

  try {
    const cabecalhos = {};

    if (req.headers["content-type"]) {
      cabecalhos["Content-Type"] = req.headers["content-type"];
    }

    const resposta = await fetch(
      "http://127.0.0.1:" + portas[servico] + req.url,
      {
        method: req.method,
        headers: cabecalhos,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : req.body?.length
            ? req.body
            : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(5000)
      }
    );

    res.status(resposta.status);
    res.set("Cache-Control", "no-store");

    const localizacao = resposta.headers.get("location");

    if (localizacao) {
      res.set("Location", enderecoPublico(localizacao));
    }

    const permitido = resposta.headers.get("allow");

    if (permitido) {
      res.set("Allow", permitido);
    }

    const links = resposta.headers.get("link");

    if (links) {
      res.set(
        "Link",
        links.replace(/<([^>]+)>/g, (_, uri) => {
          return "<" + enderecoPublico(uri) + ">";
        })
      );
    }

    const tipo = resposta.headers.get("content-type");

    if (tipo) {
      res.set(
        "Content-Type",
        tipo.replace(
          /profile="([^"]+)"/g,
          (_, uri) => 'profile="' + enderecoPublico(uri) + '"'
        )
      );
    }

    if (
      req.method === "HEAD" ||
      resposta.status === 204 ||
      resposta.status === 304
    ) {
      return res.end();
    }

    const texto = await resposta.text();

    if (servico === "restful" && tipo?.includes("application/json")) {
      return res.end(JSON.stringify(adaptarLinks(JSON.parse(texto))));
    }

    res.end(texto);
  } catch (erro) {
    console.error(erro);

    res.status(502).json({
      erro: "Não foi possível acessar a API. Verifique se ela está ligada."
    });
  }
});

app.use(
  express.static(
    fileURLToPath(new URL("./public", import.meta.url))
  )
);

app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

app.use((erro, req, res, next) => {
  if (res.headersSent) {
    return next(erro);
  }

  const status = erro.type === "entity.too.large" ? 413 : 500;

  res.status(status).json({
    erro: status === 413
      ? "Corpo da requisição muito grande."
      : "Erro interno do front-end."
  });
});

const porta = Number(process.env.PORT || 3000);

const servidor = app.listen(porta, "127.0.0.1", () => {
  console.log("Front-end: http://localhost:" + porta);
});

servidor.on("error", (erro) => {
  console.error("Erro ao iniciar o front-end:", erro.message);
  process.exit(1);
});

function encerrar() {
  servidor.close(() => process.exit(0));
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
