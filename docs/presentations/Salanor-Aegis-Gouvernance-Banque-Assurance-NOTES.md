# Notes orateur · Salanor Aegis · Gouvernance banque & assurance

**Présentation :** `Salanor-Aegis-Gouvernance-Banque-Assurance.html`  
**Durée totale :** 25 à 30 minutes (dont ~12 min démo live)  
**Langue :** français  
**Ton :** calme, concret, pas de jargon « IA »

Ouvrez ce fichier sur un second écran ou imprimez-le. Parlez lentement. Faites une pause après la question « qui a autorisé ? ».

---

## Slide 1 · Titre (~1 min)

Bonjour à tous, merci d'être là. Merci aussi à M. Yassine de faciliter cette introduction.

Je m'appelle **Landry Bougang Fotso**. Je suis fondateur de **Salanor**, basé à **Kigali**.

Aujourd'hui je vous présente **Aegis** : une couche de contrôle et de preuve sur les **opérations sensibles** dans les environnements régulés.

En une phrase : quand un flux automatique tente un virement, un décaissement sinistre ou une modification de dossier client, **qui a autorisé quoi, quand, et avec quelle règle** ? Et pouvez-vous **le prouver** plus tard à un auditeur ou à un comité risque ?

C'est le problème que nous adressons. Je ne vais pas vous noyer sous la technique. L'essentiel, c'est une **démo live** vers le milieu de la présentation.

---

## Slide 2 · Le problème (~2 min)

En banque et en assurance, des chaînes automatisées touchent déjà l'argent, les dossiers clients et les engagements réglementaires.

Côté banque : virements au-dessus d'un plafond, changements de limite, validation KYC, ordres vers un système de paiement.

Côté assurance : règlement de sinistre, changement de garanties en production, ouverture ou clôture de dossier à enjeu, transmission vers un régulateur.

Le point de friction n'est pas « faut-il automatiser ? ». C'est déjà en cours.

Le point de friction, c'est **l'audit après coup**.

Quand un contrôleur demande : *« Qui a autorisé ce virement un mardi à 14 h ? »*, la réponse est souvent un mélange de journaux applicatifs, de tickets, parfois de messages internes. Rien qui forme une **chaîne unique et vérifiable**.

Les fils de discussion ne suffisent pas. Les logs bruts disent qu'il s'est passé quelque chose, pas qui a validé, ni quelle règle s'appliquait.

Il manque un **registre** : règle, puis décision humaine si nécessaire, puis action exécutée, puis preuve consultable.

C'est ce que nous avons construit.

---

## Slide 3 · Positionnement (~2 min)

Aegis se place **avant** l'exécution d'une action sensible.

Une **règle** s'applique. Si la règle l'exige, un **humain nommé** approuve ou refuse. Chaque étape est **enregistrée** dans un registre signé que vous pouvez **rejouer** et **exporter** pour l'audit.

Ce n'est pas un core banking, ni un SIEM, ni un moteur AML. Vous gardez vos systèmes métier. Aegis ajoute la **gouvernance** et la **preuve** autour de vos flux (API, orchestration, scripts internes).

Trois points importants :
- Les **clés de signature** restent sous votre contrôle (modèle BYOK).
- Chaque organisation a son **registre isolé**.
- On vise la **complémentarité** avec vos outils actuels, pas le remplacement.

---

## Slide 4 · Fonctionnement (~2 min)

Le parcours tient en **quatre étapes**.

**Un.** On **raccorde** le flux existant : orchestrateur n8n, SDK développeur, ou ingestion directe du format ouvert APS-1.

**Deux.** Une **règle** s'évalue : autoriser, refuser, ou **exiger une approbation humaine** avant de continuer.

**Trois.** Chaque événement est **enregistré et signé** dans un registre append-only, avec des lots de témoin périodiques pour l'intégrité à long terme.

**Quatre.** Dans la **console**, vous **rejouez** la trace étape par étape, vous **vérifiez** cryptographiquement, et vous **exportez** un bundle pour vos équipes conformité ou audit.

Pas de refonte de l'application métier. On encadre et on prouve ce qui se passe déjà.

---

## Slide 5 · Démonstration live (~12 min)

*[Quittez le plein écran du HTML si besoin. Ouvrez app.salanor.com, onglet déjà connecté.]*

Je passe à la **démo**. C'est le cœur de la présentation.

**Scénario banque** que nous faisons tourner en sandbox : un workflow tente un **virement sortant** de 2 500 USD vers un bénéficiaire tiers. La règle active dit : au-delà de 1 000 USD, **approbation humaine requise**.

