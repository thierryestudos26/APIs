import { fileURLToPath } from "node:url";
import {
  criarAplicacao,
  criarRepositorio,
  iniciar
} from "../compartilhado/base.js";
import { registrarRotas } from "./rotas-produtos.js";

const app = criarAplicacao("API REST");

const repositorio = criarRepositorio(
  fileURLToPath(new URL("./dados/produtos.json", import.meta.url))
);

registrarRotas(app, repositorio);

iniciar(app, Number(process.env.PORT || 3002));