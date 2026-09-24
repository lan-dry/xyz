# Pharmacy platform documents (Word)

Client-ready `.docx` exports of the markdown specs. Regenerate after editing the source files in `docs/`.

| Word file | Source markdown |
|-----------|-----------------|
| `SAL-PHARM-SRS-001-v2.0-Online-Pharmacy-SRS.docx` | `docs/PHARMACY-ONLINE-PLATFORM-SRS.md` |
| `SAL-PHARM-QT-001-Online-Pharmacy-Quotation.docx` | `docs/PHARMACY-ONLINE-PLATFORM-QUOTE.md` |
| `SAL-PHARM-SOW-001-Online-Pharmacy-Agreement.docx` | `docs/PHARMACY-ONLINE-PLATFORM-SOW.md` |
| `PHARMACY-ONLINE-ORDER-PLATFORM-SPEC-Superseded.docx` | `docs/PHARMACY-ONLINE-ORDER-PLATFORM-SPEC.md` (pointer only) |

Regenerate:

```powershell
python docs/tools/pharmacy_md_to_docx.py
```

Requires `python-docx` (`pip install python-docx`).

Before sending for signature, open the SOW in Word and fill blank fields (TIN, addresses, dates, signatures). Attach or print the SRS and Quotation with the signed SOW.
