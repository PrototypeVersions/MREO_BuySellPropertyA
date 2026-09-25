import {loadScenario,namespace} from "./demo-store.js";
let saved;try{saved=loadScenario(localStorage,namespace(location.pathname));}catch{}
if(saved){
  const panel=document.createElement("section");panel.className="demo-resume";
  const text=document.createElement("p");text.textContent="Continue your saved "+saved.perspective+" demonstration. Your property story stays connected across all four areas.";
  const link=document.createElement("a");link.className="primary-button button-blue";link.textContent="Resume demonstration →";link.href="demo-case.html?run="+encodeURIComponent(saved.id)+"&view="+encodeURIComponent(saved.lastView||"auction");
  panel.append(text,link);document.querySelector(".experience-grid").before(panel);
}
