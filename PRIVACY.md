# Privacy Policy / Politique de confidentialité

**ChatLLM Exporter (Copilot, Gemini, Claude)** — Chrome extension (Manifest V3)
Last updated / Dernière mise à jour : 2026-10-10

---

## 🇬🇧 English

### Summary

**ChatLLM Exporter does not collect, transmit, share or sell any user data.**
All processing happens locally inside your browser, on your own device.

### What the extension does

- The extension reads the conversation **displayed in the page** (on Microsoft
  Copilot, Google Gemini or Anthropic Claude) when — and only when — you click
  the export button, and converts it into a Markdown, PDF, ZIP or text file
  that your browser saves directly to your Downloads folder. The conversation
  content never leaves your device through this extension.
- To capture the whole conversation, the extension automatically scrolls the
  page up and down. This happens in the tab you are viewing, exactly as if you
  scrolled manually.
- Some conversation images are fetched by the extension's service worker to
  work around browser CORS restrictions. These requests go straight from your
  browser to the chat platform the image already came from; nothing is sent to
  the developer, and no third-party server is involved.
- The extension uses `chrome.storage.local` **only** to temporarily pass the
  captured conversation to its own print page when you export to PDF. This data
  is local to your browser and is not synced anywhere.

### Permissions and why

| Permission | Reason |
|---|---|
| `activeTab`, `scripting` | Read the conversation you are viewing, only when you trigger an export |
| Host permissions (claude.ai, gemini.google.com, copilot.com, copilot.microsoft.com, copilot.cloud.microsoft, bing.com) | Access the conversation DOM on the supported chat platforms |
| `downloads` | Save the generated export file (MD/PDF/ZIP/TXT) to your Downloads folder, only on your click |
| `storage`, `unlimitedStorage` | Temporarily hold the captured conversation locally while generating the PDF export (long conversations with many images exceed the default quota) |

### What the extension does NOT do

- No analytics, no telemetry, no trackers, no advertising
- No accounts, no sign-in, no server operated by the developer
- No sale, transfer or sharing of data with third parties
- No use of data for any purpose other than the export you requested

### Source code

The extension is fully open source:
[github.com/tristandatascience/export_llmchat_plugin_chrome](https://github.com/tristandatascience/export_llmchat_plugin_chrome)
— you can verify every statement above in the code.

### Contact

Questions about this policy? Open an issue on
[GitHub](https://github.com/tristandatascience/export_llmchat_plugin_chrome/issues).

---

## 🇫🇷 Français

### Résumé

**ChatLLM Exporter ne collecte, ne transmet, ne partage ni ne vend aucune
donnée utilisateur.** Tout le traitement se fait localement dans votre
navigateur, sur votre propre appareil.

### Ce que fait l'extension

- L'extension lit la conversation **affichée dans la page** (sur Microsoft
  Copilot, Google Gemini ou Anthropic Claude) lorsque — et seulement lorsque —
  vous cliquez sur le bouton d'export, et la convertit en fichier Markdown,
  PDF, ZIP ou texte que votre navigateur enregistre directement dans votre
  dossier Téléchargements. Le contenu de la conversation ne quitte jamais votre
  appareil par cette extension.
- Pour capturer la conversation entière, l'extension fait défiler la page
  automatiquement de haut en bas. Cela se produit dans l'onglet que vous
  consultez, exactement comme si vous défiliez manuellement.
- Certaines images de la conversation sont récupérées par le service worker de
  l'extension pour contourner les restrictions CORS du navigateur. Ces requêtes
  vont directement de votre navigateur vers la plateforme de chat d'où provient
  déjà l'image ; rien n'est envoyé au développeur et aucun serveur tiers n'est
  impliqué.
- L'extension utilise `chrome.storage.local` **uniquement** pour transmettre
  temporairement la conversation capturée à sa propre page d'impression lors
  d'un export PDF. Ces données sont locales à votre navigateur et ne sont
  synchronisées nulle part.

### Permissions et raisons

| Permission | Raison |
|---|---|
| `activeTab`, `scripting` | Lire la conversation consultée, uniquement quand vous déclenchez un export |
| Permissions d'hôtes (claude.ai, gemini.google.com, copilot.com, copilot.microsoft.com, copilot.cloud.microsoft, bing.com) | Accéder au DOM des conversations sur les plateformes supportées |
| `downloads` | Enregistrer le fichier d'export généré (MD/PDF/ZIP/TXT) dans votre dossier Téléchargements, uniquement à votre clic |
| `storage`, `unlimitedStorage` | Contenir temporairement la conversation capturée localement pendant la génération de l'export PDF (les longues conversations riches en images dépassent le quota par défaut) |

### Ce que l'extension ne fait PAS

- Aucune mesure d'audience, télémétrie, traceur ou publicité
- Aucun compte, aucune connexion, aucun serveur opéré par le développeur
- Aucune vente, cession ou partage de données à des tiers
- Aucune utilisation des données pour un autre but que l'export demandé

### Code source

L'extension est entièrement open source :
[github.com/tristandatascience/export_llmchat_plugin_chrome](https://github.com/tristandatascience/export_llmchat_plugin_chrome)
— vous pouvez vérifier chacune des affirmations ci-dessus dans le code.

### Contact

Une question sur cette politique ? Ouvrez un ticket sur
[GitHub](https://github.com/tristandatascience/export_llmchat_plugin_chrome/issues).
