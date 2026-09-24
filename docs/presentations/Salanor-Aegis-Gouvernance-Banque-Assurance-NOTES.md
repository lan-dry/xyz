# Notes orateur · Salanor Aegis · Gouvernance banque & assurance

**Présentation :** `Salanor-Aegis-Gouvernance-Banque-Assurance.html`  
**Durée totale :** 25 à 30 minutes (dont ~12 min démo live)  
**Langue :** français  
**Ton :** calme, concret, pas de jargon « IA »

Ouvrez ce fichier sur un second écran ou imprimez-le. Parlez lentement. Faites une pause après la question « qui a autorisé ? ».

---

## Objectif de la réunion (gardez-le en tête)

Vous n'êtes pas là pour vendre de la technologie. Vous êtes là pour montrer **l'utilité** d'Aegis pour **leur** métier :

1. **Réduire le risque opérationnel** : une action sensible ne part pas sans règle + humain si nécessaire.  
2. **Répondre à l'audit en heures, pas en semaines** : une trace signée, un export, un nom d'approbateur.  
3. **Prouver la gouvernance** (EU AI Act, SOC 2 interne, comité risque) sans refondre le core banking ou le SI sinistres.

**Phrase à faire retentir :** *« Aegis ne remplace pas vos systèmes. Il empêche le mauvais mouvement et laisse une preuve que vous pouvez montrer. »*

**Ce qui les convainc :** la **démo live** (blocage + approbation + trace + export). Le reste prépare le terrain.

---

## Slide 1 · Titre (~1 min)

Bonjour à tous, merci d'être là. Merci aussi à M. Yassine de faciliter cette introduction.

Je m'appelle **Landry Bougang Fotso**. Je suis fondateur de **Salanor**, basé à **Kigali**.

Aujourd'hui je vous présente **Aegis** : une couche de contrôle et de preuve sur les **opérations sensibles** dans les environnements régulés.

En une phrase : quand un flux automatique tente un virement, un décaissement sinistre ou une modification de dossier client, **qui a autorisé quoi, quand, et avec quelle règle** ? Et pouvez-vous **le prouver** plus tard à un auditeur ou à un comité risque ?

Ce n'est pas une présentation produit abstraite. Dans dix minutes, je vous montre **en direct** ce qui se passe quand la règle bloque et qu'un humain doit signer.

---

## Slide 2 · Le problème (~2 min)

En banque et en assurance, des chaînes automatisées touchent déjà l'argent, les dossiers clients et les engagements réglementaires.

Côté banque : virements au-dessus d'un plafond, changements de limite, validation KYC, ordres vers un système de paiement.

Côté assurance : règlement de sinistre, changement de garanties en production, ouverture ou clôture de dossier à enjeu, transmission vers un régulateur.

Le point de friction n'est pas « faut-il automatiser ? ». C'est déjà en cours.

Le point de friction, c'est **l'audit après coup** et **la responsabilité**.

Quand un contrôleur demande : *« Qui a autorisé ce virement un mardi à 14 h ? »*, la réponse est souvent un mélange de journaux applicatifs, de tickets, parfois de messages internes. Rien qui forme une **chaîne unique et vérifiable**.

Les fils de discussion ne suffisent pas. Les logs bruts disent qu'il s'est passé quelque chose, pas **qui a validé**, ni **quelle règle** s'appliquait.

**Coût caché :** retards d'audit, stress en comité risque, blocage de nouveaux projets d'automatisation parce que personne ne veut « signer » sans preuve.

Il manque un **registre** : règle, puis décision humaine si nécessaire, puis action exécutée, puis preuve consultable.

C'est ce que nous avons construit. Et c'est ce que vous allez voir.

---

## Slide 3 · Positionnement (~2 min)

Aegis se place **avant** l'exécution d'une action sensible.

Une **règle** s'applique. Si la règle l'exige, un **humain nommé** approuve ou refuse. Chaque étape est **enregistrée** dans un registre signé que vous pouvez **rejouer** et **exporter** pour l'audit.

Ce n'est pas un core banking, ni un SIEM, ni un moteur AML. Vous gardez vos systèmes métier. Aegis ajoute la **gouvernance** et la **preuve** autour de vos flux (API, orchestration, scripts internes).

Trois points importants :

- **Séparation des pouvoirs :** le système propose, l'humain autorise quand la règle l'exige.  
- **Registre isolé par organisation**, traçabilité admin (politiques, clés, exports).  
- **Complémentarité** avec vos outils actuels, pas remplacement.

