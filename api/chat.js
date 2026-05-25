// /api/chat.js
// Claire — assistante de réception pour cabinets dentaires
// Architecture edge, réponses toujours en 200 (dégradation gracieuse).
// Le prompt produit exactement le parcours montré sur la page :
// accueil → qualification en quelques questions → récupération du contact
// → niveau d'urgence → transmission au cabinet. Jamais de diagnostic.

import { getCabinet } from './cabinets.js';

export const config = {
runtime: 'edge',
};

// Webhook Make : reçoit la demande patient une fois qu'elle est complète
// (nom + téléphone récupérés), puis Make l'enregistre dans Supabase et
// envoie l'email de notification au cabinet.
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/4vdfghgpuamgmm2o2xrdyt51ueo2gyll';

// Détecte un numéro de téléphone français dans un texte (au moins 10 chiffres)
function findPhone(text) {
const cleaned = String(text || '').replace(/[\s.\-()]/g, '');
const match = cleaned.match(/(?:\+33|0)\d{9}/);
return match ? match[0] : null;
}

function systemPromptApiKey() {
return process.env.ANTHROPIC_API_KEY;
}

// Extrait les infos structurées de la conversation puis envoie à Make.
// Ne bloque jamais la réponse au patient : tout échec est silencieux côté patient.
async function extractAndSend(conversationText, phone, cabinetId, apiKey) {
let nom = '';
let motif = '';
let date_souhaitee = '';
let urgence = '';

try {
const extraction = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'content-type': 'application/json',
'x-api-key': apiKey,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001',
max_tokens: 300,
temperature: 0,
system:
"Tu extrais les informations d'une conversation entre un patient et l'assistante d'un cabinet dentaire. " +
"Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact : " +
'{"nom":"", "motif":"", "date_souhaitee":"", "urgence":""}. ' +
"Règles : 'nom' = le nom/prénom du patient s'il est donné, sinon vide. " +
"'motif' = la raison de la demande en une phrase courte. " +
"'date_souhaitee' = la disponibilité ou préférence de rendez-vous si mentionnée (ex: 'matin', 'cette semaine'), sinon vide. " +
"'urgence' = 'élevée', 'moyenne' ou 'faible' selon la gravité décrite. Ne mets jamais de diagnostic.",
messages: [{ role: 'user', content: conversationText }],
}),
});

if (extraction.ok) {
const exData = await extraction.json();
const raw = exData?.content?.[0]?.text?.trim() || '{}';
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (jsonMatch) {
const parsed = JSON.parse(jsonMatch[0]);
nom = parsed.nom || '';
motif = parsed.motif || '';
date_souhaitee = parsed.date_souhaitee || '';
urgence = parsed.urgence || '';
}
}
} catch (err) {
console.error('Extraction infos echouee (non bloquant):', err);
}

// Envoi à Make avec les champs correspondant exactement aux colonnes Supabase
try {
await fetch(MAKE_WEBHOOK_URL, {
method: 'POST',
headers: { 'content-type': 'application/json' },
body: JSON.stringify({
nom: nom,
telephone: phone,
motif: motif,
"date souhaitee": date_souhaitee,
urgence: urgence,
cabinet: cabinetId,
conversation: conversationText,
}),
});
} catch (err) {
console.error('Envoi Make echoue (non bloquant):', err);
}
}

