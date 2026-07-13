const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  currentRows: [],
  currentHeaders: [],
  deferredPrompt: null,
  stats: JSON.parse(localStorage.getItem("logicStats") || '{"answered":0,"correct":0,"tables":0,"history":[],"answers":{}}')
};

const questions = [
  {
    id: 1,
    topic: "conectivos",
    statement: "A proposição p → q é falsa em qual situação?",
    options: ["p e q são verdadeiras", "p é falsa e q é verdadeira", "p é verdadeira e q é falsa", "p e q são falsas"],
    answer: 2,
    explanation: "A condicional só é falsa quando o antecedente é verdadeiro e o consequente é falso: V → F = F."
  },
  {
    id: 2,
    topic: "equivalencias",
    statement: "Qual expressão é logicamente equivalente a p → q?",
    options: ["p ∧ q", "¬p ∨ q", "p ∨ ¬q", "¬p ∧ q"],
    answer: 1,
    explanation: "A equivalência clássica da condicional é p → q ≡ ¬p ∨ q."
  },
  {
    id: 3,
    topic: "negacao",
    statement: "A negação de “João estuda e Maria trabalha” é:",
    options: ["João não estuda e Maria não trabalha", "João não estuda ou Maria não trabalha", "João estuda ou Maria trabalha", "João não estuda, mas Maria trabalha"],
    answer: 1,
    explanation: "Pela Lei de De Morgan, ¬(p ∧ q) ≡ ¬p ∨ ¬q."
  },
  {
    id: 4,
    topic: "classificacao",
    statement: "A fórmula p ∨ ¬p é classificada como:",
    options: ["Contradição", "Contingência", "Tautologia", "Equivalência"],
    answer: 2,
    explanation: "p ∨ ¬p é sempre verdadeira, independentemente do valor de p. Portanto, é uma tautologia."
  },
  {
    id: 5,
    topic: "conectivos",
    statement: "Na bicondicional p ↔ q, o resultado é verdadeiro quando:",
    options: ["p é sempre verdadeira", "q é sempre falsa", "p e q possuem valores diferentes", "p e q possuem o mesmo valor lógico"],
    answer: 3,
    explanation: "A bicondicional é verdadeira quando as duas proposições têm valores iguais."
  },
  {
    id: 6,
    topic: "negacao",
    statement: "A negação de “Se estudo, então passo” é:",
    options: ["Não estudo e não passo", "Estudo e não passo", "Não estudo ou passo", "Se não estudo, então não passo"],
    answer: 1,
    explanation: "A negação de p → q é p ∧ ¬q. Logo: estudo e não passo."
  },
  {
    id: 7,
    topic: "equivalencias",
    statement: "A contrapositiva de “Se trabalho, então recebo” é:",
    options: ["Se não trabalho, então não recebo", "Se não recebo, então não trabalho", "Se recebo, então trabalho", "Trabalho e não recebo"],
    answer: 1,
    explanation: "A contrapositiva de p → q é ¬q → ¬p."
  },
  {
    id: 8,
    topic: "classificacao",
    statement: "A fórmula p ∧ ¬p é classificada como:",
    options: ["Tautologia", "Contradição", "Contingência", "Bicondicional"],
    answer: 1,
    explanation: "Uma proposição não pode ser simultaneamente verdadeira e falsa. Assim, p ∧ ¬p é sempre falsa."
  }
];

function saveStats() {
  localStorage.setItem("logicStats", JSON.stringify(state.stats));
  updateStats();
}

function normalizeFormula(input) {
  return input
    .replace(/\s+/g, "")
    .replace(/~/g, "¬")
    .replace(/!/g, "¬")
    .replace(/&/g, "∧")
    .replace(/\^/g, "∧")
    .replace(/\|/g, "∨")
    .replace(/v/gi, (m, offset, str) => {
      const prev = str[offset - 1] || "";
      const next = str[offset + 1] || "";
      return /[a-z]/i.test(prev + next) ? m : "∨";
    })
    .replace(/<->|<=>/g, "↔")
    .replace(/->|=>/g, "→");
}

