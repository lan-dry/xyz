"""Generate French Yassine outreach deck (.pptx).

Run: python docs/presentations/build-gouvernance-yassine-deck.py

Output:
  docs/presentations/Salanor-Aegis-Gouvernance.pptx
  e:/salanor/Presentation/Yassine/Salanor-Aegis-Gouvernance.pptx (if path exists)
"""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "deck_base", ROOT / "build-automation-governance-deck.py"
)
base = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(base)

OUT_REPO = ROOT / "Salanor-Aegis-Gouvernance.pptx"
OUT_YASSINE = Path("e:/salanor/Presentation/Yassine/Salanor-Aegis-Gouvernance.pptx")


def slide_title(prs) -> None:
    slide = base.blank(prs)
    base.add_rect(slide, base.Inches(0), base.Inches(0), base.Inches(10), base.Inches(0.06), base.TEAL_DIM)
    if base.LOGO.exists():
        slide.shapes.add_picture(str(base.LOGO), base.MARGIN_L, base.Inches(0.42), width=base.Inches(0.38))
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(0.55),
        base.CONTENT_W,
        base.Inches(0.28),
        "SALANOR · CONFIDENTIEL · 2026",
        size=9,
        color=base.TEAL,
        bold=True,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(1.05),
        base.Inches(8.5),
        base.Inches(1.5),
        "Gouvernance et automatisation\nmaîtrisée pour la finance",
        size=34,
        bold=True,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(2.65),
        base.Inches(8.2),
        base.Inches(1.1),
        "Virements, sinistres, KYC, limites : règles, approbation humaine si nécessaire, "
        "preuve signée exportable. Sans remplacer le core banking ni le SI sinistres.",
        size=15,
        color=base.MUTED,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(6.35),
        base.CONTENT_W,
        base.Inches(0.35),
        "Landry Bougang Fotso · Fondateur, Salanor Ltd · Kigali",
        size=11,
        color=base.DIM,
    )
    base.add_notes(
        slide,
        "Merci à M. Yassine pour la mise en relation. En une phrase : quand l'automatisation "
        "touche l'argent ou les dossiers clients, qui a autorisé quoi, avec quelle règle, "
        "et pouvez-vous le prouver à l'audit ?",
    )


def slide_pourquoi_maintenant(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Pourquoi maintenant",
        "Une couche de gouvernance, pas seulement de l'automatisation",
    )
    base.write_bullets(
        slide,
        base.MARGIN_L,
        base.Inches(2.35),
        base.CONTENT_W,
        base.Inches(3.8),
        [
            "Vos équipes automatisent déjà, ou vont le faire avec l'IA : virements, sinistres, KYC, limites",
            "Le risque n'est pas la vitesse. C'est l'absence de preuve quand un contrôleur demande qui a autorisé quoi",
            "Les logs disent qu'il s'est passé quelque chose. Ils ne disent pas quelle règle ni quel responsable nommé",
            "Aegis : règles avant exécution, approbateur humain si requis, registre signé exportable",
            "Vous gagnez : lancer l'automatisation sans bloquer les projets en comité risque",
        ],
        size=13,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.95),
        base.CONTENT_W,
        base.Inches(0.65),
        "Quand l'argent ou les données clients bougent à la vitesse machine, le conseil et le régulateur "
        "posent une seule question : qui a autorisé, sous quelle règle, et pouvez-vous le prouver sans "
        "reconstruire cinq systèmes ?",
        size=12,
        color=base.TEAL,
        bold=True,
    )
    base.add_notes(
        slide,
        "C'est LA slide WHY. Ouvrez toute conversation avec cette question. Ne vendez pas la technologie "
        "en premier. Vendez la réponse à la question du comité risque.",
    )