function buildSystemPrompt(cabinetId) {
const c = getCabinet(cabinetId);

return `Tu es Claire, l'assistante de réception du ${c.nom} (à ${c.adresse}).

# QUI TU ES
- Tu accueilles les patients qui écrivent au cabinet, comme le ferait une secrétaire expérimentée, calme et bienveillante.
- Tu n'es PAS un médecin. Tu n'es PAS là pour soigner. Tu es là pour accueillir, comprendre la demande, et la transmettre au cabinet.
- Tu ne dis jamais que tu es une intelligence artificielle. Si on te le demande, tu réponds simplement que tu es l'assistante du cabinet.

# TON UNIQUE MISSION
Pour chaque patient, tu suis ce parcours, dans l'ordre, sans le réciter :
1. ACCUEILLIR avec une phrase courte et chaleureuse.
2. COMPRENDRE le besoin en posant 1 à 3 questions utiles maximum (jamais plus).
3. RÉCUPÉRER le nom et un numéro de téléphone pour que le cabinet puisse rappeler.
4. ÉVALUER le niveau d'urgence (sans poser de diagnostic).
5. CONCLURE en confirmant que tu transmets la demande au cabinet, avec l'action suivante claire.

# RÈGLES ABSOLUES — NE JAMAIS LES ENFREINDRE
1. Tu ne poses JAMAIS de diagnostic, même approximatif ("c'est peut-être une carie/un abcès" est INTERDIT).
2. Tu ne donnes JAMAIS de médicament, de dosage, ni de conseil de traitement.
3. Pour une douleur ou un symptôme : 3 questions maximum, puis tu récupères le contact et tu transmets.
4. Urgence vitale (saignement abondant qui ne s'arrête pas, difficulté à respirer, gonflement du visage avec fièvre élevée, perte de connaissance) → tu invites IMMÉDIATEMENT à appeler le 15. En dehors des heures, tu peux aussi donner la garde dentaire : ${c.gardeDentaire}.
5. Tu réponds UNIQUEMENT sur ce qui concerne le cabinet (rendez-vous, douleurs, horaires, accès, tarifs courants, déroulé d'un soin). Toute autre demande : tu recadres poliment.
6. Tu n'inventes JAMAIS un tarif précis. Seuls sont connus : consultation ${c.consultation}, détartrage ${c.detartrage}. Pour le reste : "le tarif est précisé en consultation, après examen".
7. Tu restes BRÈVE : 2 à 3 phrases par réponse, jamais de pavé.
8. Tu termines TOUJOURS par une action claire ou une question précise.

# COMMENT RÉCUPÉRER LE CONTACT (important)
Dès que le besoin est compris (surtout pour une douleur ou un rendez-vous), tu demandes naturellement :
"Pour que le cabinet puisse vous recontacter, puis-je avoir votre nom et un numéro où vous joindre ?"
Une fois que tu as le nom + le numéro, tu confirmes la transmission et tu t'arrêtes là (tu ne poses pas de question supplémentaire inutile).

# STYLE
- Français naturel, doux, humain. Vouvoiement toujours.
- Phrases courtes. Pas de jargon. Pas de "n'hésitez pas" automatique. Pas de "je suis désolée" répété.
- Varie tes formulations, ne sois jamais robotique.
- Reste rassurante sans minimiser ce que ressent le patient.

# CONTEXTE DU CABINET
- Nom : ${c.nom}
- Adresse : ${c.adresse}
- Horaires : ${c.horaires}
- Téléphone : ${c.telephone}
- Soins / spécialités : ${c.specialites}
- Garde dentaire (soir/week-end) : ${c.gardeDentaire}
- Urgence vitale : 15 (ou 112)

# EXEMPLES DU TON ATTENDU

Patient : "J'ai une douleur à une dent depuis hier soir."
Toi : "Je comprends, ce n'est pas agréable. Pour bien transmettre au cabinet : la douleur est-elle constante, et avez-vous remarqué un gonflement ou de la fièvre ?"

Patient : "C'est constant et la joue est un peu gonflée."
Toi : "Merci pour ces précisions. Le mieux est que le cabinet vous rappelle en priorité. Puis-je avoir votre nom et un numéro où vous joindre ?"

Patient : "Sophie Marin, 06 12 34 56 78."
Toi : "C'est noté, Sophie. Je transmets votre demande au cabinet comme prioritaire, ils vous rappellent dès que possible. Si la douleur devient très intense ou s'accompagne de fièvre forte, contactez le 15."

Patient : "Quels sont vos horaires ?"
Toi : "Le cabinet est ouvert ${c.horaires}. Souhaitez-vous que je prépare une demande de rendez-vous pour vous ?"

Patient : "Combien coûte un détartrage ?"
Toi : "Un détartrage est ${c.detartrage}. Pour le reste, le tarif est précisé en consultation. Voulez-vous que je transmette une demande de rendez-vous ?"

Patient : "Vous faites des facettes ?"
Toi : "Le cabinet propose plusieurs soins esthétiques ; le praticien évalue ce qui convient lors d'un rendez-vous. Souhaitez-vous que je prépare une demande pour vous ?"

# RAPPEL
Tu es Claire, l'assistante du ${c.nom}. Tu accueilles, tu qualifies en quelques questions, tu récupères le contact, tu transmets. Jamais de diagnostic. Toujours une action à la fin.`;
}

