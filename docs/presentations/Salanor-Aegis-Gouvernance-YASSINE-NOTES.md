# Notes orateur · Salanor Aegis · Présentation Yassine

**Fichier :** `Salanor-Aegis-Gouvernance.pptx`  
**Durée :** 20 à 25 minutes (dont 10 min démo si live)  
**Ton :** concret, rassurant, jamais « partenaire de conception »

**Phrase à faire retentir :**  
*« Quand l'argent ou les dossiers clients bougent à la vitesse machine, qui a autorisé quoi, avec quelle règle, et pouvez-vous le prouver sans reconstruire cinq systèmes ? »*

---

## Slide 1 · Titre (~1 min)

Bonjour à tous. Merci à M. Yassine pour cette introduction.

Je m'appelle **Landry Bougang Fotso**, fondateur de **Salanor**, basé à **Kigali**.

Aujourd'hui je vous présente **Aegis** : la couche de contrôle et de preuve sur les opérations sensibles en banque et en assurance.

En une phrase : virements, sinistres, KYC, limites. Qui a autorisé l'action, avec quelle règle, et comment le prouver à l'audit ?

Ce n'est pas une présentation abstraite. Je vous montre comment bloquer, faire approuver, tracer et exporter une preuve vérifiable.

---

## Slide 2 · Pourquoi maintenant (~2 min)

**C'est la slide la plus importante. Ouvrez toujours par le POURQUOI.**

Vos équipes automatisent déjà. Ou vont le faire avec l'IA : virements, sinistres, KYC, changements de limites.

Le risque n'est pas la vitesse. Le risque, c'est l'absence de preuve quand un contrôleur, le conseil ou le régulateur demande : *qui a autorisé quoi ?*

Les logs disent qu'il s'est passé quelque chose. Ils ne disent pas **quelle règle** s'appliquait, ni **quel responsable nommé** a validé.

**Aegis** impose les règles **avant** l'exécution. Si la règle l'exige, un humain approuve ou refuse. Chaque étape est enregistrée dans un registre signé que vous exportez pour l'audit.

**Ce que vous gagnez :** vous pouvez lancer l'automatisation **sans** que chaque projet meure en comité risque faute de preuve.

Quand l'argent bouge à la vitesse machine, la question est toujours la même : qui a autorisé, sous quelle règle, et pouvez-vous le prouver sans reconstruire cinq systèmes ?

---

## Slide 3 · Le problème (~1,5 min)

En banque : virements au-dessus d'un plafond, changements de limite, KYC, ordres vers un système de paiement.

En assurance : règlements sinistre, changements de garanties, dossiers à enjeu, transmissions réglementaires.

Le point de friction n'est pas « faut-il automatiser ? ». C'est déjà en cours.

Le point de friction, c'est **l'audit après coup** et **la responsabilité**.

Quand l'audit demande qui a validé quoi, la réponse est souvent un mélange de journaux, de tickets, parfois de messages internes. Rien qui forme une **chaîne unique et vérifiable**.

Il manque : règle, décision humaine si requise, exécution, horodatage vérifiable.

---

## Slide 4 · Vos systèmes fonctionnent (~1,5 min)

**Réponse directe à : « Nos systèmes n'ont pas de problème, qu'est-ce que ça apporte ? »**

Si tout fonctionne aujourd'hui, tant mieux. **Aegis n'est pas un correctif d'incident.**

La question concerne **demain** : copilote IA, script métier, orchestration. **Qui autorise** avant que le core banking ou le SI sinistres exécute ?

Un système stable, sans registre signé des approbations, veut dire un audit reconstruit en **semaines**, pas en **heures**.

**Ce que vous gagnez :** vous pouvez dire **oui** aux projets d'automatisation parce que la preuve existe **avant** le prochain contrôle.

Vous êtes en avance sur la stabilité. Aegis est la couche qui permet d'ajouter l'IA et l'automatisation **sans parier l'institution**.

**Ne dites jamais :** « votre système est cassé. »  
**Dites :** « vous êtes stables aujourd'hui ; voici la couche pour demain. »

---

## Slide 5 · Ce que vous gagnez (~1 min)

Quatre gains concrets :

1. **Accélérer sans peur** : l'automatisation n'est plus bloquée systématiquement par le comité risque.  
2. **Répondre vite à l'audit** : trace signée + export en heures, pas en semaines.  
3. **Responsabilité claire** : approbateur nommé, règle appliquée, historique complet.  
4. **Déploiement concret** : un flux critique en 4 à 8 semaines, résultat mesurable.

Ils doivent sentir qu'ils **gagnent** quelque chose. Pas qu'ils vous aident à valider un produit.

