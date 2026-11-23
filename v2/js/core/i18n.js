/* Textes de l'interface. La clé EST le texte anglais (langue par défaut) ;
   le fichier fr.js donne la traduction française. Exemple : t("{n} tags", { n: 12 }). */

import { FR } from "../i18n/fr.js";

let lang = "en";
try { lang = localStorage.getItem("rl2.lang") === "fr" ? "fr" : "en"; } catch (e) { /* rien */ }

export function t(key, vars) {
  let s = lang === "fr" && FR[key] ? FR[key] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
/** Singulier / pluriel : tn(3, "{n} tag", "{n} tags") */
export function tn(n, one, many) { return t(n === 1 ? one : many, { n }); }
export const getLang = () => lang;
export function setLang(l) {
  lang = l === "fr" ? "fr" : "en";
  try { localStorage.setItem("rl2.lang", lang); } catch (e) { /* rien */ }
  document.documentElement.lang = lang;
}
document.documentElement.lang = lang;