export default async function handler(req) {
if (req.method !== 'POST') {
return new Response(JSON.stringify({ error: 'Method not allowed' }), {
status: 405,
headers: { 'content-type': 'application/json' },
});
}

try {
const body = await req.json();
const { messages, cabinetId } = body || {};
const id = cabinetId || 'demo';

// Pas de messages → message d'accueil
if (!Array.isArray(messages) || messages.length === 0) {
return new Response(
JSON.stringify({
reply:
"Bonjour ! Je suis Claire, l'assistante du cabinet. Comment puis-je vous aider aujourd'hui ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Historique borné + nettoyé
const recentMessages = messages
.slice(-12)
.map((m) => ({
role: m.role === 'assistant' ? 'assistant' : 'user',
content: String(m.content || '').slice(0, 600),
}))
.filter((m) => m.content.length > 0);

if (recentMessages.length === 0) {
return new Response(
JSON.stringify({
reply: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Clé API absente → dégradation gracieuse (jamais d'erreur brute)
if (!process.env.ANTHROPIC_API_KEY) {
console.error('ANTHROPIC_API_KEY manquante');
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté technique de mon côté. Vous pouvez contacter directement le cabinet, on vous répondra avec plaisir.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

const systemPrompt = buildSystemPrompt(id);

// Timeout réseau pour ne jamais laisser le patient attendre indéfiniment
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 25000);

let response;
try {
response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'content-type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001',
max_tokens: 220,
temperature: 0.5,
system: systemPrompt,
messages: recentMessages,
}),
signal: controller.signal,
});
} finally {
clearTimeout(timeout);
}

if (!response.ok) {
const errorText = await response.text().catch(() => '');
console.error('Erreur Claude API:', response.status, errorText);
return new Response(
JSON.stringify({
reply:
"Je rencontre une petite difficulté à l'instant. Pouvez-vous reformuler votre question, ou réessayer dans un instant ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

const data = await response.json();
const reply =
data?.content?.[0]?.text?.trim() ||
"Je peux vous aider pour un rendez-vous, une douleur, les horaires ou une question sur le cabinet. Que souhaitez-vous ?";

// Transmission au cabinet : si le patient a laissé un numéro de téléphone,
// la demande est "complète" → on extrait les infos et on les envoie à Make.
const patientMessages = recentMessages
.filter((m) => m.role === 'user')
.map((m) => m.content)
.join(' ');
const phone = findPhone(patientMessages);

if (phone) {
// On demande à Claire d'extraire les infos en JSON structuré,
// pour remplir proprement les colonnes Supabase (nom, motif, etc.).
const conversationText = recentMessages
.map((m) => (m.role === 'user' ? 'Patient: ' : 'Claire: ') + m.content)
.join('\n');

extractAndSend(conversationText, phone, id, systemPromptApiKey());
}

return new Response(JSON.stringify({ reply, cabinetId: id }), {
status: 200,
headers: { 'content-type': 'application/json' },
});
} catch (err) {
const aborted = err && err.name === 'AbortError';
console.error('Erreur fonction chat:', err);
return new Response(
JSON.stringify({
reply: aborted
? "Le serveur a mis trop de temps à répondre. Pouvez-vous réessayer ?"
: "Je rencontre une difficulté technique. Vous pouvez contacter directement le cabinet, on vous répondra avec plaisir.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}
}

