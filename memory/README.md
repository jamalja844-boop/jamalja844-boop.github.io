# Geheugen van het AI-team

Gedeeld geheugen voor alle agents. Protocol: skill `memory-protocol`. Toegang (need-to-know): `memory/acl.json`, afgedwongen door `.claude/hooks/memory_acl.py`.

| Map | Inhoud | In git? |
|---|---|---|
| `company/` | Bedrijfskennis (alleen openbare, niet-gevoelige feiten) | ja |
| `knowledge/` | `lessons.md` (gedeelde lessen); `errors.jsonl` (foutregistratie) | lessons ja, errors nee |
| `projects/` | Projectplannen en status | nee (lokaal) |
| `tasks/` | Taakgeschiedenis: pipelines en taakborden | nee (lokaal) |
| `messages/` | Agentcommunicatie | nee (lokaal) |
| `approvals/` | Goedkeuringsverzoeken (human-in-the-loop) | nee (lokaal) |
| `hr/`, `finance/`, `customers/` | Vertrouwelijk | nee (lokaal) |

**Let op:** deze repository is een openbare GitHub Pages-site. Vertrouwelijke en run-time mappen staan daarom in `.gitignore`. Cloudsessies zijn tijdelijk: wil je lokaal geheugen bewaren, kopieer het dan naar een privé-opslag (bijv. Google Drive) of een privé-repository.