def slide_probleme(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Le problème",
        "Les opérations sensibles s'accélèrent. La preuve, non.",
    )
    w = base.Inches(4.15)
    y = base.Inches(2.35)
    h = base.Inches(2.55)
    base.add_round_card(slide, base.MARGIN_L, y, w, h)
    base.write_text(
        slide,
        base.MARGIN_L + base.Inches(0.18),
        y + base.Inches(0.18),
        w - base.Inches(0.3),
        base.Inches(0.35),
        "Banque",
        size=12,
        bold=True,
        color=base.TEAL,
    )
    base.write_bullets(
        slide,
        base.MARGIN_L + base.Inches(0.18),
        y + base.Inches(0.55),
        w - base.Inches(0.3),
        base.Inches(1.8),
        [
            "Virement au-dessus d'un plafond",
            "Changement de limite ou de statut",
            "Validation KYC / LBC-FT",
            "Ordre vers un système de paiement",
        ],
        size=11,
        color=base.MUTED,
    )
    x2 = base.MARGIN_L + w + base.Inches(0.25)
    base.add_round_card(slide, x2, y, w, h)
    base.write_text(
        slide,
        x2 + base.Inches(0.18),
        y + base.Inches(0.18),
        w - base.Inches(0.3),
        base.Inches(0.35),
        "Assurance",
        size=12,
        bold=True,
        color=base.TEAL,
    )
    base.write_bullets(
        slide,
        x2 + base.Inches(0.18),
        y + base.Inches(0.55),
        w - base.Inches(0.3),
        base.Inches(1.8),
        [
            "Règlement ou décaissement sinistre",
            "Changement de garanties en production",
            "Ouverture ou clôture de dossier à enjeu",
            "Transmission vers un régulateur",
        ],
        size=11,
        color=base.MUTED,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.2),
        base.CONTENT_W,
        base.Inches(0.9),
        "Quand l'audit demande qui a validé quoi, les journaux applicatifs et les tickets ne suffisent pas. "
        "Il manque une chaîne unique : règle, décision humaine si requise, exécution, horodatage vérifiable.",
        size=12,
        color=base.MUTED,
    )
    base.add_notes(slide, "Coût caché : retards d'audit, stress en comité, projets d'automatisation bloqués.")


def slide_systemes_ok(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Vos systèmes fonctionnent",
        "Pas une panne. Une question de gouvernance pour demain.",
    )
    base.write_bullets(
        slide,
        base.MARGIN_L,
        base.Inches(2.35),
        base.CONTENT_W,
        base.Inches(3.5),
        [
            "Si tout fonctionne aujourd'hui, tant mieux. Aegis n'est pas un correctif d'incident",
            "La question est demain : copilote IA, script métier, orchestration. Qui autorise avant le core ?",
            "Un système stable sans registre signé des approbations = audit reconstruit en semaines, pas en heures",
            "Ce que vous gagnez : dire oui aux projets d'automatisation parce que la preuve existe avant le prochain contrôle",
        ],
        size=13,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.85),
        base.CONTENT_W,
        base.Inches(0.55),
        "Vous êtes en avance sur la stabilité. Aegis est la couche qui permet d'ajouter l'IA et "
        "l'automatisation sans parier l'institution.",
        size=12,
        color=base.TEAL,
        bold=True,
    )
    base.add_notes(
        slide,
        "Ne dites jamais que leur système est cassé. Validez leur stabilité. Repositionnez sur l'avenir "
        "et la preuve.",
    )


def slide_ce_que_vous_gagnez(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Ce que vous gagnez",
        "Vitesse et preuve audit en même temps",
    )
    cards = [
        ("Accélérer sans peur", "Lancer l'automatisation sans blocage systématique du comité risque"),
        ("Répondre vite à l'audit", "Trace signée + export en heures, pas en semaines de reconstruction"),
        ("Responsabilité claire", "Approbateur nommé, règle appliquée, historique complet"),
        ("Déploiement concret", "Un flux critique en 4 à 8 semaines, résultat mesurable"),
    ]
    w = base.Inches(2.05)
    gap = base.Inches(0.18)
    y = base.Inches(2.45)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(cards):
        x = base.MARGIN_L + i * (w + gap)
        base.add_round_card(slide, x, y, w, h)
        base.write_text(
            slide,
            x + base.Inches(0.15),
            y + base.Inches(0.18),
            w - base.Inches(0.25),
            base.Inches(0.55),
            head,
            size=12,
            bold=True,
            color=base.TEAL,
        )
        base.write_text(
            slide,
            x + base.Inches(0.15),
            y + base.Inches(0.78),
            w - base.Inches(0.25),
            base.Inches(1.4),
            body,
            size=11,
            color=base.MUTED,
        )
    base.add_notes(slide, "Ils doivent sentir un gain immédiat, pas qu'ils nous aident à valider un produit.")


