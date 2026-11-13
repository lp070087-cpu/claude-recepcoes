"use strict";

const form = document.querySelector("#reservation");
const error = document.querySelector("#form-error");
const confirmation = document.querySelector("#booking-confirmation");
const submit = form.querySelector("button[type=submit]");
const date = form.elements.namedItem("date");
let requestId;

function setMinimumDate() {
  date.min = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Recife" }).format(new Date());
}

setMinimumDate();
form.addEventListener("input", () => { error.hidden = true; requestId = undefined; });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  try {
    requestId ??= crypto.randomUUID();
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), requestId })
    });
    const result = await response.json();
    if (!response.ok || !result.protocol) throw new Error(result.error || "O envio não foi concluído.");
    document.querySelector("#booking-protocol").textContent = result.protocol;
    form.hidden = true;
    confirmation.hidden = false;
    confirmation.focus();
  } catch (failure) {
    error.textContent = failure instanceof TypeError || failure instanceof SyntaxError
      ? "Não conseguimos conectar ao sistema. Confira a conexão e tente novamente."
      : failure.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
    form.removeAttribute("aria-busy");
  }
});

document.querySelector("#new-booking").addEventListener("click", () => {
  form.reset();
  requestId = undefined;
  error.hidden = true;
  confirmation.hidden = true;
  form.hidden = false;
  setMinimumDate();
  form.elements.namedItem("name").focus();
});