**Clés de signature (soyez précis, c'est sensible en salle) :**

- **Production / SDK / services internes :** modèle **BYOK** (Bring Your Own Key). Vous enregistrez la clé **publique** dans la console ; la clé **privée** reste chez vous (KMS, HSM, ou runtime). Salanor **vérifie**, il ne forge pas vos traces.  
- **Orchestrateurs (n8n, Zapier) :** aujourd'hui nous utilisons le **Workflow Bridge** : pas de clé privée dans l'outil d'orchestration ; Salanor signe côté serveur avec une clé dédiée chiffrée. C'est ce que vous verrez en démo.  
- **Phrase courte :** *« La démo montre le pont orchestrateur. En production sur votre cœur métier, vous gardez vos propres clés. »*

---

## Slide 4 · Fonctionnement (~2 min)

Le parcours tient en **quatre étapes**.

**Un.** On **raccorde** le flux existant : orchestrateur n8n, SDK développeur, ou ingestion directe du format ouvert APS-1.

**Deux.** Une **règle** s'évalue : autoriser, refuser, ou **exiger une approbation humaine** avant de continuer.

**Trois.** Chaque événement est **enregistré et signé** dans un registre append-only, avec des lots de témoin périodiques (environ une minute) pour l'intégrité à long terme.

**Quatre.** Dans la **console**, vous **rejouez** la trace étape par étape, vous **vérifiez** cryptographiquement, et vous **exportez** un bundle pour vos équipes conformité ou audit.

Pas de refonte de l'application métier. On encadre et on prouve ce qui se passe déjà.

**Utilité concrète :** vous pouvez dire « non » à un projet d'automatisation **avec** un filet de gouvernance, au lieu de dire « non » par peur de l'audit.

---

## Slide 5 · Démonstration live (~12 min)

*[Quittez le plein écran du HTML si besoin. Ouvrez app.salanor.com, onglet déjà connecté.]*

Je passe à la **démo**. C'est le cœur de la présentation. **Si vous ne retenez qu'une chose, que ce soit celle-ci.**

**Scénario banque** (sandbox) : un workflow tente un **virement sortant** de **2 500 USD** vers un bénéficiaire tiers. La règle active : au-delà de **1 000 USD**, **approbation humaine requise**.

Sans gouvernance, le virement partirait dès que le workflow s'exécute.

Avec Aegis, le flux **s'arrête**. Une obligation apparaît dans la console. Un responsable lit le montant, le bénéficiaire, le contexte, et clique **Approuver** ou **Refuser**.

**Sans approbation, le virement ne part pas.**

**Avant de montrer l'écran, dites :**  
*« Ici nous utilisons n8n avec le Workflow Bridge : aucune clé de signature dans l'orchestrateur. Sur votre API de paiement réelle, le même mécanisme de règle et d'approbation s'applique ; la signature peut être chez vous en BYOK. »*

### Préparation avant la réunion (à faire une fois)

1. Console → **Policies** : règle active sur `app.payments.transfer`, type **Max per transaction**, plafond **1 000 USD**, action **Require approval** si dépassement.  
2. Console → **Agents** : **Workflow Bridge activé** ; clé ingest dans n8n.  
3. n8n : workflow smoke test (`integrations/n8n-nodes-salanor-aegis/examples/smoke-test-with-error-trigger.json`), nœud **Request context** : `amount_usd: 2500`, `recipient`, `summary`.  
4. Lancer une fois avant la réunion : trace **COMPLETED** + ligne **APPROVED** dans l'historique Approbations.

### Démo · enchaînement (suivre dans l'ordre)

1. **Console → Approbations → Historique**  
   *« Voici une demande réelle déjà traitée : virement 2 500 USD, bénéficiaire visible, approbateur nommé, horodatage. Ce n'est pas un ticket perdu dans une boîte mail. »*

2. **Console → Traces → ouvrir une trace COMPLETED**  
   *« Chaque étape est une entrée signée : règle, approbation, exécution. Je clique, je vois le détail. Je peux vérifier la chaîne cryptographique. »*

3. **Relancer le workflow n8n** si réseau OK  
   *« Je relance le flux. Il bloque. Sans mon clic dans la console, rien ne part. »*  
   → Approuver live → trace qui se complète.

4. **Console → Exports**  
   *« Pour votre équipe conformité : bundle sur une période, hash d'intégrité. Aujourd'hui le ZIP inclut une **correspondance de contrôles SOC 2 et EU AI Act**. Ce n'est **pas** une certification Salanor. C'est du **matériel de preuve** pour **vos** revues. »*

**Pendant la démo, dites explicitement :**  
*« Même mécanique pour un règlement sinistre, une validation KYC ou un changement de limite. Le pilote commence sur **votre** flux le plus douloureux en audit. »*

**Si la démo plante :**  
*« J'ai un enregistrement de secours. Le principe reste : blocage, approbation humaine, trace vérifiable. »*  
→ Lancer la vidéo Loom ou montrer Approbations APPROVED + trace préparée.

**Phrase de clôture démo :**  
*« La question n'est plus "est-ce que ça a tourné ?". C'est "est-ce qu'un humain autorisé l'a, avec quelle règle, et pouvez-vous le prouver mardi prochain à un auditeur ?" »*

---

## Slide 6 · Approbation humaine (~2 min)

*[Retour aux slides si vous enchaînez après la démo. Sinon ce contenu est déjà couvert dans la démo.]*

Le point clé pour la gouvernance : séparer **« proposé par le système »** et **« autorisé par une personne »**.

Notifications : e-mail, Slack, PagerDuty ou SMS selon votre configuration.

L'approbateur est **nommé**, l'action est **horodatée**, liée à une **trace unique**.

Refus ou expiration : **l'opération ne s'exécute pas**.

L'historique reste : approuvé, refusé, expiré, avec la règle qui s'appliquait.

Pour un comité risque ou un responsable conformité, c'est souvent plus parlant qu'un log technique de quatre pages.

**Utilité assurance :** même logique pour un décaissement sinistre au-dessus d'un seuil, ou une modification de garantie en production.

---

## Slide 7 · Audit et conformité (~2 min)

Côté audit, Aegis produit des **exports** : période choisie, hash d'intégrité, contenu structuré.

**Aujourd'hui, dans les ZIP d'export :**

- **SOC 2** : correspondance de contrôles (CC6.1, CC6.6, CC7.2, CC8.1, etc.)  
- **EU AI Act** : mapping sur la traçabilité et les décisions de politique (Art. 12+)

**Quatre autres cadres** (NIST AI RMF, HIPAA, FedRAMP, ISO 42001) sont sur la **feuille de route**. Nous ne les promettons pas dans l'export aujourd'hui.

Je ne prétends **pas** que Salanor est certifié SOC 2. Nous sommes en chemin (cible fin 2026). Le pilote vous donne **des preuves exploitables maintenant**, pas un badge sur le mur.

Reconstruction interactive de trace dans la console. Journal admin : politiques, clés, connexions, exports.

**Phrase utile :** *« Vos auditeurs reçoivent un dossier structuré. Vous gagnez du temps ; vous ne remplacez pas leur jugement. »*

---

## Slide 8 · Intégration (~1,5 min)

Nous ne demandons pas de tout remplacer.

**Orchestration (n8n, Make, HTTP) :** Workflow Bridge. Une clé API ingest, règles actives, approbations synchrones. Idéal pour un pilote rapide.

**Services internes (paiement, sinistres, KYC) :** SDK TypeScript, Python, Go. Évaluation de règles + événements signés. Idéal pour le BYOK en production.

API : **api.salanor.com** · Console : **app.salanor.com** · Documentation publique.

Un pilote commence sur **un seul flux** : celui qui vous coûte le plus cher en audit ou en blocage projet.

**Utilité :** intégration en jours sur un flux, pas un programme SI de dix-huit mois.

---

## Slide 9 · Statut (~1,5 min)

Je préfère être transparent.

**Aegis est en production aujourd'hui** : règles, approbations, registre signé, witness, exports. Ce n'est pas une maquette ni une vidéo marketing.

Nous sommes en **pilote avec des partenaires de conception** : un petit nombre d'institutions finance et assurance pour co-construire sur **leurs** flux réels.

**Pourquoi travailler avec nous maintenant :**

- Vous **cadrez** le produit sur un cas métier réel (virement, sinistre, KYC).  
- Vous obtenez **priorité support** et tarification pilote.  
- Vous montrez à votre comité risque une **preuve opérationnelle** avant un appel d'offres lourd.

Feuille de route : renforcement SOC 2 (cible fin 2026). Aujourd'hui je vous parle de **pilote mesurable**, pas de certification acquise.

Si votre institution veut être parmi les premières sur un processus précis, **c'est le bon moment**.

---

## Slide 10 · Offre pilote (~2 min)

Proposition concrète : **30 jours, un flux, une preuve mesurable**.

**Périmètre :** un processus. Virement, sinistre, dossier KYC. Un seul pour commencer.

**Livré :**

- Règles configurées sur votre outil (`app.payments.transfer` ou équivalent métier)  
- Approbations opérationnelles avec notifications  
- Registre actif + au moins une trace que **votre** équipe audit peut ouvrir seule  
- Formation console (1 à 2 sessions)  
- **Un export audit** avec mapping SOC 2 / EU AI Act  

**Formule Team :** à partir de **299 USD / mois** (devis ou facture selon votre entité).

**Setup :** forfait d'accompagnement selon la complexité (orchestrateur seul vs API métier + BYOK). On chiffre après le cadrage.

**Critère de succès (non négociable) :**  
*Une opération sensible, bloquée ou approuvée par un humain nommé, avec une trace et un export que votre équipe risque ou conformité valide sans que Salanor soit dans la salle.*

Pas d'engagement pluriannuel pour commencer. **Un flux, une preuve, une décision.**

---

## Slide 11 · Discussion (~3 min)

*[Posez les questions. Écoutez plus que vous ne parlez.]*

Questions pour **les** convaincre que le pilote leur sert :

- Quel **flux sensible** vous a déjà coûté une nuit blanche en audit ou en comité risque ?  
- Où exigez-vous une **double validation** aujourd'hui, et **comment** le prouvez-vous sur papier ?  
- Si dans 30 jours vous aviez **une trace signée + un export** sur ce flux, est-ce que ça débloquerait un projet en cours ?  
- Qui côté **conformité**, **risque opérationnel** ou **IT** doit valider un pilote avec nous ?

*[Silence 5 secondes après chaque question. Laissez répondre.]*

**Clôture discussion :**  
*« Si un de ces flux ressort, je vous propose un appel de cadrage de 30 minutes la semaine prochaine avec les bonnes personnes. On repart avec un périmètre écrit et une date de démo sur **votre** cas. »*

---

## Slide 12 · Contact (~1 min)

Merci pour votre temps.

Je suis **Landry Bougang Fotso**, Salanor Ltd, Kigali.

Site : **www.salanor.com**, produit **/products/aegis**, transparence **/trust**.  
Console : **app.salanor.com**.  
Contact : **contact@salanor.com** ou **partners@salanor.com**.

Je vous envoie le **PDF** de cette présentation et la **fiche une page** après l'échange.

Si un pilote a du sens, fixons l'**appel de cadrage** avant de quitter la salle (date + participants).

Merci encore à M. Yassine pour l'introduction.

---

## En cas de questions difficiles

**« Êtes-vous certifié SOC 2 / PCI ? »**  
*« Non, pas aujourd'hui. Les exports incluent une correspondance de contrôles SOC 2 et EU AI Act. La certification est sur la feuille de route. Le pilote sert à prouver la valeur sur **votre** flux avant un engagement plus large. »*

**« BYOK : où est la clé en démo ? »**  
*« En démo n8n nous utilisons le Workflow Bridge : pas de clé privée dans n8n. En production sur vos services, vous enregistrez votre clé publique et vous signez chez vous, ou via votre KMS. Salanor vérifie ; il ne détient pas votre clé privée en BYOK. »*

**« Pourquoi pas notre SIEM ? »**  
*« Le SIEM agrège des logs **après** coup. Aegis intervient **avant** l'action et lie règle, approbation humaine et exécution en une trace signée. Complémentaire, pas substitut. »*

**« C'est de l'IA ? »**  
*« Le flux peut inclure des étapes automatisées. Aegis ne juge pas le contenu métier. Il encadre les opérations sensibles et enregistre qui les a autorisées. »*

**« Prix final ? »**  
*« Team à partir de 299 USD/mois pour la plateforme. Setup selon le flux. On chiffre après le cadrage du pilote. »*

**« Données où ? »**  
*« Hébergement cloud (UE disponible). Registre par organisation. Pour un pilote institutionnel, on documente localisation, accès et export. On s'aligne sur votre questionnaire sécurité. »*

**« Pourquoi un virement en démo et pas notre vrai core ? »**  
*« Le pilote branche le même mécanisme sur votre API ou orchestrateur réel. La démo montre le **pattern** de contrôle en sandbox. En 30 jours on cible votre flux réel. »*

**« Pourquoi travailler avec un acteur jeune ? »**  
*« Parce que vous façonnez le produit sur un cas réel, avec accès direct au fondateur, avant que ce soit figé pour des cas génériques. Le risque est limité : un flux, 30 jours, preuve mesurable. »*

---

## Checklist avant d'entrer en salle

- [ ] Policy active : `app.payments.transfer`, max 1 000 USD → require approval  
- [ ] Agent : **Workflow Bridge ON**  
- [ ] Workflow n8n prêt (`amount_usd: 2500`, recipient, summary)  
- [ ] Console connectée, trace COMPLETED prête  
- [ ] Approbations historique APPROVED visible  
- [ ] Export READY ou exemple de bundle (montrer SOC 2 + EU AI Act dans le ZIP)  
- [ ] Loom / capture de secours  
- [ ] PDF slides + leave-behind  
- [ ] Phrase BYOK vs Bridge répétée une fois à voix haute avant la démo  
- [ ] Téléphone en silencieux  
- [ ] Eau  

**Bonne présentation. La démo vend. Les slides préparent.**