def slide_automatisation_gouvernee(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Automatisation maîtrisée",
        "Une seule offre : automatiser ET gouverner chaque étape sensible",
    )
    cols = [
        ("Automatisation seule", "Rapide, mais aveugle et risqué"),
        ("Gouvernance seule", "Sûr, mais lent et difficile à scaler"),
        ("Salanor Aegis", "Règles + approbation + trace signée sur le flux que vous automatisez"),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.55)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(cols):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        accent = base.TEAL if i == 2 else base.MUTED
        base.write_text(
            slide,
            x + base.Inches(0.18),
            y + base.Inches(0.22),
            w - base.Inches(0.3),
            base.Inches(0.55),
            head,
            size=12,
            bold=True,
            color=accent,
        )
        base.write_text(
            slide,
            x + base.Inches(0.18),
            y + base.Inches(0.85),
            w - base.Inches(0.3),
            base.Inches(1.2),
            body,
            size=11,
            color=base.MUTED,
        )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.35),
        base.CONTENT_W,
        base.Inches(0.55),
        "Salanor peut intégrer n8n, vos APIs et vos scripts. Aegis encadre chaque action sensible dès le premier jour.",
        size=12,
        color=base.MUTED,
    )
    base.add_notes(
        slide,
        "Ne présentez pas deux produits. Automatisation gouvernée = la raison d'acheter.",
    )


def slide_positionnement(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Positionnement",
        "Où Aegis s'insère dans votre paysage",
    )
    base.write_bullets(
        slide,
        base.MARGIN_L,
        base.Inches(2.35),
        base.CONTENT_W,
        base.Inches(3.5),
        [
            "Aegis se place avant l'exécution d'une action sensible : règle, approbation nommée si besoin, registre signé",
            "Ce n'est pas un core banking, un moteur AML, ni un SIEM. Vous gardez vos systèmes métier",
            "Couche de gouvernance et de preuve autour de vos flux : API, orchestration, scripts internes",
            "Production : clés BYOK (clé privée chez vous). Orchestrateur (n8n) : pont Workflow Bridge sans clé privée dans l'outil",
        ],
        size=13,
    )
    base.add_notes(
        slide,
        "Phrase clé : Aegis ne remplace pas vos systèmes. Il empêche le mauvais mouvement et laisse une preuve.",
    )


def slide_ce_que_vous_deployez(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Ce que vous déployez",
        "Solution opérationnelle, pas un projet R&D",
    )
    rows = [
        ("Vous gardez", "Core banking, SI sinistres, SIEM, AML, vos équipes, vos processus"),
        ("Salanor ajoute", "Règles avant action sensible, approbation nommée, alertes, trace signée, export audit"),
        ("Intégration", "n8n, Make, HTTP, SDK TypeScript / Python / Go, format ouvert APS-1"),
        ("Clés", "BYOK en production. Pont orchestrateur pour un pilote rapide"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.78))
        base.write_text(
            slide,
            base.MARGIN_L + base.Inches(0.18),
            base.Inches(y + 0.12),
            base.Inches(1.55),
            base.Inches(0.28),
            head,
            size=11,
            bold=True,
            color=base.TEAL,
        )
        base.write_text(
            slide,
            base.MARGIN_L + base.Inches(1.85),
            base.Inches(y + 0.14),
            base.Inches(6.5),
            base.Inches(0.55),
            body,
            size=12,
            color=base.MUTED,
        )
        y += 0.88
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(6.05),
        base.CONTENT_W,
        base.Inches(0.45),
        "Déploiement sur un flux critique en 4 à 8 semaines. Succès = votre audit valide la preuve sans Salanor dans la salle.",
        size=12,
        color=base.WHITE,
        bold=True,
    )
    base.add_notes(slide, "Critère de succès non négociable. Répétez-le.")