function tokenize(expression) {
  const tokens = [];
  const validVars = /^[a-z]$/i;
  let i = 0;

  while (i < expression.length) {
    const char = expression[i];
    if (validVars.test(char)) {
      tokens.push(char.toLowerCase());
      i++;
    } else if (["¬", "∧", "∨", "→", "↔", "⊻", "(", ")"].includes(char)) {
      tokens.push(char);
      i++;
    } else {
      throw new Error(`Símbolo inválido: "${char}"`);
    }
  }
  return tokens;
}

const precedence = { "¬": 5, "∧": 4, "⊻": 3, "∨": 3, "→": 2, "↔": 1 };
const rightAssociative = new Set(["¬", "→"]);

function toRPN(tokens) {
  const output = [];
  const operators = [];

  for (const token of tokens) {
    if (/^[a-z]$/.test(token)) {
      output.push(token);
    } else if (token === "(") {
      operators.push(token);
    } else if (token === ")") {
      let found = false;
      while (operators.length) {
        const op = operators.pop();
        if (op === "(") {
          found = true;
          break;
        }
        output.push(op);
      }
      if (!found) throw new Error("Parênteses incompatíveis.");
    } else {
      while (
        operators.length &&
        operators.at(-1) !== "(" &&
        (
          precedence[operators.at(-1)] > precedence[token] ||
          (precedence[operators.at(-1)] === precedence[token] && !rightAssociative.has(token))
        )
      ) {
        output.push(operators.pop());
      }
      operators.push(token);
    }
  }

  while (operators.length) {
    const op = operators.pop();
    if (op === "(" || op === ")") throw new Error("Parênteses incompatíveis.");
    output.push(op);
  }

  return output;
}

function evalRPN(rpn, values) {
  const stack = [];

  for (const token of rpn) {
    if (/^[a-z]$/.test(token)) {
      stack.push(values[token]);
    } else if (token === "¬") {
      if (stack.length < 1) throw new Error("Negação sem proposição.");
      stack.push(!stack.pop());
    } else {
      if (stack.length < 2) throw new Error("Expressão incompleta.");
      const b = stack.pop();
      const a = stack.pop();
      const result = {
        "∧": a && b,
        "∨": a || b,
        "⊻": a !== b,
        "→": !a || b,
        "↔": a === b
      }[token];
      stack.push(result);
    }
  }

  if (stack.length !== 1) throw new Error("Expressão inválida.");
  return stack[0];
}

function generateTruthTable() {
  const raw = $("#formula").value.trim();
  $("#errorMessage").textContent = "";

  try {
    if (!raw) throw new Error("Digite uma fórmula lógica.");

    const normalized = normalizeFormula(raw);
    const tokens = tokenize(normalized);
    const variables = [...new Set(tokens.filter(t => /^[a-z]$/.test(t)))].sort();

    if (!variables.length) throw new Error("Use ao menos uma proposição: p, q, r...");
    if (variables.length > 5) throw new Error("Use no máximo 5 proposições por tabela.");

    const rpn = toRPN(tokens);
    const rows = [];
    const combinations = 2 ** variables.length;

    for (let i = 0; i < combinations; i++) {
      const values = {};
      variables.forEach((v, index) => {
        values[v] = Boolean((i >> (variables.length - index - 1)) & 1);
      });
      const result = evalRPN(rpn, values);
      rows.push({ values, result });
    }

    state.currentRows = rows;
    state.currentHeaders = [...variables, normalized];
    renderTable(variables, normalized, rows);
    classify(rows);

    state.stats.tables += 1;
    state.stats.history.unshift({
      formula: normalized,
      classification: getClassification(rows),
      date: new Date().toLocaleString("pt-BR")
    });
    state.stats.history = state.stats.history.slice(0, 10);
    saveStats();
    showToast("Tabela gerada com sucesso.");
  } catch (error) {
    $("#errorMessage").textContent = error.message;
    $("#truthTable thead").innerHTML = "";
    $("#truthTable tbody").innerHTML = "";
    $("#classification").className = "classification neutral";
    $("#classification").textContent = "Não foi possível gerar a tabela.";
  }
}

