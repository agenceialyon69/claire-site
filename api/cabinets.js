// /api/cabinets.js
// Base de données simple des cabinets clients
// Pour ajouter un cabinet : copie-colle un bloc et change les valeurs
// Push sur GitHub → Vercel redéploie automatiquement

export const CABINETS = {
// ====================================================
// CABINET DE DÉMO (générique - pour la page d’accueil)
// ====================================================
demo: {
nom: 'Cabinet dentaire',
adresse: '12 avenue Jean Jaurès, 69200 Vénissieux',
horaires: 'Lundi au vendredi, 9h à 19h',
consultation: '30 €',
detartrage: '60 à 90 €',
telephone: '04 78 12 34 56',
email: 'contact@claireassistante.fr',
specialites: 'Soins généraux',
notes: '',
},

// ====================================================
// EXEMPLE - À DUPLIQUER POUR CHAQUE CLIENT RÉEL
// ====================================================
'dr-test': {
nom: 'Cabinet du Dr Test',
adresse: '15 rue de la République, 69002 Lyon',
horaires: 'Lundi au vendredi 8h30-19h, samedi matin 9h-12h',
consultation: '35 €',
detartrage: '70 à 100 €',
telephone: '04 78 00 00 00',
email: 'test@example.com',
specialites: 'Endodontie, dentisterie esthétique',
notes: 'Cabinet pédiatrique le mercredi après-midi',
},

// ====================================================
// AJOUTE TES VRAIS CABINETS CI-DESSOUS
// ====================================================
// 'dr-martin': {
// nom: 'Cabinet du Dr Martin',
// adresse: '…',
// horaires: '…',
// consultation: '…',
// detartrage: '…',
// telephone: '…',
// email: '…',
// specialites: '…',
// notes: '',
// },
};

// Helper : récupère un cabinet par son ID, ou retourne le démo
export function getCabinet(id) {
return CABINETS[id] || CABINETS['demo'];
}