def slide_limites_client(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Limites et règles par client",
        "Aujourd'hui, demain avec vous, scoring sur vos données si vous le souhaitez",
    )
    phases = [
        (
            "Aujourd'hui (livré)",
            [
                "Seuils par montant et par type d'action (ex. virement > X → approbation)",
                "Contexte client complet visible par l'approbateur : compte, bénéficiaire, segment",
                "Plusieurs politiques actives en parallèle",
            ],
        ),
        (
            "Phase 2 (déploiement)",
            [
                "Règles par segment client, type de compte, liste bénéficiaires",
                "Champs métier de votre core dans la condition de règle",
            ],
        ),
        (
            "Phase 3 (optionnel)",
            [
                "Modèle de risque sur vos données pour recommander le plafond par client",
                "Le scoring reste chez vous ou se construit en cadrage avec vos équipes risque",
            ],
        ),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.35)
    h = base.Inches(3.15)
    for i, (head, bullets) in enumerate(phases):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(
            slide,
            x + base.Inches(0.15),
            y + base.Inches(0.15),
            w - base.Inches(0.25),
            base.Inches(0.45),
            head,
            size=11,
            bold=True,
            color=base.TEAL,
        )
        base.write_bullets(
            slide,
            x + base.Inches(0.15),
            y + base.Inches(0.62),
            w - base.Inches(0.25),
            base.Inches(2.35),
            bullets,
            size=10,
            color=base.MUTED,
        )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.75),
        base.CONTENT_W,
        base.Inches(0.75),
        "Nous ne prétendons pas avoir votre modèle de risque aujourd'hui. Nous fournissons la couche "
        "d'exécution et de preuve. La personnalisation par client se mappe avec vos équipes paiement et risque.",
        size=11,
        color=base.MUTED,
    )
    base.add_notes(
        slide,
        "Réponse directe à l'objection banque. Honnête = crédible. Ne promettez pas un modèle ML générique.",
    )