Sans gouvernance, le virement partirait dès que le workflow s'exécute.

Avec Aegis, le flux **s'arrête**. Une notification part. Un responsable ouvre la **console Salanor**, lit le montant, le compte, le bénéficiaire, et clique **Approuver** ou **Refuser**.

**Sans approbation, le virement ne part pas.**

Je vous montre maintenant.

### Préparation avant la réunion (à faire une fois)

1. Console → **Policies** : règle active sur `app.payments.transfer`, type **Max per transaction**, plafond 1 000 USD, action **Require approval** si dépassement.
2. n8n : workflow smoke test (`integrations/n8n-nodes-salanor-aegis/examples/smoke-test-with-error-trigger.json`) avec nœud **Request context** : `amount_usd: 2500`, `recipient`, `summary`.
3. Lancer une fois avant la réunion pour avoir une trace **COMPLETED** et une ligne **APPROVED** dans l'historique Approbations.

### Démo · enchaînement (suivre dans l'ordre)

1. **Console → Approbations → Historique**  
   *« Ici une demande réelle : virement 2 500 USD, bénéficiaire visible, statut Approuvé. On voit la trace, l'horodatage, qui a signé. »*

2. **Console → Traces → ouvrir une trace COMPLETED**  
   *« Chaque étape est une entrée signée : démarrage, évaluation de règle, approbation humaine, exécution. Je clique, je vois le détail. »*

3. **Relancer le workflow n8n** si réseau OK  
   *« Je relance le flux. Il bloque en attente d'approbation. Sans mon clic, rien ne part. »*  
   → Approuver live → montrer la trace qui passe à terminée.

4. **Console → Exports**  
   *« Pour l'audit : bundle exportable, période, hash d'intégrité. Ce n'est pas une certification SOC 2. C'est du matériel de preuve pour vos revues internes. »*

**Pendant la démo, dites explicitement :**  
*« Même mécanique pour un règlement sinistre, une validation KYC ou un changement de limite. On commence en pilote sur le flux qui vous fait le plus mal. »*

**Si la démo plante :**  
*« J'ai un enregistrement de secours. Le principe reste le même : blocage, approbation humaine, trace vérifiable. »*  
→ Lancer la vidéo Loom ou montrer une capture Approbations APPROVED.

**Phrase de clôture démo :**  
*« La question n'est plus "est-ce que ça a tourné ?". C'est "est-ce qu'un humain autorisé l'a, et pouvez-vous le prouver ?" »*

---

## Slide 6 · Approbation humaine (~2 min)

*[Retour aux slides si vous enchaînez après la démo. Sinon ce contenu est déjà couvert dans la démo.]*

Le point clé pour la gouvernance : séparer clairement **« proposé par le système »** et **« autorisé par une personne »**.

Les notifications peuvent partir par e-mail, Slack, PagerDuty ou SMS selon votre configuration.

L'approbateur est **nommé**, l'action est **horodatée**, liée à une **trace unique**.

Si quelqu'un refuse, ou si le délai expire : **l'opération ne s'exécute pas**.

L'historique reste : approuvé, refusé, expiré, avec la référence de la règle qui s'appliquait.

Pour un comité risque, c'est souvent plus parlant qu'un log technique de quatre pages.

---

## Slide 7 · Audit et conformité (~2 min)

Côté audit, Aegis produit des **exports** : période choisie, hash d'intégrité, contenu structuré.

Nous fournissons des **correspondances de contrôles** orientées SOC 2 et EU AI Act. C'est de l'aide documentaire pour vos revues. Je ne prétends pas que Salanor est certifié SOC 2 aujourd'hui. Nous sommes en chemin. Soyons honnêtes là-dessus.

Dans la console, la **reconstruction de trace** permet de remonter étape par étape.

Et un **journal administrateur** enregistre les actions sensibles côté plateforme : politiques, clés, connexions, exports.

L'objectif : donner à vos équipes conformité et audit quelque chose qu'ils peuvent **tenir en main**, pas seulement aux développeurs.

---

## Slide 8 · Intégration (~1,5 min)

Sur l'intégration : nous ne demandons pas de tout remplacer.

**Côté orchestration** : pont pour n8n et workflows HTTP similaires. Une clé API, des règles actives, des approbations synchrones.

**Côté développement** : SDK TypeScript, Python, Go pour évaluer les règles et ingérer des événements signés.

L'API est sur **api.salanor.com**, la console sur **app.salanor.com**. La documentation est publique.

En pratique, un pilote commence sur **un seul flux** : virement, sinistre, ou validation KYC. Celui qui fait déjà mal au comité risque.

---

## Slide 9 · Statut (~1,5 min)

