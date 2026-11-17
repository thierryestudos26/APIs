export function validarProduto(corpo) {
  if (
    !corpo ||
    typeof corpo.nome !== "string" ||
    !corpo.nome.trim() ||
    corpo.nome.trim().length > 100
  ) {
    return "O nome deve conter entre 1 e 100 caracteres.";
  }

  if (
    typeof corpo.preco !== "number" ||
    !Number.isFinite(corpo.preco) ||
    corpo.preco < 0
  ) {
    return "O preço deve ser um número maior ou igual a zero.";
  }

  return null;
}

export function extrairProduto(corpo) {
  return {
    nome: corpo.nome.trim(),
    preco: corpo.preco
  };
}