---

## Slide 6 · Automatisation maîtrisée (~1,5 min)

**Une seule offre. Pas deux produits.**

Automatisation seule : rapide, mais aveugle et risqué.

Gouvernance seule : sûr, mais lent et difficile à scaler.

**Salanor Aegis :** règles + approbation + trace signée **sur le flux que vous automatisez**.

Salanor peut intégrer n8n, vos APIs, vos scripts internes. Aegis encadre chaque action sensible **dès le premier jour**.

**Phrase :** *« Nous ne vendons pas l'automatisation d'un côté et la gouvernance de l'autre. Nous vendons l'automatisation que le comité risque peut accepter. »*

---

## Slide 7 · Positionnement (~1,5 min)

Aegis se place **avant** l'exécution d'une action sensible.

Ce n'est **pas** un core banking, un moteur AML, ni un SIEM. Vous gardez vos systèmes métier.

C'est une couche de gouvernance et de preuve autour de vos flux : API, orchestration, scripts.

**Clés :** en production, modèle **BYOK** (clé privée chez vous). En orchestrateur (n8n), pont **Workflow Bridge** sans clé privée dans l'outil. C'est ce qu'on montre souvent en démo.

*« Aegis ne remplace pas vos systèmes. Il empêche le mauvais mouvement et laisse une preuve que vous pouvez montrer. »*

---

## Slide 8 · Ce que vous déployez (~1,5 min)

**Vous gardez :** core banking, SI sinistres, SIEM, AML, vos équipes, vos processus.

**Salanor ajoute :** règles avant action sensible, approbation nommée, alertes, trace signée, export audit.

**Intégration :** n8n, Make, HTTP, SDK TypeScript / Python / Go.

**Critère de succès (répétez-le) :**  
*« Déploiement sur **un** flux critique en 4 à 8 semaines. Succès = **votre** audit valide la preuve **sans** Salanor dans la salle. »*

---

## Slide 9 · Limites par client (~2 min)

**Réponse directe à l'objection : « le plafond doit dépendre du client, pas d'un montant générique »**

**Aujourd'hui (livré) :**
- Seuils par **montant** et par **type d'action** (ex. virement > X → approbation)  
- **Contexte client complet** visible par l'approbateur : compte, bénéficiaire, segment  
- Plusieurs politiques actives en parallèle  

**Phase 2 (déploiement avec vous) :**
- Règles par **segment client**, type de compte, liste bénéficiaires  
- Champs métier de **votre** core dans la condition de règle  

**Phase 3 (si vous le souhaitez) :**
- Modèle de risque sur **vos** données pour recommander le plafond par client  
- Le scoring reste chez vous ou se construit en cadrage avec vos équipes risque  

**Phrase honnête :**  
*« Nous ne prétendons pas avoir votre modèle de risque aujourd'hui. Nous fournissons la couche d'exécution et de preuve. La personnalisation par client se mappe avec vos équipes paiement et risque. »*

**En salle :**  
*« Aujourd'hui le contrôle est au niveau action + montant + humain informé du contexte client. La personnalisation fine est la prochaine étape naturelle du déploiement. »*

---

## Slide 10 · Fonctionnement (~1 min)

Quatre étapes :

1. **Raccorder** le flux (n8n, SDK, APS-1)  
2. **Appliquer** la règle : autoriser, refuser, ou exiger approbation  
3. **Enregistrer** : registre signé, lots de témoin  
4. **Exporter** : console, vérification, bundle audit  

Pas de refonte applicative. On encadre ce qui existe déjà.

---

## Slide 11 · Démonstration (~10 min si live)

**Scénario :** workflow tente un virement de **2 500 USD**. Règle : au-delà de **1 000 USD**, approbation humaine.

Sans gouvernance : le virement part dès que le workflow s'exécute.

Avec Aegis : le flux s'arrête. L'approbateur voit montant, bénéficiaire, contexte. **Sans approbation, pas de virement.**

**Enchaînement :**
1. Console → Approbations → historique APPROVED  
2. Console → Traces → relecture étape par étape  
3. Relancer n8n → blocage → approbation live (si réseau OK)  
4. Console → Exports → bundle + hash  

**Phrase clôture démo :**  
*« La question n'est plus "est-ce que ça a tourné ?". C'est "est-ce qu'un humain autorisé l'a, avec quelle règle, et pouvez-vous le prouver à un auditeur ?" »*

Même mécanique pour sinistre, KYC, changement de limite.

---

## Slide 12 · Approbation et audit (~1,5 min)

Séparer **« proposé par le système »** et **« autorisé par une personne »**.

