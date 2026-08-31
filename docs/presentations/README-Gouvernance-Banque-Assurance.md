# Présentation · Gouvernance banque & assurance

**Fichier :** `Salanor-Aegis-Gouvernance-Banque-Assurance.html`  
**Durée visée :** 25 à 30 min (dont ~12 min démo live)

## Ouvrir et présenter

1. Double-clic sur le fichier HTML (Chrome ou Edge).
2. **Plein écran :** `F11`
3. **Avancer :** molette, `Page Down`, ou flèche bas (une section = une slide)
4. **Slide démo :** enchaîner immédiatement sur la **démo live** (console + n8n)

## Exporter en PDF (pour envoyer à Yassine)

1. Ouvrir le HTML dans Chrome
2. `Ctrl+P` → Destination **Enregistrer au format PDF**
3. Mise en page **Paysage** recommandée
4. Cocher **Graphiques d'arrière-plan**

## Démo live · scénario banque (virement)

Slides et script orateur : **virement sortant au-dessus du plafond** (`app.payments.transfer`).

### Setup (une fois avant la réunion)

1. Console → **Policies** : règle **Max per transaction** sur `app.payments.transfer`, plafond 1 000 USD, **Require approval** si dépassement.
2. n8n : importer `integrations/n8n-nodes-salanor-aegis/examples/smoke-test-with-error-trigger.json`
3. Nœud **Request context** : `amount_usd: 2500`, `recipient`, `summary` (ex. « Virement fournisseur ACME »).
4. Lancer une fois pour avoir trace **COMPLETED** + Approbation **APPROVED** dans l'historique.

Guide détaillé : `integrations/n8n-nodes-salanor-aegis/examples/SMOKE_TEST.md` (sections 3 et 4).

### En salle (ordre)

1. Console → **Approbations** → historique APPROVED (montant, bénéficiaire)
2. Relancer workflow n8n → blocage → approbation live (ou montrer trace COMPLETED)
3. **Traces** → relecture étape par étape
4. **Exports** → bundle + hash d'intégrité

**Phrase clé :** même mécanique pour sinistre, KYC ou changement de limite. Le pilote cible leur flux réel.

## Loom de secours

Si le réseau ou n8n échoue : vidéo 2 min enregistrée à l'avance, même enchaînement (virement 2 500 USD, approbation, trace).

## Notes orateur

Script mot à mot (français) : **`Salanor-Aegis-Gouvernance-Banque-Assurance-NOTES.md`**
