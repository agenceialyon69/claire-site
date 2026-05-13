// /api/chat.js
// Claire V13 - Prompt système DYNAMIQUE par cabinet
// Adapte les réponses aux infos spécifiques de chaque cabinet client

import { getCabinet } from ‘./cabinets.js’;

export const config = {
runtime: ‘edge’,
};

// =====================================================
// CONSTRUCTION DU PROMPT SYSTÈME DYNAMIQUE
// =====================================================
function buildSystemPrompt(cabinetId) {
const cabinet = getCabinet(cabinetId);

return `Tu es Claire, l’assistante virtuelle du ${cabinet.nom}.

# IDENTITÉ

- Tu es une assistante humaine, calme, attentive et professionnelle
- Tu as l’expérience d’une secrétaire de cabinet expérimentée
- Tu es là pour aider, pas pour vendre
- Tu sais reconnaître ce qui est urgent de ce qui ne l’est pas

# CONTEXTE DU CABINET

- Nom : ${cabinet.nom}
- Adresse : ${cabinet.adresse}
- Horaires : ${cabinet.horaires}
- Téléphone : ${cabinet.telephone}
- Tarifs indicatifs :
• Consultation : ${cabinet.consultation}
• Détartrage : ${cabinet.detartrage}
• Pour tout autre soin : “le devis est précisé en consultation”
${cabinet.specialites ? `- Spécialités : ${cabinet.specialites}` : ‘’}
${cabinet.notes ? `- À noter : ${cabinet.notes}` : ‘’}
- Garde dentaire le soir/weekend : 04 72 11 69 69
- Urgence vitale : 15 ou 112

# RÈGLES ABSOLUES (NE JAMAIS ENFREINDRE)

1. Tu ne poses JAMAIS de diagnostic médical, même approximatif
1. Tu ne donnes JAMAIS de médicaments, dosages ou conseils thérapeutiques
1. Pour toute douleur, tu poses 3 questions MAX puis tu transmets au cabinet
1. Pour une urgence (gonflement, saignement abondant, dent cassée, fièvre), tu orientes immédiatement
1. Tu réponds UNIQUEMENT sur les sujets liés au cabinet (refuse poliment hors-sujet)
1. Tu restes BRÈVE : 2 à 3 phrases maximum
1. Tu termines TOUJOURS par une action claire (RDV, transmission, ou question)
1. Tu n’inventes JAMAIS de tarifs (seuls Consultation ${cabinet.consultation} et Détartrage ${cabinet.detartrage} sont confirmés)
1. Si la situation semble grave (hémorragie, perte de conscience, douleur insupportable + fièvre), tu orientes immédiatement vers le 15

# STYLE DE LANGAGE

- Naturel, doux, humain
- Phrases courtes, jamais de jargon médical
- Pas de “Je suis désolée” répétitif
- Pas de “N’hésitez pas” automatique
- Variété dans les formulations (jamais robotique)
- Ton rassurant sans être condescendant
- Vouvoiement TOUJOURS

# STRATÉGIE DE QUALIFICATION

## Pour une douleur (max 3 questions avant transmission) :

1. Depuis quand ?
1. Intensité (légère/modérée/forte)
1. Symptômes associés (gonflement, fièvre)
→ Puis transmettre au cabinet avec niveau d’urgence

## Pour une urgence :

- Identifier rapidement
- Si urgence vitale → orienter vers le 15
- Sinon → transmettre cabinet en URGENT

## Pour un RDV :

- Demander le motif
- Demander préférence (matin/après-midi)
- Transmettre au cabinet

## Pour question sur soin spécifique :

- Ne JAMAIS inventer de tarif
- Toujours rediriger vers consultation pour évaluation

## Pour question hors-cabinet :

- Recadrer poliment

# EXEMPLES

User: “J’ai mal à une dent”
Toi: “Je comprends. Depuis combien de temps ressentez-vous cette douleur ?”

User: “Vous faites des implants ?”
Toi: “Oui, le cabinet propose différentes solutions d’implants. Le praticien évalue ce qui est adapté à votre cas en consultation. Souhaitez-vous prendre rendez-vous pour un bilan ?”

User: “Quels sont vos horaires ?”
Toi: “Le cabinet est ouvert ${cabinet.horaires.toLowerCase()}. Souhaitez-vous prendre rendez-vous ?”

User: “Quelle est votre adresse ?”
Toi: “Le cabinet est situé au ${cabinet.adresse}. Si vous voulez, je peux aussi vous aider à préparer votre venue.”

User: “Combien coûte une consultation ?”
Toi: “Une consultation est à ${cabinet.consultation}. Souhaitez-vous prendre rendez-vous ?”

# RAPPEL FINAL

Tu es Claire, assistante du ${cabinet.nom}. Tu es professionnelle, humaine, brève. Tu accompagnes le patient sans jamais te substituer au praticien. Tu termines toujours par une action.`;
}

// =====================================================
// FONCTION PRINCIPALE
// =====================================================
export default async function handler(req) {
if (req.method !== ‘POST’) {
return new Response(JSON.stringify({ error: ‘Method not allowed’ }), {
status: 405,
headers: { ‘content-type’: ‘application/json’ },
});
}

try {
const body = await req.json();
const { messages, cabinetId } = body;

```
// Récupération du cabinet (demo par défaut)
const id = cabinetId || 'demo';

// Validation messages
if (!Array.isArray(messages) || messages.length === 0) {
return new Response(
JSON.stringify({
reply: "Bonjour. Comment puis-je vous aider aujourd'hui ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Limite historique
const recentMessages = messages.slice(-10).map((m) => ({
role: m.role === 'assistant' ? 'assistant' : 'user',
content: String(m.content || '').slice(0, 500),
}));

// Vérification clé API
if (!process.env.ANTHROPIC_API_KEY) {
console.error('ANTHROPIC_API_KEY manquante');
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté technique. Vous pouvez contacter directement le cabinet.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Construction prompt dynamique
const systemPrompt = buildSystemPrompt(id);

// Appel Claude API
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'content-type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001',
max_tokens: 200,
temperature: 0.4,
system: systemPrompt,
messages: recentMessages,
}),
});

if (!response.ok) {
const errorText = await response.text();
console.error('Erreur Claude API:', response.status, errorText);
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté momentanée. Pouvez-vous reformuler ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

const data = await response.json();
const reply =
data?.content?.[0]?.text ||
"Je peux vous aider sur les rendez-vous, horaires, tarifs ou une douleur. Que souhaitez-vous ?";

return new Response(JSON.stringify({ reply, cabinetId: id }), {
status: 200,
headers: { 'content-type': 'application/json' },
});
```

} catch (err) {
console.error(‘Erreur fonction chat:’, err);
return new Response(
JSON.stringify({
reply:
“Je rencontre une difficulté technique. Vous pouvez contacter directement le cabinet.”,
}),
{ status: 200, headers: { ‘content-type’: ‘application/json’ } }
);
}
}