Alertes : e-mail, Slack, PagerDuty, SMS.

Approbateur identifié, horodaté, trace unique. Refus ou expiration : l'opération ne s'exécute pas.

**Exports :** bundle par période, hash d'intégrité, correspondance SOC 2 et EU AI Act (aide documentaire, **pas** certification Salanor).

*« Vos auditeurs reçoivent un dossier structuré. Vous gagnez du temps. Vous ne remplacez pas leur jugement. »*

---

## Slide 13 · Offre de déploiement (~1,5 min)

**4 à 8 semaines · un flux · une preuve mesurable**

- **Périmètre :** un processus (virement, sinistre, KYC, limite)  
- **Livré :** règles, approbations, registre, formation, export audit  
- **Plateforme :** Team à partir de 299 USD / mois  
- **Setup :** forfait selon complexité  

**Succès :** une opération sensible, approuvée par un humain nommé, vérifiable par **votre** équipe risque ou audit.

Pas d'engagement pluriannuel pour commencer. **Un flux, une preuve, une décision.**

**Ne dites jamais :** partenaire de conception, aidez-nous à valider, nous sommes en early stage.

---

## Slide 14 · Prochaine étape (~1 min)

**Cette slide remplace l'ancienne « Discussion ».** Yassine partage le deck sans vous dans la salle : il faut un appel à l'action clair.

**Ce que vous dites (ou ce que le lecteur comprend) :**

Une question, un cas concret, ou envie d'en savoir plus ? Prenons rendez-vous.

**Trois formats proposés :**

1. **15 minutes** : présentation courte, réponses à vos questions, aperçu console ou démo live  
2. **45 minutes** : cadrage avec ops, risque ou IT. Un flux sensible, les règles, les approbateurs, le critère de succès  
3. **Sur demande** : exemple d'export audit, fiche une page, démo sur un scénario banque ou assurance  

**Phrase de clôture :**  
*« Contactez-moi directement ou via M. Yassine. Nous fixons un créneau et repartons avec un périmètre clair si un déploiement a du sens pour vous. »*

**En présentiel (si vous présentez vous-même) :**  
Ne quittez pas la salle sans proposer une date. *« Est-ce qu'un appel de 45 minutes la semaine prochaine avec les personnes risque et paiement vous conviendrait ? »*

**Questions à garder en tête pour l'appel (pas sur la slide) :**
- Quel flux sensible vous coûte le plus cher en audit aujourd'hui ?  
- Qui doit valider un déploiement côté conformité, risque ou IT ?

---

## Slide 15 · Contact (~1 min)

Merci pour votre temps. Merci encore à M. Yassine.

**Landry Bougang Fotso** · Salanor Ltd · Kigali  
www.salanor.com · app.salanor.com · contact@salanor.com

Je reste disponible pour une intro ou une démo live de 15 minutes si un contact est intéressé.

---

## Objections fréquentes

**« Le plafond doit être par client, pas générique »**  
→ Slide 9. Honnête sur aujourd'hui + phase 2 + phase 3.

**« Nos systèmes fonctionnent bien »**  
→ Slide 4. Pas une panne. Gouvernance pour demain + preuve avant le prochain contrôle.

**« Pourquoi pas notre SIEM ? »**  
→ Le SIEM agrège les logs **après** coup. Aegis intervient **avant** l'action et lie règle, approbation et exécution en une trace signée. Complémentaire.

**« Êtes-vous certifié SOC 2 ? »**  
→ Non aujourd'hui. Les exports incluent une correspondance de contrôles. Le déploiement sert à prouver la valeur sur **votre** flux.

**« C'est de l'IA ? »**  
→ Le flux peut inclure des étapes automatisées ou de l'IA. Aegis encadre les opérations sensibles et enregistre qui les a autorisées.

---

## Email pour Yassine (avec la pièce jointe)

**Objet :** Présentation Salanor Aegis · gouvernance et automatisation maîtrisée (banque / assurance)

Bonjour Yassine,

Comme convenu, voici la présentation à partager avec vos contacts banque, assurance et fintech.

**En une phrase :** quand l'automatisation ou l'IA touche l'argent ou les dossiers clients, Aegis impose règles, approbation humaine si nécessaire, et preuve signée exportable, sans remplacer le core banking ni le SI sinistres.

**Ce que le client gagne :**
- Lancer ou accélérer l'automatisation sans peur du comité risque  
- Répondre à l'audit en heures (trace + export), pas en semaines  
- Un déploiement concret sur un flux en 4 à 8 semaines  

Je reste disponible pour une intro ou une démo live (15 min) si un contact est intéressé.

Merci encore pour la mise en relation.

Landry