def slide_fonctionnement(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(slide, "Fonctionnement", "Quatre étapes, une chaîne de preuve")
    steps = [
        ("01", "Raccorder", "n8n, SDK, ou format APS-1"),
        ("02", "Appliquer", "Autoriser, refuser, ou exiger approbation"),
        ("03", "Enregistrer", "Registre signé, lots de témoin"),
        ("04", "Exporter", "Console, vérification, bundle audit"),
    ]
    w = base.Inches(2.05)
    y = base.Inches(2.55)
    h = base.Inches(2.35)
    for i, (num, head, body) in enumerate(steps):
        x = base.MARGIN_L + i * (w + base.Inches(0.18))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(
            slide,
            x + base.Inches(0.12),
            y + base.Inches(0.15),
            base.Inches(0.4),
            base.Inches(0.25),
            num,
            size=11,
            bold=True,
            color=base.TEAL,
        )
        base.write_text(
            slide,
            x + base.Inches(0.12),
            y + base.Inches(0.45),
            w - base.Inches(0.2),
            base.Inches(0.35),
            head,
            size=12,
            bold=True,
        )
        base.write_text(
            slide,
            x + base.Inches(0.12),
            y + base.Inches(0.85),
            w - base.Inches(0.2),
            base.Inches(1.3),
            body,
            size=10,
            color=base.MUTED,
        )
    base.add_notes(slide, "Pas de refonte applicative. On encadre ce qui existe déjà.")


def slide_demo(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Démonstration",
        "Scénario banque : virement sortant au-dessus du plafond",
    )
    base.add_round_card(slide, base.MARGIN_L, base.Inches(2.35), base.CONTENT_W, base.Inches(3.35))
    base.write_text(
        slide,
        base.MARGIN_L + base.Inches(0.25),
        base.Inches(2.55),
        base.Inches(8.0),
        base.Inches(0.45),
        "Cas : workflow tente un virement de 2 500 USD. Règle : au-delà de 1 000 USD, approbation humaine requise.",
        size=13,
        bold=True,
    )
    base.write_bullets(
        slide,
        base.MARGIN_L + base.Inches(0.25),
        base.Inches(3.05),
        base.Inches(8.0),
        base.Inches(2.4),
        [
            "Sans gouvernance : le virement part dès que le workflow s'exécute",
            "Avec Aegis : le flux s'arrête. L'approbateur voit montant, bénéficiaire, contexte",
            "Sans approbation : pas de virement. Chaque étape enregistrée et signée",
            "Même mécanique pour sinistre, KYC, changement de limite",
        ],
        size=12,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(6.0),
        base.CONTENT_W,
        base.Inches(0.35),
        "Console : app.salanor.com · Démo live ou captures selon le format de la réunion",
        size=11,
        color=base.DIM,
    )
    base.add_notes(slide, "Si démo live : Approbations historique, relance n8n, trace, export.")


def slide_approbation_audit(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Approbation et audit",
        "Qui a signé, pas seulement ce qui s'est passé",
    )
    base.write_bullets(
        slide,
        base.MARGIN_L,
        base.Inches(2.35),
        base.Inches(4.4),
        base.Inches(3.5),
        [
            "Alertes : e-mail, Slack, PagerDuty, SMS",
            "Approbateur identifié, horodaté, trace unique",
            "Refus ou expiration : l'opération ne s'exécute pas",
            "Historique complet avec la règle appliquée",
        ],
        size=12,
    )
    base.add_round_card(slide, base.Inches(5.15), base.Inches(2.35), base.Inches(3.95), base.Inches(2.8))
    base.write_text(
        slide,
        base.Inches(5.35),
        base.Inches(2.55),
        base.Inches(3.55),
        base.Inches(0.35),
        "Exports audit",
        size=12,
        bold=True,
        color=base.TEAL,
    )
    base.write_bullets(
        slide,
        base.Inches(5.35),
        base.Inches(2.95),
        base.Inches(3.55),
        base.Inches(2.0),
        [
            "Bundle par période, hash d'intégrité",
            "Correspondance SOC 2 et EU AI Act (aide doc., pas certification Salanor)",
            "Relecture pas à pas dans la console",
        ],
        size=11,
        color=base.MUTED,
    )
    base.add_notes(slide, "Séparer proposé par le système et autorisé par une personne.")


def slide_offre(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Offre de déploiement",
        "4 à 8 semaines · un flux · une preuve que votre audit valide",
    )
    rows = [
        ("Périmètre", "Un processus : virement, sinistre, KYC, changement de limite"),
        ("Livré", "Règles, approbations, registre actif, formation console, export audit"),
        ("Plateforme", "Formule Team à partir de 299 USD / mois"),
        ("Setup", "Forfait selon complexité (orchestrateur seul vs API métier + BYOK)"),
        ("Succès", "Opération sensible approuvée par un humain nommé, trace vérifiable par votre équipe risque"),
    ]
    y = 2.35
    for head, body in rows:
        base.add_round_card(slide, base.MARGIN_L, base.Inches(y), base.CONTENT_W, base.Inches(0.72))
        base.write_text(
            slide,
            base.MARGIN_L + base.Inches(0.2),
            base.Inches(y + 0.12),
            base.Inches(1.4),
            base.Inches(0.28),
            head,
            size=11,
            bold=True,
            color=base.TEAL,
        )
        base.write_text(
            slide,
            base.MARGIN_L + base.Inches(1.75),
            base.Inches(y + 0.14),
            base.Inches(6.5),
            base.Inches(0.45),
            body,
            size=12,
            color=base.MUTED,
        )
        y += 0.82
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(6.35),
        base.CONTENT_W,
        base.Inches(0.3),
        "api.salanor.com · app.salanor.com · Pas d'engagement pluriannuel pour commencer",
        size=10,
        color=base.DIM,
    )
    base.add_notes(
        slide,
        "Ne dites jamais partenaire de conception. Offre réelle, périmètre fixe, résultat mesurable.",
    )