function renderTable(variables, formula, rows) {
  $("#truthTable thead").innerHTML = `<tr>${[...variables, formula].map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr>`;
  $("#truthTable tbody").innerHTML = rows.map(row => `
    <tr>
      ${variables.map(v => truthCell(row.values[v])).join("")}
      ${truthCell(row.result)}
    </tr>
  `).join("");
}

function truthCell(value) {
  return `<td class="${value ? "truth-v" : "truth-f"}">${value ? "V" : "F"}</td>`;
}

function getClassification(rows) {
  const allTrue = rows.every(r => r.result);
  const allFalse = rows.every(r => !r.result);
  if (allTrue) return "Tautologia";
  if (allFalse) return "Contradição";
  return "Contingência";
}

function classify(rows) {
  const classification = getClassification(rows);
  const el = $("#classification");
  el.className = `classification ${classification.toLowerCase().replace("ç", "c").replace("ê", "e")}`;
  el.textContent = {
    "Tautologia": "✅ Tautologia: a fórmula é verdadeira em todas as linhas.",
    "Contradição": "⛔ Contradição: a fórmula é falsa em todas as linhas.",
    "Contingência": "⚖️ Contingência: a fórmula pode ser verdadeira ou falsa."
  }[classification];
}

function copyTable() {
  if (!state.currentRows.length) return showToast("Gere uma tabela primeiro.");
  const lines = [
    state.currentHeaders.join("\t"),
    ...state.currentRows.map(row => [
      ...state.currentHeaders.slice(0, -1).map(v => row.values[v] ? "V" : "F"),
      row.result ? "V" : "F"
    ].join("\t"))
  ];
  navigator.clipboard.writeText(lines.join("\n"))
    .then(() => showToast("Tabela copiada."))
    .catch(() => showToast("Não foi possível copiar."));
}

function downloadCSV() {
  if (!state.currentRows.length) return showToast("Gere uma tabela primeiro.");
  const lines = [
    state.currentHeaders.join(";"),
    ...state.currentRows.map(row => [
      ...state.currentHeaders.slice(0, -1).map(v => row.values[v] ? "V" : "F"),
      row.result ? "V" : "F"
    ].join(";"))
  ];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tabela-verdade.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Arquivo CSV baixado.");
}