Je préfère être transparent sur où nous en sommes.

Aegis est **opérationnel** : règles, approbations, registre, exports. Ce n'est pas une maquette.

Nous sommes en **phase partenaire** en 2026 : nous cherchons un petit nombre d'institutions pour co-construire sur des cas réels.

Notre feuille de route inclut le renforcement SOC 2 (cible fin 2026), mais **aujourd'hui** je vous parle de **pilote**, pas de certification acquise.

Si votre institution veut être parmi les premières sur un processus précis, c'est le bon moment pour en discuter.

---

## Slide 10 · Offre pilote (~2 min)

Proposition concrète : **pilote 30 jours, un flux, une preuve mesurable**.

**Périmètre** : un processus. Virement, sinistre, dossier KYC. Un seul pour commencer.

**Livré** : règles configurées, approbations, registre actif, formation console, au moins un export audit.

**Formule Team** : à partir de **299 dollars US par mois**, facturation sur devis ou facture selon votre entité.

**Setup** : forfait d'accompagnement selon la complexité d'intégration. Nous en discutons après avoir cadré le flux.

**Critère de succès** : une opération sensible, approuvée par un humain, que **votre** équipe audit ou risque peut vérifier sans nous tenir la main.

Pas d'engagement pluriannuel pour commencer. Un flux, une preuve, une décision.

---

## Slide 11 · Discussion (~3 min)

*[Posez les questions. Écoutez plus que vous ne parlez.]*

Quelques questions pour avancer :

- Quels **flux sensibles** posent déjà problème en audit ou en comité risque chez vous ?
- Où exigez-vous une **double validation**, et **comment** la documentez-vous aujourd'hui ?
- Un **pilote sur un seul flux** au quatrième trimestre 2026 serait-il réaliste ?
- Qui côté **conformité** ou **sécurité IT** devrait voir une démo technique plus poussée ?

*[Silence 5 secondes après chaque question. Laissez répondre.]*

---

## Slide 12 · Contact (~1 min)

Merci pour votre temps.

Je suis **Landry Bougang Fotso**, Salanor Ltd, Kigali.

Site : **www.salanor.com**, page produit **/products/aegis**.  
Console : **app.salanor.com**.  
Contact : **hello@salanor.com** ou **partners@salanor.com**.

Je peux vous envoyer le **PDF de cette présentation** et une **fiche une page** après l'échange.

Si un pilote a du sens, proposons un **appel de cadrage** de 30 minutes la semaine prochaine, avec les bonnes personnes côté risque ou IT.

Merci encore à M. Yassine pour l'introduction. Je reste disponible pour vos questions.

---

## En cas de questions difficiles

**« Êtes-vous certifié SOC 2 / PCI ? »**  
*« Non, pas aujourd'hui. Nous fournissons des exports et des correspondances de contrôles. La certification est sur la feuille de route. Le pilote sert à valider la valeur avant un engagement plus large. »*

**« Pourquoi pas notre SIEM ? »**  
*« Le SIEM agrège des logs. Aegis intervient **avant** l'action et lie règle, approbation humaine et exécution en une trace signée. Complémentaire, pas substitut. »*

**« C'est de l'IA ? »**  
*« Le flux peut inclure des étapes automatisées : tri, routage, préparation de dossier. Aegis ne juge pas le contenu métier. Il encadre et enregistre les opérations sensibles et qui les a autorisées. »*

**« Prix final ? »**  
*« Team à partir de 299 USD/mois pour la plateforme. Setup selon le flux. On chiffre après le cadrage du pilote. »*

**« Données où ? »**  
*« Hébergement cloud. Registre par organisation. Pour un pilote institutionnel, on documente localisation, accès et export. On s'aligne sur votre questionnaire sécurité. »*

**« Pourquoi un virement en démo et pas notre vrai core ? »**  
*« Le pilote branche le même mécanisme sur votre API ou orchestrateur réel. La démo montre le pattern de contrôle sur un flux sandbox pour ne pas toucher à la prod. En 30 jours on cible votre flux réel. »*

---

## Checklist avant d'entrer en salle

- [ ] Policy active : `app.payments.transfer`, max 1 000 USD → require approval
- [ ] Workflow n8n prêt (amount_usd 2500, recipient, summary)
- [ ] Console connectée, trace COMPLETED prête
- [ ] Approbations historique APPROVED visible
- [ ] Export READY ou exemple de bundle
- [ ] Loom / capture de secours
- [ ] PDF slides + leave-behind sur clé USB ou lien
- [ ] Téléphone en silencieux
- [ ] Eau

**Bonne présentation.**