def slide_discussion(prs) -> None:
    slide = base.blank(prs)
    base.slide_header(
        slide,
        "Prochaine étape",
        "Une question, un cas concret, ou envie d'en savoir plus ? Prenons rendez-vous.",
    )
    options = [
        (
            "15 minutes",
            "Présentation courte, réponses à vos questions, aperçu console ou démo live",
        ),
        (
            "45 minutes",
            "Cadrage avec ops, risque ou IT : un flux sensible, règles, approbateurs, critère de succès",
        ),
        (
            "Sur demande",
            "Exemple d'export audit, fiche une page, ou démo sur un scénario banque / assurance",
        ),
    ]
    w = base.Inches(2.75)
    y = base.Inches(2.45)
    h = base.Inches(2.35)
    for i, (head, body) in enumerate(options):
        x = base.MARGIN_L + i * (w + base.Inches(0.22))
        base.add_round_card(slide, x, y, w, h)
        base.write_text(
            slide,
            x + base.Inches(0.18),
            y + base.Inches(0.22),
            w - base.Inches(0.3),
            base.Inches(0.45),
            head,
            size=13,
            bold=True,
            color=base.TEAL,
        )
        base.write_text(
            slide,
            x + base.Inches(0.18),
            y + base.Inches(0.72),
            w - base.Inches(0.3),
            base.Inches(1.45),
            body,
            size=11,
            color=base.MUTED,
        )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.15),
        base.CONTENT_W,
        base.Inches(0.55),
        "Contactez-moi directement ou via M. Yassine. Nous fixons un créneau et repartons avec un "
        "périmètre clair si un déploiement a du sens pour vous.",
        size=12,
        color=base.MUTED,
    )
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(5.85),
        base.CONTENT_W,
        base.Inches(0.45),
        "contact@salanor.com · partners@salanor.com · app.salanor.com",
        size=13,
        color=base.WHITE,
        bold=True,
    )
    base.add_notes(
        slide,
        "Deck partagé : cette slide est le CTA. En présentiel, proposez de fixer la date avant de quitter "
        "la salle. En async, le contact sait exactement quoi demander.",
    )


def slide_contact(prs) -> None:
    slide = base.blank(prs)
    base.add_rect(slide, base.Inches(0), base.Inches(7.44), base.Inches(10), base.Inches(0.06), base.TEAL_DIM)
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(0.55),
        base.CONTENT_W,
        base.Inches(0.28),
        "CONTACT",
        size=9,
        color=base.TEAL,
        bold=True,
    )
    base.write_text(slide, base.MARGIN_L, base.Inches(1.05), base.CONTENT_W, base.Inches(0.55), "Salanor Ltd", size=28, bold=True)
    lines = [
        "Landry Bougang Fotso · Fondateur · Kigali, Rwanda",
        "",
        "www.salanor.com",
        "www.salanor.com/products/aegis",
        "app.salanor.com",
        "",
        "contact@salanor.com · partners@salanor.com",
    ]
    y = 1.85
    for line in lines:
        if line:
            base.write_text(
                slide,
                base.MARGIN_L,
                base.Inches(y),
                base.CONTENT_W,
                base.Inches(0.35),
                line,
                size=13,
                color=base.MUTED if "@" in line or "www" in line else base.WHITE,
            )
        y += 0.42 if line else 0.2
    base.write_text(
        slide,
        base.MARGIN_L,
        base.Inches(6.5),
        base.CONTENT_W,
        base.Inches(0.3),
        "Gouvernance et automatisation · Banque et assurance · Confidentiel",
        size=9,
        color=base.DIM,
    )
    base.add_notes(slide, "Remerciez M. Yassine. Proposez une intro ou une démo live de 15 minutes.")


def build() -> Path:
    prs = base.Presentation()
    prs.slide_width = base.Inches(10)
    prs.slide_height = base.Inches(7.5)

    slide_title(prs)
    slide_pourquoi_maintenant(prs)
    slide_probleme(prs)
    slide_systemes_ok(prs)
    slide_ce_que_vous_gagnez(prs)
    slide_automatisation_gouvernee(prs)
    slide_positionnement(prs)
    slide_ce_que_vous_deployez(prs)
    slide_limites_client(prs)
    slide_fonctionnement(prs)
    slide_demo(prs)
    slide_approbation_audit(prs)
    slide_offre(prs)
    slide_discussion(prs)
    slide_contact(prs)

    OUT_REPO.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT_REPO))

    if OUT_YASSINE.parent.exists():
        shutil.copy2(OUT_REPO, OUT_YASSINE)

    return OUT_REPO


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path}")
    if OUT_YASSINE.parent.exists():
        print(f"Copied to {OUT_YASSINE}")
