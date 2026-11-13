"use strict";

const key = "cb-cadastro-pendente";
const access = document.querySelector("[data-access]");
let pending;
try { pending=JSON.parse(sessionStorage.getItem(key)); } catch { /* Login is still available. */ }

async function post(path,data) {
  const response=await fetch("/api/cliente/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const result=await response.json();
  if (!response.ok) throw new Error(result.error || "Tente novamente.");
}
function bind(form,action) {
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=form.querySelector("button");
    const feedback=form.querySelector("[data-feedback]");
    button.disabled=true;
    feedback.textContent="";
    try { await action(Object.fromEntries(new FormData(form))); }
    catch (error) { feedback.textContent=error instanceof TypeError ? "Confira sua conexão e tente novamente." : error.message; }
    finally { button.disabled=false; }
  });
}
if (access) {
  const button=access.querySelector("button[type=submit]");
  const password=access.elements.namedItem("password");
  const switchButton=access.querySelector("[data-switch-login]");
  function display(create) {
    access.querySelectorAll("[data-login]").forEach(label=>{ label.hidden=create; label.querySelector("input").disabled=create; });
    access.querySelector("[data-account-email]").textContent=create ? "Seu acesso ficará vinculado a "+pending.email+"." : "";
    password.autocomplete=create ? "new-password" : "current-password";
    button.textContent=create ? "Criar senha e acessar" : "Entrar";
    switchButton.hidden=!create;
  }
  let creating=Boolean(pending?.protocol);
  if (creating) {
    access.elements.namedItem("email").value=pending.email;
    access.elements.namedItem("protocol").value=pending.protocol;
  }
  display(creating);
  switchButton.addEventListener("click",()=>{creating=false;display(false);});
  access.hidden=false;
  bind(access,async(data)=>{
    await post(creating ? "criar-senha" : "entrar",creating ? {...pending,password:data.password} : data);
    sessionStorage.removeItem(key);
    location.reload();
  });
}
for (const form of document.querySelectorAll("[data-reply]")) bind(form,async({reply})=>{
  await post("responder",{reply,protocol:form.dataset.protocol});
  form.querySelector("[data-feedback]").textContent="Resposta salva.";
});
document.querySelector("[data-logout]")?.addEventListener("click",async(event)=>{
  try { await post("sair",{}); location.reload(); }
  catch { event.target.textContent="Tentar sair novamente"; }
});
