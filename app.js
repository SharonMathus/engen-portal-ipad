'use strict';
// Los enlaces y el JSON son publicos. El correo guardado NO autentica al usuario.
const CONFIG_URL = 'https://raw.githubusercontent.com/SharonMathus/engen-portal-config/refs/heads/main/accesos.json';
const EMAIL_KEY = 'engen_portal_ipad_email_v1';
const $ = id => document.getElementById(id);
let currentEmail = '';
let projects = [];
const show = (id, visible) => { $(id).hidden = !visible; };
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validEmail = email => /^[^\s@]+@(?:engen\.com\.mx|engeniumcapital\.com)$/i.test(email);

async function hashEmail(email) {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadProjects(email) {
  const url = `${CONFIG_URL}?t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo consultar la configuracion (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('La configuracion de accesos no es una lista valida.');
  const hash = await hashEmail(email);
  return data.filter(item => item && item.activo === true &&
    String(item.correoHash || '').toLowerCase() === hash &&
    typeof item.proyecto === 'string' && typeof item.url === 'string' &&
    /^https:\/\//i.test(item.url))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

function renderCards() {
  const cards = $('cards');
  cards.replaceChildren();
  $('menuStatus').textContent = projects.length ? '' : 'No tienes aplicaciones asignadas actualmente.';
  for (const project of projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    const top = document.createElement('span'); top.className = 'card-top';
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = project.proyecto;
    const bottom = document.createElement('span'); bottom.className = 'card-bottom';
    const caption = document.createElement('span'); caption.textContent = 'Abrir aplicación';
    const arrow = document.createElement('span'); arrow.className = 'card-arrow'; arrow.textContent = '›';
    bottom.append(caption, arrow); button.append(top, name, bottom);
    button.addEventListener('click', () => openProject(project));
    cards.append(button);
  }
}

async function enterPortal(email, remember) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) throw new Error('Ingresa un correo corporativo válido.');
  projects = await loadProjects(normalized);
  if (!projects.length) throw new Error('No hay aplicaciones activas asignadas a este correo.');
  currentEmail = normalized;
  if (remember) localStorage.setItem(EMAIL_KEY, normalized);
  $('currentEmail').textContent = normalized;
  renderCards();
  show('login', false); show('portal', true); show('menu', true); show('viewer', false);
}

function openProject(project) {
  // Safari no permite controlar los filtros internos de Power BI dentro del iframe.
  $('viewerTitle').textContent = project.proyecto;
  $('viewerHint').hidden = true;
  $('dashboardFrame').src = project.url;
  show('menu', false); show('viewer', true);
}
function backToMenu() {
  $('dashboardFrame').removeAttribute('src');
  show('viewer', false); show('menu', true);
}
function logout() {
  backToMenu();
  localStorage.removeItem(EMAIL_KEY);
  currentEmail = ''; projects = [];
  $('email').value = '';
  $('loginError').textContent = '';
  show('portal', false); show('login', true);
}

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('loginError').textContent = '';
  $('loginButton').disabled = true;
  try { await enterPortal($('email').value, true); }
  catch (error) { $('loginError').textContent = error.message || 'No fue posible ingresar.'; }
  finally { $('loginButton').disabled = false; }
});
$('backButton').addEventListener('click', backToMenu);
$('closeButton').addEventListener('click', backToMenu);
$('refreshButton').addEventListener('click', async () => {
  $('menuStatus').textContent = 'Actualizando aplicaciones…';
  try { projects = await loadProjects(currentEmail); renderCards(); }
  catch (error) { $('menuStatus').textContent = error.message || 'Error al actualizar.'; }
});

// Mantener presionado el simbolo >> durante 5 segundos para cambiar correo.
// No muestra un boton de cambio en el encabezado.
const switchButton = $('brandSwitch');
let holdTimer = null;
let holdTriggered = false;
function cancelHold() {
  if (holdTimer !== null) clearTimeout(holdTimer);
  holdTimer = null;
}
function startHold(event) {
  if (event.type === 'pointerdown' && event.button !== undefined && event.button !== 0) return;
  cancelHold();
  holdTriggered = false;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    holdTriggered = true;
    if (window.confirm('¿Quieres cambiar el correo guardado en este dispositivo?')) logout();
  }, 5000);
}
switchButton.addEventListener('pointerdown', startHold);
switchButton.addEventListener('pointerup', cancelHold);
switchButton.addEventListener('pointercancel', cancelHold);
switchButton.addEventListener('pointerleave', cancelHold);
switchButton.addEventListener('contextmenu', event => event.preventDefault());
// Acceso alternativo con teclado: mantener Enter o Espacio por 5 segundos.
switchButton.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && holdTimer === null) startHold(event);
});
switchButton.addEventListener('keyup', cancelHold);
switchButton.addEventListener('click', event => {
  if (holdTriggered) { event.preventDefault(); holdTriggered = false; }
});

(async () => {
  const saved = localStorage.getItem(EMAIL_KEY);
  if (saved) {
    try { await enterPortal(saved, false); }
    catch (error) { localStorage.removeItem(EMAIL_KEY); show('login', true); $('loginError').textContent = error.message || ''; }
  } else show('login', true);
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
