"use strict";

const form = document.querySelector("#reservation");
const screens = [...form.querySelectorAll(".booking-screen")];
const error = document.querySelector("#form-error");
const confirmation = document.querySelector("#booking-confirmation");
const submit = form.querySelector("button[type=submit]");
const back = form.querySelector(".booking-back");
const date = form.elements.namedItem("date");
const keyName = "cb-cadastro-pendente";
let step = 0;
let attempt;

function displayStep(index, focus = true) {
  step = index;
  screens.forEach((screen,i) => { screen.disabled = screen.hidden = i !== index; });
  document.querySelector("#booking-step").textContent = "Etapa "+(index+1)+" de "+screens.length;
  submit.textContent = index === screens.length-1 ? "Enviar solicitação" : "Continuar →";
  back.hidden = index === 0;
  if (focus) screens[index].querySelector("legend").focus();
}
displayStep(0,false);
date.min = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Recife"}).format(new Date());
back.addEventListener("click",()=>displayStep(step-1));
form.addEventListener("input",()=>{ error.hidden=true; attempt=undefined; });
form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if (step < screens.length-1) return displayStep(step+1);
  error.hidden=true;
  submit.disabled=back.disabled=true;
  form.setAttribute("aria-busy","true");
  try {
    const fields = Object.fromEntries([...form.querySelectorAll("[name]")].map(field=>[field.name,field.value]));
    if (!attempt) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      attempt = {requestId:crypto.randomUUID(),accessKey:btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"")};
    }
    // Check storage before sending so the customer can always reach password setup.
    sessionStorage.setItem(keyName,JSON.stringify({...attempt,email:fields.email}));
    const response = await fetch(form.action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,...attempt})});
    const result = await response.json();
    if (!response.ok || !result.protocol) throw new Error(result.error || "O envio não foi concluído.");
    sessionStorage.setItem(keyName,JSON.stringify({...attempt,email:fields.email,protocol:result.protocol}));
    document.querySelector("#booking-protocol").textContent=result.protocol;
    form.hidden=true;
    confirmation.hidden=false;
    confirmation.focus();
  } catch (failure) {
    error.textContent = failure instanceof TypeError || failure instanceof SyntaxError
      ? "Não conseguimos conectar ao sistema. Confira a conexão e tente novamente." : failure.message;
    error.hidden=false;
  } finally {
    submit.disabled=back.disabled=false;
    form.removeAttribute("aria-busy");
  }
});