function renderQuestions(filter = "todos") {
  const filtered = filter === "todos" ? questions : questions.filter(q => q.topic === filter);

  $("#quizContainer").innerHTML = filtered.map((q, index) => {
    const saved = state.stats.answers[q.id];
    return `
      <article class="question-card" data-question-id="${q.id}">
        <span class="question-meta">${topicLabel(q.topic)} • Questão ${index + 1}</span>
        <h3>${escapeHTML(q.statement)}</h3>
        <div class="options">
          ${q.options.map((option, optionIndex) => {
            let cls = "";
            if (saved !== undefined) {
              if (optionIndex === q.answer) cls = "correct";
              else if (optionIndex === saved) cls = "wrong";
            }
            return `<button class="option ${cls}" data-option="${optionIndex}" ${saved !== undefined ? "disabled" : ""}>
              <strong>${String.fromCharCode(65 + optionIndex)})</strong>
              <span>${escapeHTML(option)}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="explanation ${saved !== undefined ? "show" : ""}">
          <strong>${saved === q.answer ? "Resposta correta." : "Resposta comentada."}</strong>
          ${escapeHTML(q.explanation)}
        </div>
      </article>
    `;
  }).join("");

  $$(".option").forEach(btn => btn.addEventListener("click", answerQuestion));
}

function answerQuestion(event) {
  const card = event.currentTarget.closest(".question-card");
  const id = Number(card.dataset.questionId);
  const question = questions.find(q => q.id === id);
  const selected = Number(event.currentTarget.dataset.option);

  if (state.stats.answers[id] !== undefined) return;

  state.stats.answers[id] = selected;
  state.stats.answered += 1;
  if (selected === question.answer) state.stats.correct += 1;
  saveStats();
  renderQuestions($("#questionFilter").value);
  showToast(selected === question.answer ? "Acertou! 🎉" : "Confira a explicação.");
}

function resetQuiz() {
  const tables = state.stats.tables;
  const history = state.stats.history;
  state.stats = { answered: 0, correct: 0, tables, history, answers: {} };
  saveStats();
  renderQuestions($("#questionFilter").value);
  showToast("Questões reiniciadas.");
}

function updateStats() {
  const rate = state.stats.answered ? Math.round((state.stats.correct / state.stats.answered) * 100) : 0;
  $("#answeredStat").textContent = state.stats.answered;
  $("#correctStat").textContent = state.stats.correct;
  $("#rateStat").textContent = `${rate}%`;
  $("#tablesStat").textContent = state.stats.tables;
  $("#progressBar").style.width = `${rate}%`;
  $("#progressText").textContent =
    state.stats.answered === 0 ? "Comece resolvendo as questões." :
    rate >= 80 ? "Excelente desempenho. Continue revisando." :
    rate >= 60 ? "Bom resultado. Revise os erros." :
    "Continue treinando as equivalências e os conectivos.";

  $("#historyList").innerHTML = state.stats.history.length
    ? state.stats.history.map(item => `
      <div class="history-item">
        <div><code>${escapeHTML(item.formula)}</code><br><small>${escapeHTML(item.classification)}</small></div>
        <small>${escapeHTML(item.date)}</small>
      </div>
    `).join("")
    : '<p class="muted">Nenhuma tabela gerada ainda.</p>';
}

function clearData() {
  if (!confirm("Deseja apagar todo o desempenho salvo neste aparelho?")) return;
  state.stats = { answered: 0, correct: 0, tables: 0, history: [], answers: {} };
  saveStats();
  renderQuestions($("#questionFilter").value);
  showToast("Dados apagados.");
}

function topicLabel(topic) {
  return {
    conectivos: "Conectivos",
    equivalencias: "Equivalências",
    negacao: "Negação",
    classificacao: "Classificação"
  }[topic];
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(t => t.classList.remove("active"));
  $$(".panel").forEach(p => p.classList.remove("active"));
  tab.classList.add("active");
  $(`#${tab.dataset.tab}`).classList.add("active");
}));

$$(".symbol").forEach(button => button.addEventListener("click", () => {
  const input = $("#formula");
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + button.dataset.symbol + input.value.slice(end);
  input.focus();
  const pos = start + button.dataset.symbol.length;
  input.setSelectionRange(pos, pos);
  $("#formulaPreview").textContent = input.value || "—";
}));

$$(".example").forEach(button => button.addEventListener("click", () => {
  $("#formula").value = button.dataset.formula;
  $("#formulaPreview").textContent = button.dataset.formula;
}));

$("#formula").addEventListener("input", e => $("#formulaPreview").textContent = e.target.value || "—");
$("#formula").addEventListener("keydown", e => {
  if (e.key === "Enter") generateTruthTable();
});
$("#generateBtn").addEventListener("click", generateTruthTable);
$("#copyBtn").addEventListener("click", copyTable);
$("#downloadBtn").addEventListener("click", downloadCSV);
$("#questionFilter").addEventListener("change", e => renderQuestions(e.target.value));
$("#resetQuizBtn").addEventListener("click", resetQuiz);
$("#clearDataBtn").addEventListener("click", clearData);

$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  localStorage.setItem("logicTheme", dark ? "dark" : "light");
  $("#themeBtn").textContent = dark ? "☀️" : "🌙";
});

if (localStorage.getItem("logicTheme") === "dark") {
  document.body.classList.add("dark");
  $("#themeBtn").textContent = "☀️";
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.deferredPrompt = event;
  $("#installBtn").classList.remove("hidden");
});

$("#installBtn").addEventListener("click", async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  $("#installBtn").classList.add("hidden");
});

window.addEventListener("appinstalled", () => showToast("Aplicativo instalado."));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch(err => console.error("Falha ao registrar service worker:", err));
  });
}

renderQuestions();
updateStats();
generateTruthTable();
